/**
 * Pipeline Configurator API
 *
 * Admin-only CRUD for mapping client segments + job types + platforms
 * to AI Engine pipeline_ids. Auto-selected on job creation.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const jobPlatforms = ['instagram', 'tiktok', 'amazon_pdp', 'paid_ads'] as const;
const jobTypes = ['image', 'video'] as const;
const clientSegments = ['rentable', 'growth', 'premium', 'enterprise'] as const;

const createMappingSchema = z.object({
  clientSegment: z.enum(clientSegments),
  jobType: z.enum(jobTypes).optional(),
  platform: z.enum(jobPlatforms).optional(),
  pipelineId: z.string().trim().min(1),
  qaThreshold: z.number().int().min(0).max(100).optional(),
});

const updateMappingSchema = z.object({
  clientSegment: z.enum(clientSegments).optional(),
  jobType: z.enum(jobTypes).optional().nullable(),
  platform: z.enum(jobPlatforms).optional().nullable(),
  pipelineId: z.string().trim().min(1).optional(),
  qaThreshold: z.number().int().min(0).max(100).optional(),
});

export const pipelineMappingRoutes = new Hono<AppContext>();
pipelineMappingRoutes.use('*', requireAuth);

// GET /api/portal/pipeline-mappings — list all (admin only)
pipelineMappingRoutes.get('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);

  const db = c.get('db');
  const rows = await db.select().from(schema.pipelineMappings).orderBy(schema.pipelineMappings.createdAt);
  return c.json({ mappings: rows });
});

// POST /api/portal/pipeline-mappings — create (admin only)
pipelineMappingRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);

  const payload: unknown = await c.req.json().catch(() => null);
  const parsed = createMappingSchema.safeParse(payload);
  if (!parsed.success) return c.json({ error: 'Invalid data', details: parsed.error.issues }, 400);

  const db = c.get('db');
  const data = parsed.data;

  // Check for duplicate (clientSegment, jobType, platform)
  const [existing] = await db
    .select({ id: schema.pipelineMappings.id })
    .from(schema.pipelineMappings)
    .where(
      and(
        eq(schema.pipelineMappings.clientSegment, data.clientSegment),
        data.jobType ? eq(schema.pipelineMappings.jobType, data.jobType) : isNull(schema.pipelineMappings.jobType),
        data.platform ? eq(schema.pipelineMappings.platform, data.platform) : isNull(schema.pipelineMappings.platform),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ error: 'Mapping already exists for this segment/type/platform combination' }, 409);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.pipelineMappings).values({
    id,
    clientSegment: data.clientSegment,
    jobType: data.jobType ?? null,
    platform: data.platform ?? null,
    pipelineId: data.pipelineId,
    qaThreshold: data.qaThreshold ?? 85,
    createdAt: now,
    updatedAt: now,
  });

  const [mapping] = await db.select().from(schema.pipelineMappings).where(eq(schema.pipelineMappings.id, id)).limit(1);
  return c.json({ mapping }, 201);
});

// PATCH /api/portal/pipeline-mappings/:id — update (admin only)
pipelineMappingRoutes.patch('/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);

  const id = c.req.param('id');
  const payload: unknown = await c.req.json().catch(() => null);
  const parsed = updateMappingSchema.safeParse(payload);
  if (!parsed.success) return c.json({ error: 'Invalid data', details: parsed.error.issues }, 400);

  const db = c.get('db');
  const data = parsed.data;

  const [existing] = await db
    .select()
    .from(schema.pipelineMappings)
    .where(eq(schema.pipelineMappings.id, id))
    .limit(1);

  if (!existing) return c.json({ error: 'Mapping not found' }, 404);

  // If changing the key columns, check for duplicates
  const newSegment = data.clientSegment ?? existing.clientSegment;
  const newType = data.jobType !== undefined ? data.jobType : existing.jobType;
  const newPlatform = data.platform !== undefined ? data.platform : existing.platform;

  if (
    data.clientSegment !== undefined ||
    data.jobType !== undefined ||
    data.platform !== undefined
  ) {
    const [dup] = await db
      .select({ id: schema.pipelineMappings.id })
      .from(schema.pipelineMappings)
      .where(
        and(
          eq(schema.pipelineMappings.clientSegment, newSegment),
          newType ? eq(schema.pipelineMappings.jobType, newType) : isNull(schema.pipelineMappings.jobType),
          newPlatform ? eq(schema.pipelineMappings.platform, newPlatform) : isNull(schema.pipelineMappings.platform),
        ),
      )
      .limit(1);

    if (dup && dup.id !== id) {
      return c.json({ error: 'Mapping already exists for this segment/type/platform combination' }, 409);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.clientSegment !== undefined) updates.clientSegment = data.clientSegment;
  if (data.jobType !== undefined) updates.jobType = data.jobType;
  if (data.platform !== undefined) updates.platform = data.platform;
  if (data.pipelineId !== undefined) updates.pipelineId = data.pipelineId;
  if (data.qaThreshold !== undefined) updates.qaThreshold = data.qaThreshold;

  await db.update(schema.pipelineMappings).set(updates).where(eq(schema.pipelineMappings.id, id));

  const [mapping] = await db.select().from(schema.pipelineMappings).where(eq(schema.pipelineMappings.id, id)).limit(1);
  return c.json({ mapping });
});

// DELETE /api/portal/pipeline-mappings/:id — delete (admin only)
pipelineMappingRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);

  const id = c.req.param('id');
  const db = c.get('db');

  const [existing] = await db
    .select({ id: schema.pipelineMappings.id })
    .from(schema.pipelineMappings)
    .where(eq(schema.pipelineMappings.id, id))
    .limit(1);

  if (!existing) return c.json({ error: 'Mapping not found' }, 404);

  await db.delete(schema.pipelineMappings).where(eq(schema.pipelineMappings.id, id));
  return c.json({ ok: true });
});

/**
 * Resolve pipeline_id for a job based on client segment, job type, and platform.
 * Returns null if no mapping found (caller should fallback).
 */
