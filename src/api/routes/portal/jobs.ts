import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import { sendFeedbackConfirmationEmail, sendJobCompletionEmail } from '../../../lib/email.js';
import { resolvePipelineId } from './pipeline-mappings.js';
import type { AppContext } from '../../../types/index.js';

// Helper para crear JWT compatible con AI Engine
async function createAIFngineJWT(user: {
  id: string;
  email: string;
  role: string;
}): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    'raw',
    encoder.encode('gordo-ai-engine-secret-key-2026'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hora
  };

  const signature = await crypto.subtle.sign(
    'HMAC',
    keyData,
    encoder.encode(JSON.stringify(payload)),
  );

  const base64Url = (data: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(data)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = base64Url(encoder.encode(JSON.stringify(payload)));
  const signatureB64 = base64Url(signature);

  return `${header}.${payloadB64}.${signatureB64}`;
}

const jobStatuses = ['pending', 'processing', 'completed', 'failed', 'delivered'] as const;
const jobPlatforms = ['instagram', 'tiktok', 'amazon_pdp', 'paid_ads'] as const;
const jobTypes = ['image', 'video'] as const;
const clientSegments = ['rentable', 'growth', 'premium', 'enterprise'] as const;
const marginProfiles = ['estrecho', 'medio', 'alto'] as const;
const assetDominants = [
  'catalogo',
  'paid_static',
  'pdp_packaging',
  'video_ads',
  'video_edit',
  'mixto',
] as const;
const legalRisks = ['normal', 'alto'] as const;
const turnarounds = ['normal', 'urgente'] as const;
const portabilityOptions = ['si', 'no'] as const;
const structuralDemands = ['normal', 'alta'] as const;
const benchmarkLevels = ['L0', 'L1', 'L2', 'L3'] as const;
const stackLanes = ['A', 'B', 'C', 'D'] as const;
const assetQaStatuses = ['pending', 'approved', 'rejected'] as const;

const optionalNullableString = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  },
  z.union([z.string(), z.null()]).optional(),
);

const optionalInteger = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : value;
}, z.number().int().min(0).optional());

const optionalNullableNumber = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  },
  z.union([z.number().min(0), z.null()]).optional(),
);

const optionalNullableDate = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date;
    }
    return value;
  },
  z.union([z.date(), z.null()]).optional(),
);

const optionalNullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      return value;
    },
    z.union([z.enum(values), z.null()]).optional(),
  );

const createJobSchema = z.object({
  clientId: z.string().uuid(),
  externalJobId: optionalNullableString, // ID en AI Engine
  briefText: optionalNullableString,
  platform: z.enum(jobPlatforms).optional(),
  type: z.enum(jobTypes).optional(),
  dueAt: optionalNullableDate,
  unitsPlanned: optionalInteger,
  unitsConsumed: optionalInteger,
  aiCostEstimated: optionalNullableNumber,
  aiCostReal: optionalNullableNumber,
  grossMarginEstimated: optionalNullableNumber,
  clientSegment: z.enum(clientSegments).optional(),
  marginProfile: z.enum(marginProfiles).optional(),
  assetDominant: z.enum(assetDominants).optional(),
  legalRisk: z.enum(legalRisks).optional(),
  turnaround: z.enum(turnarounds).optional(),
  portabilityRequired: z.enum(portabilityOptions).optional(),
  structuralDemand: z.enum(structuralDemands).optional(),
  benchmarkLevel: z.enum(benchmarkLevels).optional(),
  stackLane: z.enum(stackLanes).optional(),
  stackCandidate1: optionalNullableString,
  stackCandidate2: optionalNullableString,
  stackCandidate3: optionalNullableString,
  stackWinner: optionalNullableString,
  stackSnapshot: optionalNullableString,
  clientGoal: optionalNullableString,
  internalNotes: optionalNullableString,
});

