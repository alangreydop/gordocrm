/**
 * Orchestrator — Deterministic state machine for production pipeline
 *
 * Owns ALL state transitions. Agents produce bounded artifacts (plans, prompts,
 * QA scores). The orchestrator decides what happens next based on agent output
 * and confidence scores.
 *
 * State machine:
 * JOB_CREATED → PLAN_GENERATED → [HITL: approve plan]
 *   → ASSET_FACTORY_DISPATCHED → ASSET_GENERATED
 *   → QA_EVALUATION → [HITL: if score in ±0.05 band]
 *   → APPROVED → DELIVERY_READY → CRM_NOTIFIED
 *   → REJECTED → [retry up to 3x] → PLAN_GENERATED (if exhausted)
 *   → PLAN_REJECTED (if exhausted)
 * QA_EVALUATION retry (Brand Graph unavailable):
 *   → QA_RETRY (self-loop, max 3) → QA_EVALUATION
 *   → If exhausted → HITL notification
 *
 * Never let an agent call setState(). This module is the sole state owner.
 */

import { eq } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import type { getDb } from '../../db/index.js';
import { invokeAgent, type InvokeAgentResult } from './reasoning-worker.js';
import { getPendingReviews, actOnReview, type ActOnReviewParams } from './hitl.js';
import { isBrandGraphReadyForQA, getBrandGraphContext } from './brand-graph.js';

type DbClient = ReturnType<typeof getDb>;

// ─── State Machine Types ──────────────────────────────────────────────

export type JobState =
  | 'pending'
  | 'processing'
  | 'plan_generated'
  | 'asset_factory_dispatched'
  | 'asset_generated'
  | 'qa_pending'
  | 'qa_evaluation'
  | 'qa_hitl_review'
  | 'approved'
  | 'rejected'
  | 'plan_rejected'
  | 'delivery_ready'
  | 'crm_notified'
  | 'completed'
  | 'failed'
  | 'delivered'
  | 'timeout'
  | 'cancelled';

export type TransitionEvent =
  | 'brief_received'
  | 'plan_approved'
  | 'plan_rejected'
  | 'retry_plan'
  | 'plan_retry_exhausted'
  | 'assets_generated'
  | 'qa_requested'
  | 'brand_graph_unavailable'
  | 'qa_passed'
  | 'qa_in_band'
  | 'qa_failed'
  | 'hitl_approved'
  | 'hitl_rejected'
  | 'delivery_confirmed'
  | 'crm_notified'
  | 'timeout'
  | 'cancel';

interface TransitionResult {
  newState: JobState;
  action?: () => Promise<void>;
}

const MAX_PLAN_RETRIES = 3;
const MAX_QA_RETRIES = 3;

// ─── Agent-to-Invocation-Type Mapping ────────────────────────────────

const AGENT_INVOCATION_MAP: Record<string, 'plan' | 'generate' | 'qa' | 'enrich' | 'curate'> = {
  'visual-production-planner': 'plan',
  'visual-prompt-engineer': 'generate',
  'design-qa-reviewer': 'qa',
  'visual-qa-brand-graph': 'qa',
  'marketing-growth-hacker': 'enrich',
  'marketing-content-creator': 'enrich',
  'marketing-seo-specialist': 'enrich',
  'eu-compliance-auditor': 'enrich',
  'design-ux-architect': 'plan',
  'design-ui-designer': 'plan',
  'design-brand-guardian': 'qa',
  'design-whimsy-injector': 'plan',
  'lead-enrichment-spain': 'enrich',
  'brand-graph-curator': 'curate',
};

// ─── State Transition Table ───────────────────────────────────────────

/**
 * Transition table: current state + event → (next state, optional action).
 * This is the single source of truth for all state changes.
 */
