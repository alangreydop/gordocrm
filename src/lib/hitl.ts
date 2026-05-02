/**
 * HITL Domain Model — Human-in-the-Loop review system
 *
 * Phase 1: Alan is sole reviewer. No auto-escalation.
 * Jobs wait in queue until Alan acts. No timeout → timeout status
 * is recorded but does not auto-escalate.
 *
 * Review types:
 * - plan_approval: Review generated production plan before asset creation
 * - qa_override: Override QA score that fell in ±0.05 confidence band
 * - brand_graph_override: Override Brand Graph cold-start recommendation
 */

import { eq, and, desc } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import type { getDb } from '../../db/index.js';
import { logHumanOverride } from './audit-trail.js';

type DbClient = ReturnType<typeof getDb>;

export type ReviewType = 'plan_approval' | 'qa_override' | 'brand_graph_override';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'timed_out';
export type ReviewerAction = 'approved' | 'rejected' | 'override_brand_graph';

export interface CreateReviewParams {
  jobId: string;
  clientId: string;
  invocationId?: string;
  reviewType: ReviewType;
  contextSummary: Record<string, unknown>;
  confidenceScore?: number | null;
}

export interface ActOnReviewParams {
  reviewId: string;
  reviewerId: string;
  action: ReviewerAction;
  note?: string;
  invocationId?: string;
}

/**
 * Create a HITL review request.
 * Job enters pending state and waits for reviewer action.
 */
export async function createReview(db: DbClient, params: CreateReviewParams): Promise<string> {
  const id = crypto.randomUUID();

  await db.insert(schema.hitlReviews).values({
    id,
    jobId: params.jobId,
    clientId: params.clientId,
    invocationId: params.invocationId ?? null,
    reviewType: params.reviewType,
    status: 'pending',
    contextSummary: JSON.stringify(params.contextSummary),
    confidenceScore: params.confidenceScore ?? null,
    reviewerId: null,
    reviewerAction: null,
    reviewerNote: null,
    reviewedAt: null,
  });

  return id;
}

/**
 * Reviewer acts on a HITL review.
 * Updates review status and logs the human override in the audit trail.
 */
export async function actOnReview(db: DbClient, params: ActOnReviewParams): Promise<void> {
  const actionToStatus: Record<ReviewerAction, ReviewStatus> = {
    approved: 'approved',
    rejected: 'rejected',
    override_brand_graph: 'approved',
  };

  const status = actionToStatus[params.action];

  await db
    .update(schema.hitlReviews)
    .set({
      status,
      reviewerId: params.reviewerId,
      reviewerAction: params.action,
      reviewerNote: params.note ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.hitlReviews.id, params.reviewId));

  // Log override in audit trail
  if (params.invocationId) {
    const humanOverride = params.action === 'rejected' ? 'rejected' : 'approved';
    await logHumanOverride(db, {
      invocationId: params.invocationId,
      humanOverride,
      humanOverrideBy: params.reviewerId,
    });
  }
}

/**
 * Get pending HITL reviews, oldest first.
 */
export async function getPendingReviews(db: DbClient) {
  return db
    .select()
    .from(schema.hitlReviews)
    .where(eq(schema.hitlReviews.status, 'pending'))
    .orderBy(schema.hitlReviews.createdAt);
}

/**
 * Get HITL reviews for a specific job.
 */
export async function getJobReviews(db: DbClient, jobId: string) {
  return db
    .select()
    .from(schema.hitlReviews)
    .where(eq(schema.hitlReviews.jobId, jobId))
    .orderBy(desc(schema.hitlReviews.createdAt));
}

/**
 * Mark timed-out reviews. Does NOT auto-escalate.
 * Phase 1: Alan is sole reviewer. Timed-out reviews stay in queue
 * and are flagged as timed_out for visibility, but no one else acts on them.
 */
export async function markTimedOutReviews(db: DbClient, maxAgeMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);

  const result = await db
    .update(schema.hitlReviews)
    .set({
      status: 'timed_out',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.hitlReviews.status, 'pending'),
      ),
    );

  // Note: SQLite/D1 doesn't return affected rows from UPDATE.
  // The timed_out status is informational — Alan can still act on it.
  return 0;
}

/**
 * Count pending reviews. Used for dashboard queue depth display.
 */
export async function countPendingReviews(db: DbClient): Promise<number> {
  const rows = await db
    .select({ id: schema.hitlReviews.id })
    .from(schema.hitlReviews)
    .where(eq(schema.hitlReviews.status, 'pending'));

  return rows.length;
}