const updateJobSchema = z.object({
  status: z.enum(jobStatuses).optional(),
  externalJobId: optionalNullableString,
  deliveryUrl: optionalNullableString,
  startedAt: optionalNullableDate,
  completedAt: optionalNullableDate,
  failedAt: optionalNullableDate,
  failureReason: optionalNullableString,
  briefText: optionalNullableString,
  platform: optionalNullableEnum(jobPlatforms),
  type: optionalNullableEnum(jobTypes),
  dueAt: optionalNullableDate,
  unitsPlanned: optionalInteger,
  unitsConsumed: optionalInteger,
  aiCostEstimated: optionalNullableNumber,
  aiCostReal: optionalNullableNumber,
  grossMarginEstimated: optionalNullableNumber,
  clientSegment: optionalNullableEnum(clientSegments),
  marginProfile: optionalNullableEnum(marginProfiles),
  assetDominant: optionalNullableEnum(assetDominants),
  legalRisk: optionalNullableEnum(legalRisks),
  turnaround: optionalNullableEnum(turnarounds),
  portabilityRequired: optionalNullableEnum(portabilityOptions),
  structuralDemand: optionalNullableEnum(structuralDemands),
  benchmarkLevel: optionalNullableEnum(benchmarkLevels),
  stackLane: optionalNullableEnum(stackLanes),
  stackCandidate1: optionalNullableString,
  stackCandidate2: optionalNullableString,
  stackCandidate3: optionalNullableString,
  stackWinner: optionalNullableString,
  stackSnapshot: optionalNullableString,
  clientGoal: optionalNullableString,
  internalNotes: optionalNullableString,
});

const createAssetSchema = z.object({
  label: optionalNullableString,
  type: z.enum(jobTypes),
  r2Key: z.string().trim().min(1),
  deliveryUrl: optionalNullableString,
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  metadata: optionalNullableString,
});

const updateAssetSchema = z.object({
  label: optionalNullableString,
  type: optionalNullableEnum(jobTypes),
  r2Key: optionalNullableString,
  deliveryUrl: optionalNullableString,
  status: optionalNullableEnum(['pending', 'approved', 'rejected']),
  metadata: optionalNullableString,
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
        dueAt: schema.jobs.dueAt,
        unitsPlanned: schema.jobs.unitsPlanned,
        unitsConsumed: schema.jobs.unitsConsumed,
        grossMarginEstimated: schema.jobs.grossMarginEstimated,
        clientSegment: schema.jobs.clientSegment,
        marginProfile: schema.jobs.marginProfile,
        turnaround: schema.jobs.turnaround,
        benchmarkLevel: schema.jobs.benchmarkLevel,
        stackLane: schema.jobs.stackLane,
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
    .select({
      id: schema.jobs.id,
      clientId: schema.jobs.clientId,
      status: schema.jobs.status,
      briefText: schema.jobs.briefText,
      platform: schema.jobs.platform,
      type: schema.jobs.type,
      dueAt: schema.jobs.dueAt,
      unitsPlanned: schema.jobs.unitsPlanned,
      unitsConsumed: schema.jobs.unitsConsumed,
      createdAt: schema.jobs.createdAt,
      updatedAt: schema.jobs.updatedAt,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.clientId, clientRecord.id))
    .orderBy(desc(schema.jobs.createdAt));

  // Get asset counts for each job (approved assets only)
  const jobIds = rows.map((row) => row.id);
  let assetCounts: { jobId: string; count: number }[] = [];
  if (jobIds.length > 0) {
    assetCounts = await db
      .select({
        jobId: schema.assets.jobId,
        count: count(schema.assets.id),
      })
      .from(schema.assets)
      .where(and(eq(schema.assets.status, 'approved'), inArray(schema.assets.jobId, jobIds)))
      .groupBy(schema.assets.jobId);
  }

  const jobsWithAssets = rows.map((job) => ({
    ...job,
    assetsCount: assetCounts.find((ac) => ac.jobId === job.id)?.count ?? 0,
  }));

  return c.json({ jobs: jobsWithAssets });
});

