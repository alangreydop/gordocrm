/**
 * Audit Trail — Agent invocation logging for RGPD/EU AI Act compliance
 *
 * Every Reasoning Worker call is logged with:
 * - Input context hash (not raw content, to minimize PII)
 * - Output hash (not raw content)
 * - Decision: approved, rejected, hitl_review, or error
 * - Human override: who approved/rejected after HITL review
 * - Token count and duration for cost tracking
 *
 * 2-year retention per EU AI Act audit trail requirements.
 */

import { eq, and, gte, desc } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import type { getDb } from '../../db/index.js';

type DbClient = ReturnType<typeof getDb>;

export type InvocationDecision = 'approved' | 'rejected' | 'hitl_review' | 'error';
export type InvocationType = 'plan' | 'generate' | 'qa' | 'enrich' | 'curate';

export interface LogInvocationParams {
  jobId: string;
  clientId: string;
  agentName: string;
  invocationType: InvocationType;
  contextEnvelope: Record<string, unknown>;
  output: Record<string, unknown> | null;
  confidence: number | null;
  decision: InvocationDecision;
  errorMessage?: string;
  tokenCount?: number;
  durationMs?: number;
}

export interface OverrideParams {
  invocationId: string;
  humanOverride: 'approved' | 'rejected';
  humanOverrideBy: string;
}

/**
 * Hash any JSON-serializable value using SHA-256.
 * Returns hex string.
 */
async function hashContent(content: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(content));
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Log an agent invocation to the audit trail.
 */
export async function logInvocation(db: DbClient, params: LogInvocationParams): Promise<string> {
  const contextHash = await hashContent(params.contextEnvelope);
  const outputHash = params.output ? await hashContent(params.output) : null;

  const id = crypto.randomUUID();

  await db.insert(schema.agentInvocations).values({
    id,
    jobId: params.jobId,
    clientId: params.clientId,
    agentName: params.agentName,
    invocationType: params.invocationType,
    contextHash,
    outputHash,
    confidence: params.confidence,
    decision: params.decision,
    errorMessage: params.errorMessage ?? null,
    tokenCount: params.tokenCount ?? null,
    durationMs: params.durationMs ?? null,
    humanOverride: null,
    humanOverrideBy: null,
  });

  return id;
}

/**
 * Record a human override on an invocation.
 * Used when HITL reviewer approves/rejects after automated review.
 */
export async function logHumanOverride(db: DbClient, params: OverrideParams): Promise<void> {
  await db
    .update(schema.agentInvocations)
    .set({
      humanOverride: params.humanOverride,
      humanOverrideBy: params.humanOverrideBy,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentInvocations.id, params.invocationId));
}

/**
 * Get invocations for a specific job.
 */
export async function getJobInvocations(db: DbClient, jobId: string) {
  return db
    .select()
    .from(schema.agentInvocations)
    .where(eq(schema.agentInvocations.jobId, jobId))
    .orderBy(desc(schema.agentInvocations.createdAt));
}

/**
 * Get invocations for a client within a date range.
 * Used for RGPD compliance audits.
 */
export async function getClientInvocations(
  db: DbClient,
  clientId: string,
  since: Date,
) {
  return db
    .select()
    .from(schema.agentInvocations)
    .where(
      and(
        eq(schema.agentInvocations.clientId, clientId),
        gte(schema.agentInvocations.createdAt, since),
      ),
    )
    .orderBy(desc(schema.agentInvocations.createdAt));
}

/**
 * Get HITL queue: invocations awaiting human review.
 */
export async function getHITLQueue(db: DbClient) {
  return db
    .select()
    .from(schema.agentInvocations)
    .where(eq(schema.agentInvocations.decision, 'hitl_review'))
    .orderBy(desc(schema.agentInvocations.createdAt));
}

/**
 * Get invocations by agent name (for cost/usage tracking).
 */
export async function getAgentUsage(
  db: DbClient,
  agentName: string,
  since: Date,
) {
  return db
    .select()
    .from(schema.agentInvocations)
    .where(
      and(
        eq(schema.agentInvocations.agentName, agentName),
        gte(schema.agentInvocations.createdAt, since),
      ),
    )
    .orderBy(desc(schema.agentInvocations.createdAt));
}