import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

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

const optionalNullableString = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value;
}, z.union([z.string(), z.null()]).optional());

const optionalInteger = z.preprocess((value) => {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : value;
}, z.number().int().min(0).optional());

const optionalNullableNumber = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}, z.union([z.number().min(0), z.null()]).optional());

const optionalNullableDate = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  return value;
}, z.union([z.date(), z.null()]).optional());

const optionalNullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return value;
  }, z.union([z.enum(values), z.null()]).optional());

const createJobSchema = z.object({
  clientId: z.string().uuid(),
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
  qaStatus: z.enum(assetQaStatuses).optional(),
  qaNotes: optionalNullableString,
});

const updateAssetSchema = z.object({
  label: optionalNullableString,
  type: optionalNullableEnum(jobTypes),
  r2Key: optionalNullableString,
  deliveryUrl: optionalNullableString,
  qaStatus: optionalNullableEnum(assetQaStatuses),
  qaNotes: optionalNullableString,
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

  return c.json({ jobs: rows });
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
      qaStatus: schema.assets.qaStatus,
      qaNotes: schema.assets.qaNotes,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.assets)
    .where(
      user.role === 'admin'
        ? eq(schema.assets.jobId, id)
        : and(
            eq(schema.assets.jobId, id),
            or(
              eq(schema.assets.qaStatus, 'approved'),
              isNull(schema.assets.qaStatus),
            ),
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

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.jobs).values({
    id,
    clientId: body.data.clientId,
    briefText: body.data.briefText ?? null,
    platform: body.data.platform ?? null,
    type: body.data.type ?? null,
    dueAt: body.data.dueAt ?? null,
    unitsPlanned: body.data.unitsPlanned ?? 0,
    unitsConsumed: body.data.unitsConsumed ?? 0,
    aiCostEstimated: body.data.aiCostEstimated ?? null,
    aiCostReal: body.data.aiCostReal ?? null,
    grossMarginEstimated: body.data.grossMarginEstimated ?? null,
    clientSegment: body.data.clientSegment ?? null,
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
  const payload: unknown = await c.req.json().catch(() => null);
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
      status: body.data.status,
      platform: body.data.platform,
      clientSegment: body.data.clientSegment,
      marginProfile: body.data.marginProfile,
      assetDominant: body.data.assetDominant,
      legalRisk: body.data.legalRisk,
      turnaround: body.data.turnaround,
      portabilityRequired: body.data.portabilityRequired,
      structuralDemand: body.data.structuralDemand,
      benchmarkLevel: body.data.benchmarkLevel,
      stackLane: body.data.stackLane,
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
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  const assetId = crypto.randomUUID();
  await db.insert(schema.assets).values({
    id: assetId,
    jobId,
    label: body.data.label ?? null,
    type: body.data.type,
    r2Key: body.data.r2Key,
    deliveryUrl: body.data.deliveryUrl ?? null,
    qaStatus: body.data.qaStatus ?? 'pending',
    qaNotes: body.data.qaNotes ?? null,
    createdAt: new Date(),
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
    .where(
      and(
        eq(schema.assets.id, assetId),
        eq(schema.assets.jobId, jobId),
      ),
    )
    .limit(1);

  if (!existingAsset) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  await db
    .update(schema.assets)
    .set({
      label: body.data.label,
      type: body.data.type ?? undefined,
      r2Key: body.data.r2Key ?? undefined,
      deliveryUrl: body.data.deliveryUrl,
      qaStatus: body.data.qaStatus,
      qaNotes: body.data.qaNotes,
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
    .where(
      and(
        eq(schema.jobs.id, jobId),
        eq(schema.jobs.clientId, clientRecord.id),
      )
    )
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

  return c.json({ success: true, message: 'Feedback recibido' });
});