export async function resolvePipelineId(
  db: ReturnType<typeof import('../../../../db/index.js').getDb>,
  segment: string | null | undefined,
  jobType: string | null | undefined,
  platform: string | null | undefined,
): Promise<{ pipelineId: string; qaThreshold: number } | null> {
  if (!segment) return null;

  // Try exact match: segment + type + platform
  let [match] = await db
    .select()
    .from(schema.pipelineMappings)
    .where(
      and(
        eq(schema.pipelineMappings.clientSegment, segment),
        jobType ? eq(schema.pipelineMappings.jobType, jobType) : isNull(schema.pipelineMappings.jobType),
        platform ? eq(schema.pipelineMappings.platform, platform) : isNull(schema.pipelineMappings.platform),
      ),
    )
    .limit(1);

  // Try wildcard type: segment + null type + platform
  if (!match && jobType) {
    [match] = await db
      .select()
      .from(schema.pipelineMappings)
      .where(
        and(
          eq(schema.pipelineMappings.clientSegment, segment),
          isNull(schema.pipelineMappings.jobType),
          platform ? eq(schema.pipelineMappings.platform, platform) : isNull(schema.pipelineMappings.platform),
        ),
      )
      .limit(1);
  }

  // Try wildcard platform: segment + type + null platform
  if (!match && platform) {
    [match] = await db
      .select()
      .from(schema.pipelineMappings)
      .where(
        and(
          eq(schema.pipelineMappings.clientSegment, segment),
          jobType ? eq(schema.pipelineMappings.jobType, jobType) : isNull(schema.pipelineMappings.jobType),
          isNull(schema.pipelineMappings.platform),
        ),
      )
      .limit(1);
  }

  // Try both wildcards: segment + null + null
  if (!match) {
    [match] = await db
      .select()
      .from(schema.pipelineMappings)
      .where(
        and(
          eq(schema.pipelineMappings.clientSegment, segment),
          isNull(schema.pipelineMappings.jobType),
          isNull(schema.pipelineMappings.platform),
        ),
      )
      .limit(1);
  }

  return match ? { pipelineId: match.pipelineId, qaThreshold: match.qaThreshold } : null;
}