jobRoutes.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = c.get('db');

  const [jobRow] = await db
    .select({
      id: schema.jobs.id,
      clientId: schema.jobs.clientId,
      clientName: schema.clients.name,
      status: schema.jobs.status,
      briefText: schema.jobs.briefText,
      platform: schema.jobs.platform,
      type: schema.jobs.type,
      loraModelId: schema.jobs.loraModelId,
      dueAt: schema.jobs.dueAt,
      unitsPlanned: schema.jobs.unitsPlanned,
      unitsConsumed: schema.jobs.unitsConsumed,
      aiCostEstimated: schema.jobs.aiCostEstimated,
      aiCostReal: schema.jobs.aiCostReal,
      grossMarginEstimated: schema.jobs.grossMarginEstimated,
      clientSegment: schema.jobs.clientSegment,
      marginProfile: schema.jobs.marginProfile,
      assetDominant: schema.jobs.assetDominant,
      legalRisk: schema.jobs.legalRisk,
      turnaround: schema.jobs.turnaround,
      portabilityRequired: schema.jobs.portabilityRequired,
      structuralDemand: schema.jobs.structuralDemand,
      benchmarkLevel: schema.jobs.benchmarkLevel,
      stackLane: schema.jobs.stackLane,
      stackCandidate1: schema.jobs.stackCandidate1,
      stackCandidate2: schema.jobs.stackCandidate2,
      stackCandidate3: schema.jobs.stackCandidate3,
      stackWinner: schema.jobs.stackWinner,
      stackSnapshot: schema.jobs.stackSnapshot,
      clientGoal: schema.jobs.clientGoal,
      internalNotes: schema.jobs.internalNotes,
      createdAt: schema.jobs.createdAt,
      updatedAt: schema.jobs.updatedAt,
    })
    .from(schema.jobs)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!jobRow) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (user.role === 'client') {
    const [clientRecord] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord || jobRow.clientId !== clientRecord.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
  }

  const assets = await db
    .select({
      id: schema.assets.id,
      jobId: schema.assets.jobId,
      label: schema.assets.label,
      type: schema.assets.type,
      r2Key: schema.assets.r2Key,
      deliveryUrl: schema.assets.deliveryUrl,
      status: schema.assets.status,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.assets)
    .where(
      user.role === 'admin'
        ? eq(schema.assets.jobId, id)
        : and(
            eq(schema.assets.jobId, id),
            or(eq(schema.assets.status, 'approved'), isNull(schema.assets.status)),
          ),
    )
    .orderBy(desc(schema.assets.createdAt));

  if (user.role === 'admin') {
    return c.json({ job: jobRow, assets });
  }

  const clientJob = {
    id: jobRow.id,
    clientId: jobRow.clientId,
    clientName: jobRow.clientName,
    status: jobRow.status,
    briefText: jobRow.briefText,
    platform: jobRow.platform,
    type: jobRow.type,
    dueAt: jobRow.dueAt,
    unitsPlanned: jobRow.unitsPlanned,
    unitsConsumed: jobRow.unitsConsumed,
    createdAt: jobRow.createdAt,
    updatedAt: jobRow.updatedAt,
  };

  return c.json({ job: clientJob, assets });
});

jobRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const payload: unknown = await c.req.json().catch(() => null);
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

  // Tool 1: Auto-select pipeline from mapping table
  const mapping = await resolvePipelineId(
    db,
    body.data.clientSegment ?? client.segment,
    body.data.type,
    body.data.platform,
  );

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.jobs).values({
    id,
    clientId: body.data.clientId,
    pipelineId: mapping?.pipelineId ?? null,
    briefText: body.data.briefText ?? null,
    platform: body.data.platform ?? null,
    type: body.data.type ?? null,
    dueAt: body.data.dueAt ?? null,
    unitsPlanned: body.data.unitsPlanned ?? 0,
    unitsConsumed: body.data.unitsConsumed ?? 0,
    aiCostEstimated: body.data.aiCostEstimated ?? null,
    aiCostReal: body.data.aiCostReal ?? null,
    grossMarginEstimated: body.data.grossMarginEstimated ?? null,
    clientSegment: body.data.clientSegment ?? client.segment ?? null,
    marginProfile: body.data.marginProfile ?? null,
    assetDominant: body.data.assetDominant ?? null,
    legalRisk: body.data.legalRisk ?? null,
    turnaround: body.data.turnaround ?? null,
    portabilityRequired: body.data.portabilityRequired ?? null,
    structuralDemand: body.data.structuralDemand ?? null,
    benchmarkLevel: body.data.benchmarkLevel ?? null,
    stackLane: body.data.stackLane ?? null,
    stackCandidate1: body.data.stackCandidate1 ?? null,
    stackCandidate2: body.data.stackCandidate2 ?? null,
    stackCandidate3: body.data.stackCandidate3 ?? null,
    stackWinner: body.data.stackWinner ?? null,
    stackSnapshot: body.data.stackSnapshot ?? null,
    clientGoal: body.data.clientGoal ?? null,
    internalNotes: body.data.internalNotes ?? null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);

  return c.json({ job }, 201);
});

