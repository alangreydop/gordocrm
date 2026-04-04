import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const createJobSchema = z.object({
  clientId: z.string().uuid(),
  briefText: z.string().optional(),
  platform: z
    .enum(['instagram', 'tiktok', 'amazon_pdp', 'paid_ads'])
    .optional(),
  type: z.enum(['image', 'video']).optional(),
});

const updateJobSchema = z.object({
  status: z
    .enum(['pending', 'processing', 'completed', 'failed', 'delivered'])
    .optional(),
  briefText: z.string().optional(),
  platform: z
    .enum(['instagram', 'tiktok', 'amazon_pdp', 'paid_ads'])
    .optional(),
  type: z.enum(['image', 'video']).optional(),
});

export const jobRoutes = new Hono<AppContext>();

jobRoutes.use('*', requireAuth);

jobRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  if (user.role === 'admin') {
    const rows = await db
      .select({
        id: schema.jobs.id,
        clientId: schema.jobs.clientId,
        clientName: schema.clients.name,
        status: schema.jobs.status,
        briefText: schema.jobs.briefText,
        platform: schema.jobs.platform,
        type: schema.jobs.type,
        createdAt: schema.jobs.createdAt,
        updatedAt: schema.jobs.updatedAt,
      })
      .from(schema.jobs)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
      .orderBy(desc(schema.jobs.createdAt));

    return c.json({ jobs: rows });
  }

  const [clientRecord] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!clientRecord) {
    return c.json({ jobs: [] });
  }

  const rows = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.clientId, clientRecord.id))
    .orderBy(desc(schema.jobs.createdAt));

  return c.json({ jobs: rows });
});

jobRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = c.get('db');

  const [job] = await db
    .select({
      id: schema.jobs.id,
      clientId: schema.jobs.clientId,
      clientName: schema.clients.name,
      status: schema.jobs.status,
      briefText: schema.jobs.briefText,
      platform: schema.jobs.platform,
      type: schema.jobs.type,
      loraModelId: schema.jobs.loraModelId,
      createdAt: schema.jobs.createdAt,
      updatedAt: schema.jobs.updatedAt,
    })
    .from(schema.jobs)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (user.role === 'client') {
    const [clientRecord] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord || job.clientId !== clientRecord.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
  }

  const assets = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.jobId, id));

  return c.json({ job, assets });
});

jobRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const payload = await c.req.json().catch(() => null);
  const body = createJobSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  const db = c.get('db');
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, body.data.clientId))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Client not found' }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.jobs).values({
    id,
    clientId: body.data.clientId,
    briefText: body.data.briefText,
    platform: body.data.platform,
    type: body.data.type,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);

  return c.json({ job }, 201);
});

jobRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const id = c.req.param('id');
  const payload = await c.req.json().catch(() => null);
  const body = updateJobSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  if (Object.keys(body.data).length === 0) {
    return c.json({ error: 'No changes provided' }, 400);
  }

  const db = c.get('db');

  await db
    .update(schema.jobs)
    .set({
      ...body.data,
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, id));

  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({ job });
});
