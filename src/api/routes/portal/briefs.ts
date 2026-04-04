import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

export const briefRoutes = new Hono<AppContext>();

briefRoutes.use('*', requireAuth);

const briefStatuses = ['new', 'reviewed', 'archived'] as const;

const updateBriefSchema = z.object({
  status: z.enum(briefStatuses),
});

briefRoutes.get('/', async (c) => {
  const user = c.get('user');

  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access only' }, 403);
  }

  const db = c.get('db');
  const briefs = await db
    .select({
      id: schema.briefSubmissions.id,
      clientId: schema.briefSubmissions.clientId,
      email: schema.briefSubmissions.email,
      tipo: schema.briefSubmissions.contentType,
      description: schema.briefSubmissions.description,
      status: schema.briefSubmissions.status,
      source: schema.briefSubmissions.source,
      sourcePage: schema.briefSubmissions.sourcePage,
      createdAt: schema.briefSubmissions.createdAt,
      updatedAt: schema.briefSubmissions.updatedAt,
      clientName: schema.clients.name,
      clientCompany: schema.clients.company,
      clientPlan: schema.clients.plan,
      clientSubscriptionStatus: schema.clients.subscriptionStatus,
    })
    .from(schema.briefSubmissions)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.briefSubmissions.clientId))
    .orderBy(desc(schema.briefSubmissions.createdAt));

  return c.json({ briefs });
});

briefRoutes.get('/latest', async (c) => {
  const user = c.get('user');

  if (user.role !== 'client') {
    return c.json({ error: 'Client access only' }, 403);
  }

  const db = c.get('db');
  const [client] = await db
    .select({
      id: schema.clients.id,
      email: schema.clients.email,
    })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!client) {
    return c.json({ brief: null });
  }

  const emailClauses = [client.email, user.email]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .map((value) => eq(schema.briefSubmissions.email, value as string));

  const emailFallbackClause =
    emailClauses.length === 0
      ? null
      : emailClauses.length === 1
        ? emailClauses[0]
        : or(...emailClauses);

  const whereClause =
    !emailFallbackClause
      ? eq(schema.briefSubmissions.clientId, client.id)
      : or(
          eq(schema.briefSubmissions.clientId, client.id),
          and(
            isNull(schema.briefSubmissions.clientId),
            emailFallbackClause,
          ),
        );

  const [brief] = await db
    .select({
      id: schema.briefSubmissions.id,
      email: schema.briefSubmissions.email,
      tipo: schema.briefSubmissions.contentType,
      description: schema.briefSubmissions.description,
      status: schema.briefSubmissions.status,
      source: schema.briefSubmissions.source,
      sourcePage: schema.briefSubmissions.sourcePage,
      createdAt: schema.briefSubmissions.createdAt,
      updatedAt: schema.briefSubmissions.updatedAt,
    })
    .from(schema.briefSubmissions)
    .where(whereClause)
    .orderBy(desc(schema.briefSubmissions.createdAt))
    .limit(1);

  return c.json({ brief: brief ?? null });
});

briefRoutes.patch('/:id', async (c) => {
  const user = c.get('user');

  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access only' }, 403);
  }

  const payload = await c.req.json().catch(() => null);
  const body = updateBriefSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid brief payload', details: body.error.issues }, 400);
  }

  const id = c.req.param('id');
  const db = c.get('db');

  const [existing] = await db
    .select({ id: schema.briefSubmissions.id })
    .from(schema.briefSubmissions)
    .where(eq(schema.briefSubmissions.id, id))
    .limit(1);

  if (!existing) {
    return c.json({ error: 'Brief not found' }, 404);
  }

  await db
    .update(schema.briefSubmissions)
    .set({
      status: body.data.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.briefSubmissions.id, id));

  return c.json({ ok: true });
});