// Endpoint para crear job en AI Engine desde CRM
jobRoutes.post('/:id/execute-ai', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const id = c.req.param('id');
  const db = c.get('db');

  // Obtener job con detalles del pipeline y brand graph del cliente
  const [jobWithClient] = await db
    .select({
      job: {
        id: schema.jobs.id,
        clientId: schema.jobs.clientId,
        pipelineId: schema.jobs.pipelineId,
        stackWinner: schema.jobs.stackWinner,
        briefText: schema.jobs.briefText,
        type: schema.jobs.type,
        platform: schema.jobs.platform,
      },
      clientBrandGraph: schema.clients.brandGraph,
    })
    .from(schema.jobs)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!jobWithClient) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const job = jobWithClient.job;

  // Resolve pipeline_id: stored on job > resolve at execution time > fallback 1
  let pipelineId = job.pipelineId;
  if (!pipelineId) {
    const mapping = await resolvePipelineId(db, undefined, job.type, job.platform);
    pipelineId = mapping?.pipelineId ?? '1';
  }

  // Crear job en AI Engine
  const aiEngineUrlBase =
    (c.env && 'AI_ENGINE_URL' in c.env ? c.env.AI_ENGINE_URL : undefined) ??
    'http://localhost:8000';
  const aiEngineUrl = `${aiEngineUrlBase}/api/v1/jobs`;

  // Obtener token JWT del CRM
  const token = await createAIFngineJWT(user);

  const response = await fetch(aiEngineUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      pipeline_id: pipelineId,
      name: `Job ${id} - ${job.briefText?.slice(0, 50) || 'Sin brief'}`,
      description: job.briefText || null,
      input_data: {
        crm_job_id: job.id,
        client_id: job.clientId,
        job_type: job.type,
        brand_graph: jobWithClient.clientBrandGraph
          ? JSON.parse(jobWithClient.clientBrandGraph)
          : undefined,
      },
      external_job_id: job.id, // Referencia al CRM
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Error desconocido' }));
    return c.json({ error: `AI Engine error: ${error instanceof Error ? error.message : (error as { error?: string }).error || 'Unknown'}` }, 500);
  }

  const aiJob: any = await response.json();

  // Actualizar job en CRM con external_job_id
  await db
    .update(schema.jobs)
    .set({
      externalJobId: String(aiJob.id),
      status: 'processing',
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, id));

  return c.json({
    ok: true,
    ai_job_id: aiJob.id,
    message: 'Job enviado a AI Engine para ejecución',
  });
});

jobRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const id = c.req.param('id');
  const payload: unknown = await c.req.json().catch(() => null);
  const body = updateJobSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  if (Object.keys(body.data).length === 0) {
    return c.json({ error: 'No changes provided' }, 400);
  }

  const db = c.get('db');

  const updates: Record<string, unknown> = {
    ...body.data,
    updatedAt: new Date(),
  };

  // Asegurar que los campos enum se manejan correctamente
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.platform !== undefined) updates.platform = body.data.platform;
  if (body.data.clientSegment !== undefined) updates.clientSegment = body.data.clientSegment;
  if (body.data.marginProfile !== undefined) updates.marginProfile = body.data.marginProfile;
  if (body.data.assetDominant !== undefined) updates.assetDominant = body.data.assetDominant;
  if (body.data.legalRisk !== undefined) updates.legalRisk = body.data.legalRisk;
  if (body.data.turnaround !== undefined) updates.turnaround = body.data.turnaround;
  if (body.data.portabilityRequired !== undefined)
    updates.portabilityRequired = body.data.portabilityRequired;
  if (body.data.structuralDemand !== undefined)
    updates.structuralDemand = body.data.structuralDemand;
  if (body.data.benchmarkLevel !== undefined) updates.benchmarkLevel = body.data.benchmarkLevel;
  if (body.data.stackLane !== undefined) updates.stackLane = body.data.stackLane;

  // Get old job to check status change
  const [oldJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
  const oldStatus = oldJob?.status;

  await db.update(schema.jobs).set(updates).where(eq(schema.jobs.id, id));

  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Send email and notification if status changed to completed or delivered
  const env = c.env;
  if (
    body.data.status &&
    ['completed', 'delivered'].includes(body.data.status) &&
    oldStatus !== body.data.status
  ) {
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, job.clientId))
      .limit(1);

    if (client && client.email) {
      // Send email in background (don't await)
      sendJobCompletionEmail(env, {
        clientEmail: client.email,
        clientName: client.name || 'Cliente',
        jobBrief: job.briefText || 'Trabajo',
        jobId: job.id,
        jobPlatform: job.platform,
        jobType: job.type,
        portalUrl: 'https://crm.grandeandgordo.com',
      }).catch((err) => console.error('Failed to send job completion email:', err));

      // Create in-app notification
      const now = new Date();
      await db
        .insert(schema.notifications)
        .values({
          id: crypto.randomUUID(),
          userId: client.userId!,
          type: 'job_completed',
          title: '¡Trabajo completado!',
          message: `Tu trabajo "${job.briefText?.slice(0, 40) || 'Trabajo'}" está listo para descargar.`,
          relatedJobId: job.id,
          read: 0,
          createdAt: now,
        })
        .catch((err) => console.error('Failed to create notification:', err));
    }
  }

  return c.json({ job });
});