export function getTransition(
  currentState: JobState,
  event: TransitionEvent,
  retryCount: number,
  qaRetryCount: number,
): TransitionResult | null {
  const transitions: Record<JobState, Partial<Record<TransitionEvent, TransitionResult>>> = {
    pending: {
      brief_received: { newState: 'plan_generated' },
      cancel: { newState: 'cancelled' },
    },
    processing: {
      cancel: { newState: 'cancelled' },
    },
    plan_generated: {
      plan_approved: { newState: 'asset_factory_dispatched' },
      plan_rejected: {
        newState: retryCount < MAX_PLAN_RETRIES ? 'plan_generated' : 'plan_rejected',
      },
      retry_plan: {
        newState: 'plan_generated',
      },
      plan_retry_exhausted: { newState: 'plan_rejected' },
      cancel: { newState: 'cancelled' },
      timeout: { newState: 'timeout' },
    },
    asset_factory_dispatched: {
      assets_generated: { newState: 'asset_generated' },
      cancel: { newState: 'cancelled' },
      timeout: { newState: 'timeout' },
    },
    asset_generated: {
      qa_requested: { newState: qaRetryCount < MAX_QA_RETRIES ? 'qa_evaluation' : 'qa_pending' },
      brand_graph_unavailable: { newState: 'qa_pending' },
      cancel: { newState: 'cancelled' },
    },
    qa_pending: {
      qa_requested: { newState: 'qa_evaluation' },
      cancel: { newState: 'cancelled' },
    },
    qa_evaluation: {
      qa_passed: { newState: 'approved' },
      qa_in_band: { newState: 'qa_hitl_review' },
      qa_failed: { newState: 'rejected' },
      brand_graph_unavailable: {
        newState: qaRetryCount < MAX_QA_RETRIES ? 'qa_evaluation' : 'qa_pending',
      },
      cancel: { newState: 'cancelled' },
    },
    qa_hitl_review: {
      hitl_approved: { newState: 'approved' },
      hitl_rejected: { newState: 'rejected' },
      timeout: { newState: 'timeout' },
      cancel: { newState: 'cancelled' },
    },
    approved: {
      delivery_confirmed: { newState: 'delivery_ready' },
      cancel: { newState: 'cancelled' },
    },
    rejected: {
      retry_plan: { newState: 'plan_generated' },
      plan_retry_exhausted: { newState: 'plan_rejected' },
      cancel: { newState: 'cancelled' },
    },
    plan_rejected: {
      cancel: { newState: 'cancelled' },
    },
    delivery_ready: {
      crm_notified: { newState: 'crm_notified' },
      cancel: { newState: 'cancelled' },
    },
    crm_notified: {
      // Terminal state
    },
    completed: {
      // Terminal state
    },
    failed: {
      // Terminal state — requires manual intervention
    },
    delivered: {
      // Terminal state
    },
    timeout: {
      // Requires manual intervention
    },
    cancelled: {
      // Terminal state
    },
  };

  return transitions[currentState]?.[event] ?? null;
}

// ─── Orchestrator API ─────────────────────────────────────────────────

export interface OrchestratorEnv {
  ANTHROPIC_API_KEY?: string;
  ASSETS?: R2Bucket;
  AGENT_STORE?: R2Bucket;
}

/**
 * Process a state transition for a job.
 * Validates the transition, invokes the appropriate agent if needed,
 * and updates the job state in D1.
 */
