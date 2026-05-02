import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import { resolveClientBrandFolder } from '../../../lib/client-storage.js';
import { ensureClientBrandFolder } from '../../../lib/client-storage-db.js';
import type { AppContext } from '../../../types/index.js';
import {
  buildPromptFromBrief,
  extractAspectRatio,
  extractBriefImageUrls,
  extractBriefSku,
  parseOptimizedBrief,
  resolveOrchestratorBase,
} from '../../lib/brief-helpers.js';

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
  const db = c.get('db');

  // Client users: scope to their own briefs only
  if (user.role === 'client') {
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!client) {
      return c.json({ briefs: [] });
    }

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
      .where(eq(schema.briefSubmissions.clientId, client.id))
      .orderBy(desc(schema.briefSubmissions.createdAt));

    return c.json({ briefs });
  }

  // Admin: return all briefs
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

  // Allow both admins and clients to create jobs from briefs
  if (user.role !== 'admin' && user.role !== 'client') {
    return c.json({ error: 'Access denied' }, 403);
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
      objective: schema.briefSubmissions.objective,
      style: schema.briefSubmissions.style,
      audience: schema.briefSubmissions.audience,
      cta: schema.briefSubmissions.cta,
      status: schema.briefSubmissions.status,
      clientName: schema.clients.name,
      clientSegment: schema.clients.segment,
      marginProfile: schema.clients.marginProfile,
      optimizedBrief: schema.briefSubmissions.optimizedBrief,
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

  // Clients can only create jobs from their own briefs
  if (user.role === 'client') {
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord || clientRecord.id !== brief.clientId) {
      return c.json({ error: 'Access denied' }, 403);
    }
  }

  const now = new Date();
  const jobId = crypto.randomUUID();
  const briefLabel = brief.tipo === 'ambos' ? 'foto + video' : brief.tipo;

  await db.insert(schema.jobs).values({
    id: jobId,
    clientId: brief.clientId,
    status: 'pending',
    briefText: `[Brief web · ${briefLabel}] ${brief.description ?? ''}`,
    type: mapBriefTypeToJobType(brief.tipo ?? 'foto') || 'image',
    turnaround: 'normal',
    clientSegment: brief.clientSegment ?? null,
    marginProfile: brief.marginProfile ?? null,
    clientGoal: `Responder brief web recibido desde ${brief.email}`,
   internalNotes: `Trabajo creado desde brief ${brief.id}`,
   createdAt: now,
   updatedAt: now,
 });

  // Create notification for the client
  try {
    const [briefClient] = await db
      .select({ userId: schema.clients.userId })
      .from(schema.clients)
      .where(eq(schema.clients.id, brief.clientId))
      .limit(1);
    if (briefClient?.userId) {
      await db.insert(schema.notifications).values({
        id: crypto.randomUUID(),
        userId: briefClient.userId,
        type: 'job_created',
        title: 'Nuevo trabajo creado',
        message: `Se ha creado un trabajo a partir de tu brief: ${briefLabel}`,
        read: 0,
        relatedJobId: jobId,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (e) {
    console.error('[Briefs] Failed to create job notification:', e);
  }

  // Log client activity
  try {
    await db.insert(schema.clientActivities).values({
      id: crypto.randomUUID(),
      clientId: brief.clientId,
      type: 'job_created',
      content: `Trabajo creado desde brief: ${briefLabel}`,
      metadata: JSON.stringify({ jobId, briefId: brief.id, source: 'brief_to_job' }),
      createdAt: now,
    });
  } catch (e) {
    console.error('[Briefs] Failed to log activity:', e);
  }

  await db
    .update(schema.briefSubmissions)
    .set({
      status: brief.status === 'archived' ? 'archived' : 'reviewed',
      updatedAt: now,
    })
    .where(eq(schema.briefSubmissions.id, brief.id));

  // Create production_job in orchestrator (non-blocking on failure)
  let orchestratorJobId: string | null = null;
  let orchestratorRunId: string | null = null;
  const orchestratorBaseUrl = resolveOrchestratorBase(c.env);
  const orchestratorAdminKey = c.env.ORCHESTRATOR_ADMIN_KEY;

  if (orchestratorBaseUrl && orchestratorAdminKey) {
    try {
      const [clientRow] = await db
        .select({
          id: schema.clients.id,
          name: schema.clients.name,
          company: schema.clients.company,
          clientNumber: schema.clients.clientNumber,
          brandFolder: schema.clients.brandFolder,
          externalClientId: schema.clients.externalClientId,
        })
        .from(schema.clients)
        .where(eq(schema.clients.id, brief.clientId))
        .limit(1);
      const storageClient = clientRow
        ? await ensureClientBrandFolder(db, clientRow)
        : null;
      const brandFolder = storageClient
        ? resolveClientBrandFolder(storageClient)
        : brief.clientId;

      const modality = mapBriefTypeToJobType(brief.tipo ?? 'foto') || 'image';
      const ob = parseOptimizedBrief(brief.optimizedBrief);
      const prompt = buildPromptFromBrief(brief, ob);
      const realSku = extractBriefSku(ob);
      const imageUrls = extractBriefImageUrls(ob);
      const aspectRatio = extractAspectRatio(ob);

      const orchestratorUrl = `${orchestratorBaseUrl}/api/jobs`;
      const orchestratorRes = await fetch(orchestratorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': orchestratorAdminKey,
        },
        body: JSON.stringify({
          brandId: brandFolder,
          brandFolder,
          sku: realSku,
          modality,
          prompt,
          imageUrls,
          aspectRatio,
          productName: realSku || prompt.slice(0, 60),
          productDescription: prompt || undefined,
          source: 'crm',
          sourceRef: jobId,
          requiresHitl: true,
          priority: brief.marginProfile === 'alto' ? 1 : 0,
        }),
        redirect: 'manual',
      });

      if (orchestratorRes.ok) {
        const orchestratorData: unknown = await orchestratorRes.json();
        const data = typeof orchestratorData === 'object' && orchestratorData !== null
          ? (orchestratorData as Record<string, unknown>)
          : {};
        orchestratorJobId = String(data.jobId ?? data.id ?? '');
        orchestratorRunId = String(data.runId ?? '');

        if (orchestratorJobId) {
          await db
            .update(schema.jobs)
            .set({
              externalJobId: orchestratorJobId,
              internalNotes: `Trabajo creado desde brief ${brief.id}. Orchestrator: job=${orchestratorJobId}${orchestratorRunId ? ` run=${orchestratorRunId}` : ''}`,
              updatedAt: new Date(),
            })
            .where(eq(schema.jobs.id, jobId));
        }
      } else {
        const errBody = await orchestratorRes.text().catch(() => '');
        console.error(`Orchestrator job creation failed [${orchestratorRes.status}]: ${errBody}`);
          await db
             .update(schema.jobs)
             .set({
              status: 'failed',
              failureReason: 'Orchestrator creation failed: ' + orchestratorRes.status + ' ' + errBody.slice(0, 200),
              internalNotes: 'Trabajo creado desde brief ' + brief.id + '. Orchestrator fallo: ' + orchestratorRes.status + ' ' + errBody.slice(0, 200),
              updatedAt: new Date(),
             })
             .where(eq(schema.jobs.id, jobId));
      }
    } catch (err) {
      console.error('Orchestrator job creation error:', err);
        await db
            .update(schema.jobs)
            .set({
            status: 'failed',
            failureReason: 'Orchestrator error: ' + String(err).slice(0, 200),
            internalNotes: 'Trabajo creado desde brief ' + brief.id + '. Orchestrator error: ' + String(err).slice(0, 200),
            updatedAt: new Date(),
            })
            .where(eq(schema.jobs.id, jobId));
    }
  }

  const [job] = await db
    .select({
      id: schema.jobs.id,
      clientId: schema.jobs.clientId,
      externalJobId: schema.jobs.externalJobId,
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
    orchestratorJobId,
    orchestratorRunId,
  }, 201);
});
