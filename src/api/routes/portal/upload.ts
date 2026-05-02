import { and, count, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { schema } from "../../../../db/index.js";
import { requireAuth } from "../../../lib/auth.js";
import { syncClientDatasetStatus } from "../../../lib/brand-assets-readiness.js";
import {
  enqueueBrandDnaCaptureIfReady,
  processPendingBrandCaptures,
} from "../../../lib/brand-dna-capture.js";
import {
  buildBrandAssetR2Key,
  buildJobInputR2Key,
  buildTempR2Key,
  resolveClientBrandFolder,
  sha256Hex,
} from "../../../lib/client-storage.js";
import { ensureClientBrandFolder } from "../../../lib/client-storage-db.js";
import type { AppContext } from "../../../types/index.js";

export const uploadRoutes = new Hono<AppContext>();

uploadRoutes.use("*", requireAuth);

// Upload limits per user requirements: max 5 images per SKU, max 20MB each
const LIMITS = {
  maxFileSize: 20 * 1024 * 1024, // 20 MB per file
  maxFilesPerJob: 5,
  maxFilesPerClient: 500,
  maxStoragePerClient: 2 * 1024 * 1024 * 1024, // 2 GB per client
  maxStorageGlobal: 9 * 1024 * 1024 * 1024, // 9 GB global
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "font/woff",
    "font/woff2",
    "font/ttf",
    "font/otf",
    "application/x-font-ttf",
    "application/x-font-otf",
    "application/font-woff",
    "application/font-woff2",
  ],
};

const VALID_CATEGORIES = ["inputs", "assets"] as const;
const VALID_ASSET_TYPES = [
  "logo",
  "typography",
  "font_file",
  "palette",
  "identity_manual",
  "iconography",
  "other",
] as const;

type UploadCategory = (typeof VALID_CATEGORIES)[number];
type AssetType = (typeof VALID_ASSET_TYPES)[number];

