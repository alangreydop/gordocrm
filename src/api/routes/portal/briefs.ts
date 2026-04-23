import { desc, eq } from 'drizzle-orm';
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

const mapBriefTypeToJobType = (tipo: string): 'image' | 'video' | null => {
  if (tipo === 'foto') return 'image';
  if (tipo === 'video') return 'video';
  return null;
};

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
      objective: schema.briefSubmissions.objective,
      hook: schema.briefSubmissions.hook,
      style: schema.briefSubmissions.style,
      audience: schema.briefSubmissions.audience,
      cta: schema.briefSubmissions.cta,
      optimizedBrief: schema.briefSubmissions.optimizedBrief,
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
    .where(eq(schema.briefSubmissions.clientId, client.id))
    .orderBy(desc(schema.briefSubmissions.createdAt))
    .limit(1);

  return c.json({ brief: brief ?? null });
});

briefRoutes.patch('/:id', async (c) => {
  const user = c.get('user');

  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access only' }, 403);
  }

  const payload: unknown = await c.req.json().catch(() => null);
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

briefRoutes.post('/:id/create-job', async (c) => {
  const user = c.get('user');

  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access only' }, 403);
  }

  const id = c.req.param('id');
  const db = c.get('db');

  const [brief] = await db
    .select({
      id: schema.briefSubmissions.id,
      clientId: schema.briefSubmissions.clientId,
      email: schema.briefSubmissions.email,
      tipo: schema.briefSubmissions.contentType,
      description: schema.briefSubmissions.description,
      status: schema.briefSubmissions.status,
      clientName: schema.clients.name,
      clientSegment: schema.clients.segment,
      marginProfile: schema.clients.marginProfile,
    })
    .from(schema.briefSubmissions)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.briefSubmissions.clientId))
    .where(eq(schema.briefSubmissions.id, id))
    .limit(1);

  if (!brief) {
    return c.json({ error: 'Brief not found' }, 404);
  }

  if (!brief.clientId) {
    return c.json({ error: 'Brief must be linked to a client before creating a job' }, 400);
  }

  const now = new Date();
  const jobId = crypto.randomUUID();
  const briefLabel = brief.tipo === 'ambos' ? 'foto + video' : brief.tipo;

  await db.insert(schema.jobs).values({
    id: jobId,
    clientId: brief.clientId,
    status: 'pending',
    briefText: `[Brief web · ${briefLabel}] ${brief.description}`,
    type: mapBriefTypeToJobType(brief.tipo ?? 'foto') || 'image',
    turnaround: 'normal',
    clientSegment: brief.clientSegment ?? null,
    marginProfile: brief.marginProfile ?? null,
    clientGoal: `Responder brief web recibido desde ${brief.email}`,
    internalNotes: `Trabajo creado desde brief ${brief.id}`,
    createdAt: now,
    updatedAt: now,
  });

  await db
    .update(schema.briefSubmissions)
    .set({
      status: brief.status === 'archived' ? 'archived' : 'reviewed',
      updatedAt: now,
    })
    .where(eq(schema.briefSubmissions.id, brief.id));

  const [job] = await db
    .select({
      id: schema.jobs.id,
      clientId: schema.jobs.clientId,
      status: schema.jobs.status,
      briefText: schema.jobs.briefText,
      type: schema.jobs.type,
      turnaround: schema.jobs.turnaround,
      createdAt: schema.jobs.createdAt,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  return c.json({
    ok: true,
    job,
    brief: {
      id: brief.id,
      status: brief.status === 'archived' ? 'archived' : 'reviewed',
      clientId: brief.clientId,
      clientName: brief.clientName ?? null,
    },
  }, 201);
});