export async function transitionJob(
  db: DbClient,
  env: OrchestratorEnv,
  jobId: string,
  event: TransitionEvent,
  agentOverride?: {
    agentName: string;
    jobState: Record<string, unknown>;
  },
): Promise<{ success: boolean; newState: JobState; agentResult?: InvokeAgentResult | undefined; error?: string }> {
  // 1. Fetch current job state
  const [job] = await db
    .select({
      id: schema.jobs.id,
      clientId: schema.jobs.clientId,
      status: schema.jobs.status,
      retryCount: schema.jobs.retryCount,
      qaRetryCount: schema.jobs.qaRetryCount,
      briefText: schema.jobs.briefText,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);

  if (!job) {
    return { success: false, newState: 'failed', error: `Job not found: ${jobId}` };
  }

  const currentState = job.status as JobState;
  const retryCount = job.retryCount ?? 0;
  const qaRetryCount = job.qaRetryCount ?? 0;

  // 2. Validate transition
  const transition = getTransition(currentState, event, retryCount, qaRetryCount);
  if (!transition) {
    return {
      success: false,
      newState: currentState,
      error: `Invalid transition: ${currentState} + ${event}`,
    };
  }

  // 3. Invoke agent if provided
  let agentResult: InvokeAgentResult | undefined;
  if (agentOverride && env.ANTHROPIC_API_KEY) {
    const invocationType = AGENT_INVOCATION_MAP[agentOverride.agentName] ?? 'plan';

    agentResult = await invokeAgent(db, env, {
      jobId,
      clientId: job.clientId,
      agentName: agentOverride.agentName,
      invocationType,
      jobState: agentOverride.jobState,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
    });
  }

  // 4. Execute transition action if any
  if (transition.action) {
    await transition.action();
  }

  // 5. Update job state in D1
  const updates: Record<string, unknown> = {
    status: transition.newState,
    updatedAt: new Date(),
  };

  // Increment retry counters on retry transitions
  if (event === 'plan_rejected' || event === 'retry_plan') {
    updates.retryCount = retryCount + 1;
  }
  if (event === 'brand_graph_unavailable') {
    updates.qaRetryCount = qaRetryCount + 1;
  }

  await db
    .update(schema.jobs)
    .set(updates)
    .where(eq(schema.jobs.id, jobId));

  return {
    success: true,
    newState: transition.newState,
    agentResult,
  };
}

/**
 * Get the HITL queue — pending reviews awaiting human action.
 */
export async function getReviewQueue(db: DbClient) {
  return getPendingReviews(db);
}

/**
 * Approve or reject a HITL review and trigger the corresponding state transition.
 */
export async function resolveReview(
  db: DbClient,
  env: OrchestratorEnv,
  reviewId: string,
  reviewerId: string,
  action: 'approved' | 'rejected' | 'override_brand_graph',
  note?: string,
): Promise<{ success: boolean; newState?: JobState; error?: string }> {
  // 1. Fetch the review
  const reviews = await db
    .select()
    .from(schema.hitlReviews)
    .where(eq(schema.hitlReviews.id, reviewId))
    .limit(1);

  if (!reviews.length) {
    return { success: false, error: `Review not found: ${reviewId}` };
  }

  const review = reviews[0]!;
  if (review.status !== 'pending') {
    return { success: false, error: `Review already resolved: ${review.status}` };
  }

  // 2. Update review
  const actOnReviewParams: ActOnReviewParams = {
    reviewId,
    reviewerId,
    action,
  };
  if (note) actOnReviewParams.note = note;
  if (review.invocationId) actOnReviewParams.invocationId = review.invocationId;
  await actOnReview(db, actOnReviewParams);

  // 3. Trigger state transition based on review type and action
  let event: TransitionEvent;
  if (action === 'approved') {
    event = review.reviewType === 'plan_approval' ? 'plan_approved' : 'hitl_approved';
  } else {
    event = review.reviewType === 'plan_approval' ? 'plan_rejected' : 'hitl_rejected';
  }

  return transitionJob(db, env, review.jobId, event);
}

/**
 * Check if Brand Graph is ready for automated QA for a given client.
 * Returns true if QA can run autonomously, false if human review is needed.
 */
export async function canRunAutomatedQA(
  db: DbClient,
  clientId: string,
): Promise<{ ready: boolean; coldStart: boolean; coverage: number }> {
  const context = await getBrandGraphContext(db, clientId);
  return {
    ready: isBrandGraphReadyForQA(context),
    coldStart: context.coldStart,
    coverage: context.overallCoverage,
  };
}