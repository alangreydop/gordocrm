import { and, count, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

export const uploadRoutes = new Hono<AppContext>();

uploadRoutes.use('*', requireAuth);

// Cloudflare R2 free tier limits (conservative for long-term sustainability)
// Ref: https://developers.cloudflare.com/r2/pricing/#r2-pricing
// Free: 10 GB storage, 1M Class A ops, 10M Class B ops, egress free
const LIMITS = {
  maxFileSize: 50 * 1024 * 1024, // 50 MB per file
  maxFilesPerJob: 50,
  maxFilesPerClient: 500,
  maxStoragePerClient: 2 * 1024 * 1024 * 1024, // 2 GB per client
  maxStorageGlobal: 9 * 1024 * 1024 * 1024, // 9 GB global (leave 1 GB headroom below free tier)
  allowedTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'video/mp4',
    'video/quicktime',
  ],
};

// GET quota for current client (or any client if admin)
uploadRoutes.get('/quota', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const queryClientId = c.req.query('clientId');

  let clientId: string;

  if (user.role === 'admin' && queryClientId) {
    clientId = queryClientId;
  } else {
    // Get client record for current user
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord) {
      return c.json({ error: 'Client not found' }, 404);
    }
    clientId = clientRecord.id;
  }

  const fileCountResult = await db
    .select({ fileCount: count() })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const storageResult = await db
    .select({
      totalStorage: sql<number>`COALESCE(SUM(${schema.assets.fileSize}), 0)`,
    })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const fileCount = fileCountResult[0]?.fileCount ?? 0;
  const totalStorage = storageResult[0]?.totalStorage ?? 0;

  return c.json({
    clientId,
    filesUsed: fileCount,
    filesMax: LIMITS.maxFilesPerClient,
    storageUsed: totalStorage,
    storageMax: LIMITS.maxStoragePerClient,
    storageRemaining: Math.max(0, LIMITS.maxStoragePerClient - totalStorage),
  });
});

uploadRoutes.post('/jobs/:id/upload', async (c) => {
  const user = c.get('user');
  const db = c.get('db');
  const jobId = c.req.param('id');
  const bucket = c.env.ASSETS;
  const publicUrl = c.env.R2_PUBLIC_URL;

  if (!bucket) {
    return c.json({ error: 'R2 bucket not configured' }, 500);
  }

  // Verify job exists
  const [job] = await db
    .select({ id: schema.jobs.id, clientId: schema.jobs.clientId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Client can only upload to their own jobs
  if (user.role === 'client') {
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord || clientRecord.id !== job.clientId) {
      return c.json({ error: 'Access denied' }, 403);
    }
  }

  const clientId = job.clientId;

  // Parse multipart form data
  const formData = await c.req.formData();
  const fileEntry = formData.get('file');

  if (!fileEntry || typeof fileEntry === 'string') {
    return c.json({ error: 'No file provided' }, 400);
  }

  const file = fileEntry as File;

  // Validate file type
  if (!LIMITS.allowedTypes.includes(file.type)) {
    return c.json(
      { error: 'Invalid file type. Allowed: jpg, png, webp, mp4, mov' },
      400,
    );
  }

  // Validate file size
  if (file.size > LIMITS.maxFileSize) {
    return c.json({ error: 'File too large. Max 50MB' }, 400);
  }

  // Check per-job file limit
  const jobFileCountResult = await db
    .select({ jobFileCount: count() })
    .from(schema.assets)
    .where(eq(schema.assets.jobId, jobId));

  const jobFileCount = jobFileCountResult[0]?.jobFileCount ?? 0;

  if (jobFileCount >= LIMITS.maxFilesPerJob) {
    return c.json(
      {
        error: `Job file limit reached. Max ${LIMITS.maxFilesPerJob} files per job.`,
      },
      429,
    );
  }

  // Check per-client file limit
  const clientFileCountResult = await db
    .select({ clientFileCount: count() })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const clientFileCount = clientFileCountResult[0]?.clientFileCount ?? 0;

  if (clientFileCount >= LIMITS.maxFilesPerClient) {
    return c.json(
      {
        error: `Client file limit reached. Max ${LIMITS.maxFilesPerClient} files per client.`,
      },
      429,
    );
  }

  // Check per-client storage limit
  const clientStorageResult = await db
    .select({
      clientStorage: sql<number>`COALESCE(SUM(${schema.assets.fileSize}), 0)`,
    })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const clientStorage = clientStorageResult[0]?.clientStorage ?? 0;

  if (clientStorage + file.size > LIMITS.maxStoragePerClient) {
    const remaining = Math.max(
      0,
      LIMITS.maxStoragePerClient - clientStorage,
    );
    return c.json(
      {
        error: `Client storage limit reached. Remaining: ${Math.floor(remaining / (1024 * 1024))} MB.`,
      },
      429,
    );
  }

  // Check global storage limit (protects free tier)
  const globalStorageResult = await db
    .select({
      globalStorage: sql<number>`COALESCE(SUM(${schema.assets.fileSize}), 0)`,
    })
    .from(schema.assets);

  const globalStorage = globalStorageResult[0]?.globalStorage ?? 0;

  if (globalStorage + file.size > LIMITS.maxStorageGlobal) {
    const remaining = Math.max(
      0,
      LIMITS.maxStorageGlobal - globalStorage,
    );
    return c.json(
      {
        error: `Global storage limit reached. Remaining: ${Math.floor(remaining / (1024 * 1024))} MB. Contact admin.`,
      },
      429,
    );
  }

  // Generate R2 key with client-scoped folder structure
  const ext = file.name.split('.').pop() ?? 'bin';
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const r2Key = `clients/${clientId}/jobs/${jobId}/${Date.now()}_${safeName}`;

  // Upload to R2
  try {
    const buffer = await file.arrayBuffer();
    await bucket.put(r2Key, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
    });
  } catch (err) {
    console.error('R2 upload failed:', err);
    return c.json({ error: 'Upload failed' }, 500);
  }

  // Build delivery URL
  const deliveryUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, '')}/${r2Key}`
    : `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.env.R2_BUCKET_NAME}/${r2Key}`;

  // Determine asset type
  const type = file.type.startsWith('video/') ? 'video' : 'image';

  // Create asset record
  const assetId = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.assets).values({
    id: assetId,
    jobId,
    clientId,
    label: file.name,
    type,
    r2Key,
    deliveryUrl,
    fileSize: file.size,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  const [asset] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  return c.json(
    {
      asset,
      deliveryUrl,
      limits: {
        filesUsed: clientFileCount + 1,
        filesMax: LIMITS.maxFilesPerClient,
        storageUsed: clientStorage + file.size,
        storageMax: LIMITS.maxStoragePerClient,
      },
    },
    201,
  );
});