jobRoutes.post('/:id/assets', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const jobId = c.req.param('id');
  const payload: unknown = await c.req.json().catch(() => null);
  const body = createAssetSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid asset payload', details: body.error.issues }, 400);
  }

  const db = c.get('db');
  const [job] = await db
    .select({ id: schema.jobs.id, clientId: schema.jobs.clientId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const assetId = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.assets).values({
    id: assetId,
    jobId,
    clientId: job.clientId,
    label: body.data.label ?? null,
    type: body.data.type,
    r2Key: body.data.r2Key,
    deliveryUrl: body.data.deliveryUrl ?? null,
    status: body.data.status ?? 'pending',
    metadata: body.data.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [asset] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  return c.json({ asset }, 201);
});

jobRoutes.patch('/:id/assets/:assetId', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const jobId = c.req.param('id');
  const assetId = c.req.param('assetId');
  const payload: unknown = await c.req.json().catch(() => null);
  const body = updateAssetSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid asset payload', details: body.error.issues }, 400);
  }

  if (Object.keys(body.data).length === 0) {
    return c.json({ error: 'No changes provided' }, 400);
  }

  const db = c.get('db');
  const [existingAsset] = await db
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.id, assetId), eq(schema.assets.jobId, jobId)))
    .limit(1);

  if (!existingAsset) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  await db
    .update(schema.assets)
    .set({
      label: body.data.label ?? undefined,
      type: body.data.type ?? undefined,
      r2Key: body.data.r2Key ?? undefined,
      deliveryUrl: body.data.deliveryUrl ?? undefined,
      status: body.data.status ?? undefined,
    })
    .where(eq(schema.assets.id, assetId));

  const [asset] = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  return c.json({ asset });
});

// Client feedback endpoint
jobRoutes.post('/:id/feedback', async (c) => {
  const user = c.get('user');
  const jobId = c.req.param('id');
  const db = c.get('db');

  // Verify client owns this job
  const [clientRecord] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!clientRecord) {
    return c.json({ error: 'Client record not found' }, 404);
  }

  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.clientId, clientRecord.id)))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const payload: unknown = await c.req.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('feedback' in payload)) {
    return c.json({ error: 'Feedback text required' }, 400);
  }

  const feedbackText = String(payload.feedback).trim();
  if (!feedbackText) {
    return c.json({ error: 'Feedback cannot be empty' }, 400);
  }

  // Store feedback in internalNotes (append to existing notes)
  const timestamp = new Date().toLocaleString('es-ES');
  const newNote = `\n[Feedback ${timestamp}] ${clientRecord.name}: ${feedbackText}`;

  await db
    .update(schema.jobs)
    .set({
      internalNotes: job.internalNotes ? job.internalNotes + newNote : newNote,
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, jobId));

  // Send feedback confirmation email
  const env = c.env;
  if (clientRecord.email) {
    sendFeedbackConfirmationEmail(env, {
      clientEmail: clientRecord.email,
      clientName: clientRecord.name || 'Cliente',
      jobBrief: job.briefText || 'Trabajo',
      jobId: job.id,
      feedbackText,
      portalUrl: 'https://crm.grandeandgordo.com',
    }).catch((err) => console.error('Failed to send feedback confirmation email:', err));
  }

  return c.json({ success: true, message: 'Feedback recibido' });
});
