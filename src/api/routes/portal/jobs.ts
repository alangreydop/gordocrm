import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import { resolveClientBrandFolder } from '../../../lib/client-storage.js';
import { ensureClientBrandFolder } from '../../../lib/client-storage-db.js';
import { sendFeedbackConfirmationEmail, sendJobCompletionEmail } from '../../../lib/email.js';
import { resolvePipelineId } from './pipeline-mappings.js';
import type { AppContext, AppBindings } from '../../../types/index.js';
import {
  buildPromptFromBrief,
  extractAspectRatio,
  extractBriefImageUrls,
  extractBriefSku,
  parseOptimizedBrief,
  resolveOrchestratorBase,
} from '../../lib/brief-helpers.js';

// Helper para crear JWT compatible con AI Engine
async function createAIEngineJWT(user: {
  id: string;
  email: string;
  role: string;
}, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
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
  let assetCounts: { jobId: string | null; count: number }[] = [];
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
      externalJobId: schema.jobs.externalJobId,
      deliveryUrl: schema.jobs.deliveryUrl,
      startedAt: schema.jobs.startedAt,
      completedAt: schema.jobs.completedAt,
      failedAt: schema.jobs.failedAt,
      failureReason: schema.jobs.failureReason,
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
      fileSize: schema.assets.fileSize,
      deliveryUrl: schema.assets.deliveryUrl,
      status: schema.assets.status,
      metadata: schema.assets.metadata,
      sku: schema.assets.sku,
      category: schema.assets.category,
      createdAt: schema.assets.createdAt,
      updatedAt: schema.assets.updatedAt,
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
    deliveryUrl: jobRow.deliveryUrl,
    startedAt: jobRow.startedAt,
    completedAt: jobRow.completedAt,
    failedAt: jobRow.failedAt,
    failureReason: jobRow.failureReason,
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
  const isProduction = c.env.APP_ENV === 'production';
  const aiEngineUrlBase = c.env.AI_ENGINE_URL?.replace(/\/+$/, '') ?? (isProduction ? undefined : 'http://localhost:8000');
  if (!aiEngineUrlBase) {
    return c.json({ error: 'AI_ENGINE_URL is not configured' }, 503);
  }
  const aiEngineApiBase = aiEngineUrlBase.endsWith('/api/v1') ? aiEngineUrlBase : `${aiEngineUrlBase}/api/v1`;
  const aiEngineUrl = `${aiEngineApiBase}/jobs`;

  // Obtener token JWT del CRM
  const aiEngineJwtSecret = c.env.AI_ENGINE_JWT_SECRET ?? (isProduction ? undefined : 'local-ai-engine-secret');
  if (!aiEngineJwtSecret) {
    return c.json({ error: 'AI_ENGINE_JWT_SECRET is not configured' }, 503);
  }
  const token = await createAIEngineJWT(user, aiEngineJwtSecret);

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
    redirect: 'manual',
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

jobRoutes.post('/:id/approve-orchestrator', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const id = c.req.param('id');
  const db = c.get('db');

  const [job] = await db
    .select({
      id: schema.jobs.id,
      externalJobId: schema.jobs.externalJobId,
      status: schema.jobs.status,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (!job.externalJobId) {
    return c.json({ error: 'Job is missing orchestrator id' }, 400);
  }

  if (job.status === 'completed' || job.status === 'delivered') {
    return c.json({ error: 'Job has already completed production' }, 409);
  }

  const orchestratorBaseUrl = resolveOrchestratorBase(c.env);
  const orchestratorAdminKey = c.env.ORCHESTRATOR_ADMIN_KEY;
  if (!orchestratorBaseUrl || !orchestratorAdminKey) {
    return c.json({ error: 'Orchestrator environment is not configured' }, 503);
  }

  const approveUrl = `${orchestratorBaseUrl}/api/jobs/${encodeURIComponent(job.externalJobId)}/approve`;
  const response = await fetch(approveUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': orchestratorAdminKey,
    },
    body: JSON.stringify({ source: 'crm', sourceRef: job.id }),
    redirect: 'manual',
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof responseBody === 'object' && responseBody !== null && 'error' in responseBody
      ? String((responseBody as { error?: unknown }).error)
      : `Orchestrator approval failed: ${response.status}`;
    const status = response.status === 400
      ? 400
      : response.status === 404
        ? 404
        : response.status === 409
          ? 409
          : response.status === 503
            ? 503
            : 502;
    return c.json({ error }, status);
  }

  await db
    .update(schema.jobs)
    .set({
      status: 'processing',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, id));

  const [updatedJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);

  return c.json({
    ok: true,
    job: updatedJob,
    orchestrator: responseBody,
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
      metadata: body.data.metadata ?? undefined,
      updatedAt: new Date(),
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

// POST /api/portal/jobs/create-from-brief
// Creates a CRM job from a brief submission AND a production_job in the orchestrator
const createFromBriefSchema = z.object({
  briefId: z.string().uuid(),
});

jobRoutes.post('/create-from-brief', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const payload: unknown = await c.req.json().catch(() => null);
  const body = createFromBriefSchema.safeParse(payload);
  if (!body.success) {
    return c.json({ error: 'Invalid payload', details: body.error.issues }, 400);
  }

  const { briefId } = body.data;
  const db = c.get('db');

  // Fetch brief with client info
  const [brief] = await db
    .select({
      id: schema.briefSubmissions.id,
      clientId: schema.briefSubmissions.clientId,
      email: schema.briefSubmissions.email,
      contentType: schema.briefSubmissions.contentType,
      description: schema.briefSubmissions.description,
      objective: schema.briefSubmissions.objective,
      style: schema.briefSubmissions.style,
      audience: schema.briefSubmissions.audience,
      cta: schema.briefSubmissions.cta,
      status: schema.briefSubmissions.status,
      clientName: schema.clients.name,
      clientSegment: schema.clients.segment,
      marginProfile: schema.clients.marginProfile,
      externalClientId: schema.clients.externalClientId,
      company: schema.clients.company,
      clientNumber: schema.clients.clientNumber,
      brandFolder: schema.clients.brandFolder,
      optimizedBrief: schema.briefSubmissions.optimizedBrief,
    })
    .from(schema.briefSubmissions)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.briefSubmissions.clientId))
    .where(eq(schema.briefSubmissions.id, briefId))
    .limit(1);

  if (!brief) {
    return c.json({ error: 'Brief not found' }, 404);
  }
  if (!brief.clientId) {
    return c.json({ error: 'Brief must be linked to a client before creating a job' }, 400);
  }

  // Create CRM job
  const now = new Date();
  const jobId = crypto.randomUUID();
  const mapBriefType = (tipo: string | null): 'image' | 'video' => {
    if (tipo === 'video') return 'video';
    return 'image';
  };
  const briefLabel = brief.contentType === 'ambos' ? 'foto + video' : brief.contentType;

  await db.insert(schema.jobs).values({
    id: jobId,
    clientId: brief.clientId,
    status: 'pending',
    briefText: '[Brief web · ' + (briefLabel ?? 'foto') + '] ' + (brief.description ?? ''),
    type: mapBriefType(brief.contentType),
    turnaround: 'normal',
    clientSegment: brief.clientSegment ?? null,
    marginProfile: brief.marginProfile ?? null,
    clientGoal: 'Responder brief web recibido desde ' + brief.email,
    internalNotes: 'Trabajo creado desde brief ' + brief.id,
    createdAt: now,
    updatedAt: now,
  });

  // Update brief status
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
      const ob = parseOptimizedBrief(brief.optimizedBrief);
      const prompt = buildPromptFromBrief(brief, ob);
      const realSku = extractBriefSku(ob);
      const imageUrls = extractBriefImageUrls(ob);
      const aspectRatio = extractAspectRatio(ob);
      const storageClient = await ensureClientBrandFolder(db, {
        id: brief.clientId,
        name: brief.clientName ?? brief.email,
        company: brief.company ?? null,
        clientNumber: brief.clientNumber ?? null,
        brandFolder: brief.brandFolder ?? null,
        externalClientId: brief.externalClientId ?? null,
      });
      const brandFolder = resolveClientBrandFolder(storageClient);

      const url = orchestratorBaseUrl + '/api/jobs';
      const orchestratorRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': orchestratorAdminKey,
        },
        body: JSON.stringify({
          brandId: brandFolder,
          brandFolder,
          sku: realSku,
          modality: mapBriefType(brief.contentType),
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
              internalNotes: 'Trabajo creado desde brief ' + brief.id + '. Orchestrator: job=' + orchestratorJobId + (orchestratorRunId ? ' run=' + orchestratorRunId : ''),
              updatedAt: new Date(),
            })
            .where(eq(schema.jobs.id, jobId));
        }
      } else {
        const errBody = await orchestratorRes.text().catch(() => '');
        console.error('Orchestrator job creation failed [' + orchestratorRes.status + ']: ' + errBody);
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

// POST /:id/transition — Trigger orchestrator state transition
jobRoutes.post('/:id/transition', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const db = c.get('db');
  const jobId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const event = (body as { event?: string }).event;

  if (!event) {
    return c.json({ error: 'Missing required field: event' }, 400);
  }

  const validEvents: string[] = [
    'brief_received', 'plan_approved', 'plan_rejected', 'retry_plan',
    'plan_retry_exhausted', 'assets_generated', 'qa_requested',
    'brand_graph_unavailable', 'qa_passed', 'qa_in_band', 'qa_failed',
    'hitl_approved', 'hitl_rejected', 'delivery_confirmed', 'crm_notified',
    'timeout', 'cancel',
  ];

  if (!validEvents.includes(event)) {
    return c.json({ error: `Invalid event: ${event}. Valid events: ${validEvents.join(', ')}` }, 400);
  }

  const env: { ANTHROPIC_API_KEY?: string; ASSETS?: R2Bucket; AGENT_STORE?: R2Bucket } = {};
  if (c.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = c.env.ANTHROPIC_API_KEY;
  if (c.env.ASSETS) env.ASSETS = c.env.ASSETS;
  if (c.env.AGENT_STORE) env.AGENT_STORE = c.env.AGENT_STORE;

  const { transitionJob } = await import('../../../lib/orchestrator.js');

  const result = await transitionJob(db, env, jobId, event as never);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true, newState: result.newState });
});
