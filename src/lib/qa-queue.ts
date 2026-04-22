/**
 * QA Queue — D1-backed async job queue for autonomous QA
 *
 * Enqueue on webhook completion, process via cron.
 */

import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import type { Database } from '../../db/index.js';

const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function enqueueQa(
  db: Database,
  params: {
    assetId: string;
    jobId: string;
    clientId: string;
  },
) {
  const id = crypto.randomUUID();
  const now = new Date();

  // Idempotency: skip if qa_result already exists for this asset
  const [existing] = await db
    .select({ id: schema.qaResults.id })
    .from(schema.qaResults)
    .where(eq(schema.qaResults.assetId, params.assetId))
    .limit(1);

  if (existing) {
    return { id: existing.id, skipped: true };
  }

  await db.insert(schema.qaResults).values({
    id,
    assetId: params.assetId,
    jobId: params.jobId,
    clientId: params.clientId,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  });

  return { id, skipped: false };
}

export async function getPendingQaJobs(db: Database, limit = 5) {
  const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_MS);

  return db
    .select()
    .from(schema.qaResults)
    .where(
      or(
        eq(schema.qaResults.status, 'queued'),
        and(
          eq(schema.qaResults.status, 'processing'),
          or(
            isNull(schema.qaResults.processingStartedAt),
            lte(schema.qaResults.processingStartedAt, stuckThreshold),
          ),
        ),
      ),
    )
    .orderBy(schema.qaResults.createdAt)
    .limit(limit);
}

export async function markQaProcessing(db: Database, id: string) {
  await db
    .update(schema.qaResults)
    .set({
      status: 'processing',
      processingStartedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.qaResults.id, id));
}

export async function markQaComplete(
  db: Database,
  id: string,
  scores: {
    consistency: number;
    composition: number;
    lighting: number;
    brandAlignment: number;
    overall: number;
  },
  autoApproved: boolean,
) {
  await db
    .update(schema.qaResults)
    .set({
      status: 'completed',
      scores: JSON.stringify(scores),
      overallScore: scores.overall,
      autoApproved,
      updatedAt: new Date(),
    })
    .where(eq(schema.qaResults.id, id));
}

export async function markQaFailed(db: Database, id: string, error: string) {
  await db
    .update(schema.qaResults)
    .set({
      status: 'failed',
      error,
      updatedAt: new Date(),
    })
    .where(eq(schema.qaResults.id, id));
}
