import { count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAdmin } from '../../../lib/auth.js';
import type { AppContext, ClientSubscriptionStatus } from '../../../types/index.js';

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
});

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  subscriptionStatus: z.enum(['active', 'inactive', 'cancelled']).optional(),
});

export const clientRoutes = new Hono<AppContext>();

clientRoutes.use('*', requireAdmin);

clientRoutes.get('/', async (c) => {
  const db = c.get('db');
  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      email: schema.clients.email,
      company: schema.clients.company,
      subscriptionStatus: schema.clients.subscriptionStatus,
      createdAt: schema.clients.createdAt,
      jobCount: count(schema.jobs.id),
    })
    .from(schema.clients)
    .leftJoin(schema.jobs, eq(schema.jobs.clientId, schema.clients.id))
    .groupBy(
      schema.clients.id,
      schema.clients.name,
      schema.clients.email,
      schema.clients.company,
      schema.clients.subscriptionStatus,
      schema.clients.createdAt,
    )
    .orderBy(desc(schema.clients.createdAt));

  return c.json({ clients: rows });
});

clientRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const jobs = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.clientId, id))
    .orderBy(desc(schema.jobs.createdAt));

  return c.json({ client, jobs });
});

clientRoutes.post('/', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const body = createClientSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  const db = c.get('db');
  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.clients).values({
    id,
    name: body.data.name,
    email: body.data.email,
    company: body.data.company ?? null,
    subscriptionStatus: 'inactive',
    createdAt: now,
    updatedAt: now,
  });

  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  return c.json({ client }, 201);
});

clientRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const payload = await c.req.json().catch(() => null);
  const body = updateClientSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  if (Object.keys(body.data).length === 0) {
    return c.json({ error: 'No changes provided' }, 400);
  }

  const db = c.get('db');

  await db
    .update(schema.clients)
    .set({
      ...body.data,
      subscriptionStatus: body.data.subscriptionStatus as
        | ClientSubscriptionStatus
        | undefined,
      updatedAt: new Date(),
    })
    .where(eq(schema.clients.id, id));

  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  return c.json({ client });
});