// Temporary upload for pre-brief photos (no job required)
uploadRoutes.post("/temp", async (c) => {
  const user = c.get("user");
  const db = c.get("db");

  // Resolve clientId
  let clientId: string;
  if (user.role === "client") {
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);
    if (!clientRecord) return c.json({ error: "Client not found" }, 404);
    clientId = clientRecord.id;
  } else {
    const queryClientId = c.req.query("clientId");
    if (!queryClientId) return c.json({ error: "clientId required" }, 400);
    clientId = queryClientId;
  }

  const formData = await c.req.formData();
  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return c.json({ error: "No file provided" }, 400);
  }
  const file = fileEntry as File;

  if (!LIMITS.allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type" }, 400);
  }
  if (file.size > LIMITS.maxFileSize) {
    return c.json({ error: "File too large. Max 20MB" }, 400);
  }

  const [clientRecord] = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      company: schema.clients.company,
      clientNumber: schema.clients.clientNumber,
      brandFolder: schema.clients.brandFolder,
      externalClientId: schema.clients.externalClientId,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);
  if (!clientRecord) return c.json({ error: "Client record not found" }, 404);

  const storageClient = await ensureClientBrandFolder(db, clientRecord);
  const resolvedBrandFolder = resolveClientBrandFolder(storageClient);

  const timestamp = Date.now();
  const r2Key = buildTempR2Key(resolvedBrandFolder, timestamp, file.name);

  const bucket = c.env.BRANDS || c.env.ASSETS;
  const publicUrl = c.env.R2_PUBLIC_URL;
  if (!bucket) return c.json({ error: "R2 bucket not configured" }, 500);

  try {
    const buffer = await file.arrayBuffer();
    await bucket.put(r2Key, buffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        source: "crm_temp_upload",
        clientId,
        brandFolder: resolvedBrandFolder,
      },
    });
  } catch (err) {
    console.error("R2 temp upload failed:", err);
    return c.json({ error: "Upload failed" }, 500);
  }

  const deliveryUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${r2Key}`
    : `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.env.R2_BUCKET_NAME}/${r2Key}`;

  return c.json({ deliveryUrl, storagePath: r2Key }, 201);
});

// GET quota for current client
uploadRoutes.get("/quota", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const queryClientId = c.req.query("clientId");

  let clientId: string;

  if (user.role === "admin" && queryClientId) {
    clientId = queryClientId;
  } else {
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
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

// ── Brand-assets upload (no job required) ──

uploadRoutes.post("/brand-assets", async (c) => {
  const user = c.get("user");
  const db = c.get("db");

  // Resolve clientId
  let clientId: string;

  if (user.role === "client") {
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
    }
    clientId = clientRecord.id;
  } else {
    // Admin must supply clientId
    const queryClientId = c.req.query("clientId");
    if (!queryClientId) {
      return c.json({ error: "clientId query param required for admin" }, 400);
    }
    clientId = queryClientId;
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const fileEntry = formData.get("file");

  if (!fileEntry || typeof fileEntry === "string") {
    return c.json({ error: "No file provided" }, 400);
  }

  const file = fileEntry as File;

  // Parse parameters
  const assetTypeRaw = formData.get("asset_type") as string | null;
  const sku = (formData.get("sku") as string | null) || "brand-general";

  // Validate asset_type
  const assetType: AssetType = VALID_ASSET_TYPES.includes(
    assetTypeRaw as AssetType,
  )
    ? (assetTypeRaw as AssetType)
    : "other";

  // Fetch client info for brand folder name
  const [clientRecord] = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      company: schema.clients.company,
      clientNumber: schema.clients.clientNumber,
      brandFolder: schema.clients.brandFolder,
      externalClientId: schema.clients.externalClientId,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!clientRecord) {
    return c.json({ error: "Client record not found" }, 404);
  }

  const storageClient = await ensureClientBrandFolder(db, clientRecord);
  const resolvedBrandFolder = resolveClientBrandFolder(storageClient);

  // Validate file type
  if (!LIMITS.allowedTypes.includes(file.type)) {
    return c.json(
      {
        error:
          "Invalid file type. Allowed: jpg, png, webp, svg, pdf, fonts (woff, woff2, ttf, otf)",
      },
      400,
    );
  }

  // Validate file size (20MB max)
  if (file.size > LIMITS.maxFileSize) {
    return c.json({ error: "File too large. Max 20MB" }, 400);
  }

  // Check per-client limits (no per-job limit — brand assets are job-independent)
  const clientFileCountResult = await db
    .select({ clientFileCount: count() })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const clientFileCount = clientFileCountResult[0]?.clientFileCount ?? 0;

  if (clientFileCount >= LIMITS.maxFilesPerClient) {
    return c.json(
      {
        error: `Client file limit reached. Max ${LIMITS.maxFilesPerClient} files.`,
      },
      429,
    );
  }

  const clientStorageResult = await db
    .select({
      clientStorage: sql<number>`COALESCE(SUM(${schema.assets.fileSize}), 0)`,
    })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const clientStorage = clientStorageResult[0]?.clientStorage ?? 0;

  if (clientStorage + file.size > LIMITS.maxStoragePerClient) {
    return c.json({ error: "Client storage limit reached." }, 429);
  }

  const globalStorageResult = await db
    .select({
      globalStorage: sql<number>`COALESCE(SUM(${schema.assets.fileSize}), 0)`,
    })
    .from(schema.assets);

  const globalStorage = globalStorageResult[0]?.globalStorage ?? 0;

  if (globalStorage + file.size > LIMITS.maxStorageGlobal) {
    return c.json({ error: "Global storage limit reached." }, 429);
  }

  // Generate R2 key: {client_code}/brand/assets/{type}_{timestamp}_{filename}
  const timestamp = Date.now();
  const r2Key = buildBrandAssetR2Key(
    resolvedBrandFolder,
    assetType,
    timestamp,
    file.name,
  );
  const resolvedCategory = "assets";

  // Upload to R2 (use BRANDS bucket)
  const bucket = c.env.BRANDS || c.env.ASSETS;
  const bucketName = c.env.BRANDS ? "BRANDS" : "ASSETS";
  const publicUrl = c.env.R2_PUBLIC_URL;

  if (!bucket) {
    return c.json({ error: "R2 bucket not configured" }, 500);
  }

  let checksum = "";
  try {
    const buffer = await file.arrayBuffer();
    checksum = await sha256Hex(buffer);
    await bucket.put(r2Key, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        source: "crm_brand_asset_upload",
        clientId,
        brandFolder: resolvedBrandFolder,
        brandAssetType: assetType,
        checksum,
      },
    });
  } catch (err) {
    console.error("R2 upload failed:", err);
    return c.json({ error: "Upload failed" }, 500);
  }

  // Build delivery URL
  const deliveryUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${r2Key}`
    : `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.env.R2_BUCKET_NAME}/${r2Key}`;

  // Determine asset type
  const type = file.type.startsWith("video/") ? "video" : "image";

  // Create asset record with jobId = null (brand assets are job-independent)
  const assetId = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.assets).values({
    id: assetId,
    clientId,
    label: file.name,
    type,
    r2Key,
    deliveryUrl,
    fileSize: file.size,
    status: "pending",
    metadata: JSON.stringify({
      bucket: bucketName,
      contentType: file.type,
      brandAssetType: assetType,
      source: "crm_brand_asset_upload",
      checksum,
      brandFolder: resolvedBrandFolder,
      storageVersion: "client_self_contained_v1",
    }),
    sku,
    category: resolvedCategory,
    createdAt: now,
    updatedAt: now,
  });

  const capture = await enqueueBrandDnaCaptureIfReady(db, clientId, assetId);
  if (capture.enqueued) {
    c.executionCtx.waitUntil(processPendingBrandCaptures(db, c.env, 1));
  }
  const datasetStatus = await syncClientDatasetStatus(db, clientId);

  const [asset] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  return c.json(
    {
      asset,
      deliveryUrl,
      storagePath: r2Key,
      brandFolder: resolvedBrandFolder,
      category: resolvedCategory,
      capture,
      datasetStatus,
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

uploadRoutes.post("/jobs/:id/upload", async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  const jobId = c.req.param("id");

  // Verify job exists
  const [job] = await db
    .select({ id: schema.jobs.id, clientId: schema.jobs.clientId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  // Client can only upload to their own jobs
  if (user.role === "client") {
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord || clientRecord.id !== job.clientId) {
      return c.json({ error: "Access denied" }, 403);
    }
  }

  const clientId = job.clientId;

  // Parse multipart form data
  const formData = await c.req.formData();
  const fileEntry = formData.get("file");

  if (!fileEntry || typeof fileEntry === "string") {
    return c.json({ error: "No file provided" }, 400);
  }

  const file = fileEntry as File;

  // Parse parameters
  const categoryRaw = formData.get("category") as string | null;
  const sku = formData.get("sku") as string | null;
  const assetTypeRaw = formData.get("asset_type") as string | null;
  const platformsRaw = formData.get("platforms") as string | null;

  // Validate category (renamed from 'brand-assets' to 'assets')
  const category: UploadCategory = VALID_CATEGORIES.includes(
    categoryRaw as UploadCategory,
  )
    ? (categoryRaw as UploadCategory)
    : "inputs";

  // Validate asset_type (only for assets)
  let assetType: AssetType = "other";
  if (category === "assets") {
    assetType = VALID_ASSET_TYPES.includes(assetTypeRaw as AssetType)
      ? (assetTypeRaw as AssetType)
      : "other";
  }

  // Platforms: comma-separated string of acronyms (e.g. "AMZ,PDP,IG")
  const platforms = platformsRaw || null;

  // Fetch client info for brand folder name
  const [clientRecord] = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      company: schema.clients.company,
      clientNumber: schema.clients.clientNumber,
      brandFolder: schema.clients.brandFolder,
      externalClientId: schema.clients.externalClientId,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!clientRecord) {
    return c.json({ error: "Client record not found" }, 404);
  }

  const storageClient = await ensureClientBrandFolder(db, clientRecord);
  const resolvedBrandFolder = resolveClientBrandFolder(storageClient);

  // Validate file type
  if (!LIMITS.allowedTypes.includes(file.type)) {
    return c.json(
      {
        error:
          "Invalid file type. Allowed: jpg, png, webp, svg, pdf, fonts (woff, woff2, ttf, otf)",
      },
      400,
    );
  }

  // Validate file size (20MB max)
  if (file.size > LIMITS.maxFileSize) {
    return c.json({ error: "File too large. Max 20MB" }, 400);
  }

  // Check per-job file limit (5 files)
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

  // Check per-client limits
  const clientFileCountResult = await db
    .select({ clientFileCount: count() })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const clientFileCount = clientFileCountResult[0]?.clientFileCount ?? 0;

  if (clientFileCount >= LIMITS.maxFilesPerClient) {
    return c.json(
      {
        error: `Client file limit reached. Max ${LIMITS.maxFilesPerClient} files.`,
      },
      429,
    );
  }

  const clientStorageResult = await db
    .select({
      clientStorage: sql<number>`COALESCE(SUM(${schema.assets.fileSize}), 0)`,
    })
    .from(schema.assets)
    .where(eq(schema.assets.clientId, clientId));

  const clientStorage = clientStorageResult[0]?.clientStorage ?? 0;

  if (clientStorage + file.size > LIMITS.maxStoragePerClient) {
    return c.json({ error: "Client storage limit reached." }, 429);
  }

  const globalStorageResult = await db
    .select({
      globalStorage: sql<number>`COALESCE(SUM(${schema.assets.fileSize}), 0)`,
    })
    .from(schema.assets);

  const globalStorage = globalStorageResult[0]?.globalStorage ?? 0;

  if (globalStorage + file.size > LIMITS.maxStorageGlobal) {
    return c.json({ error: "Global storage limit reached." }, 429);
  }

  // Generate R2 key using canonical client-contained naming.
  // Bucket is named "brands", so keys do NOT start with "brands/"
  const timestamp = Date.now();
  let r2Key: string;
  let resolvedCategory: string;

  if (category === "assets") {
    r2Key = buildBrandAssetR2Key(
      resolvedBrandFolder,
      assetType,
      timestamp,
      file.name,
    );
    resolvedCategory = "assets";
  } else {
    r2Key = buildJobInputR2Key({
      brandFolder: resolvedBrandFolder,
      jobId,
      filename: file.name,
      sku,
      platforms,
    });
    resolvedCategory = "inputs";
  }

  // Upload to R2 (use BRANDS bucket)
  const bucket = c.env.BRANDS || c.env.ASSETS;
  const bucketName = c.env.BRANDS ? "BRANDS" : "ASSETS";
  const publicUrl = c.env.R2_PUBLIC_URL;

  if (!bucket) {
    return c.json({ error: "R2 bucket not configured" }, 500);
  }

  let checksum = "";
  try {
    const buffer = await file.arrayBuffer();
    checksum = await sha256Hex(buffer);
    await bucket.put(r2Key, buffer, {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        source:
          resolvedCategory === "assets"
            ? "crm_job_brand_asset_upload"
            : "crm_job_input_upload",
        clientId,
        jobId,
        brandFolder: resolvedBrandFolder,
        sku: sku ?? "",
        checksum,
      },
    });
  } catch (err) {
    console.error("R2 upload failed:", err);
    return c.json({ error: "Upload failed" }, 500);
  }

  // Build delivery URL
  const deliveryUrl = publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/${r2Key}`
    : `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.env.R2_BUCKET_NAME}/${r2Key}`;

  // Determine asset type
  const type = file.type.startsWith("video/") ? "video" : "image";

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
    status: "pending",
    metadata: JSON.stringify({
      bucket: bucketName,
      contentType: file.type,
      brandAssetType: resolvedCategory === "assets" ? assetType : null,
      source:
        resolvedCategory === "assets"
          ? "crm_job_brand_asset_upload"
          : "crm_job_input_upload",
      checksum,
      brandFolder: resolvedBrandFolder,
      storageVersion: "client_self_contained_v1",
    }),
    sku: sku ?? null,
    category: resolvedCategory,
    createdAt: now,
    updatedAt: now,
  });

  const [asset] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  const capture =
    resolvedCategory === "assets"
      ? await enqueueBrandDnaCaptureIfReady(db, clientId, assetId)
      : null;
  if (capture?.enqueued) {
    c.executionCtx.waitUntil(processPendingBrandCaptures(db, c.env, 1));
  }

  return c.json(
    {
      asset,
      deliveryUrl,
      storagePath: r2Key,
      resolvedBrandFolder,
      category: resolvedCategory,
      capture,
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
