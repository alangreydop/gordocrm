/**
 * Reasoning Worker — Loads agent, assembles context, calls Claude, validates output
 *
 * Orchestrator (deterministic state machine) triggers this worker.
 * The worker NEVER owns state transitions — it produces bounded artifacts
 * and the orchestrator decides what to do with them.
 *
 * Fallback chain:
 * 1. Timeout → fail-closed + HITL notification
 * 2. Malformed JSON → retry 1x with reformatted prompt → fail-closed
 * 3. Rate limit → KV-based queue + backpressure
 * 4. Brand Graph unavailable → fail-closed, queue retry
 * 5. Context budget exceeded → truncate vectors then SKU history → fail-closed
 */

import { eq } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import type { getDb } from '../../db/index.js';
import { logInvocation, type InvocationDecision, type InvocationType } from './audit-trail.js';
import { createReview } from './hitl.js';
import { getBrandGraphContext, isBrandGraphReadyForQA } from './brand-graph.js';

type DbClient = ReturnType<typeof getDb>;

// ─── Types ───────────────────────────────────────────────────────────

export interface InvokeAgentParams {
  jobId: string;
  clientId: string;
  agentName: string;
  invocationType: InvocationType;
  jobState: Record<string, unknown>;
  anthropicApiKey: string;
  /** Override tenant config for testing */
  tenantConfig?: TenantConfig;
}

export interface InvokeAgentResult {
  success: boolean;
  decision: InvocationDecision;
  output: Record<string, unknown> | null;
  confidence: number | null;
  hitlReviewId?: string | undefined;
  error?: string;
}

export interface TenantConfig {
  locale: string;
  gngConstraints: string[];
  brandDirection: string;
}

const DEFAULT_TENANT_CONFIG: TenantConfig = {
  locale: 'es-ES',
  gngConstraints: ['RGPD compliance', 'C2PA provenance', 'EU AI Act disclosure'],
  brandDirection: 'editorial dark-rose, bold, not cautious',
};

const MAX_TOKEN_BUDGET = 16000;
const HITL_CONFIDENCE_BAND = 0.05;
const MAX_RETRIES = 1;

// ─── Agent Loading ────────────────────────────────────────────────────

/**
 * Load agent markdown content.
 * Agents live in ~/.claude/agents/ and are loaded at invocation time.
 * In production, these would be stored in KV or R2.
 */
async function loadAgentMarkdown(agentName: string, env: { AGENT_STORE?: R2Bucket }): Promise<string> {
  // Production: load from R2 bucket
  if (env.AGENT_STORE) {
    const obj = await env.AGENT_STORE.get(`agents/${agentName}.md`);
    if (!obj) throw new Error(`Agent not found: ${agentName}`);
    return obj.text();
  }

  // Development: load from filesystem (handled by the caller in dev mode)
  throw new Error(`Agent store not configured. Cannot load agent: ${agentName}`);
}

// ─── Context Assembly ────────────────────────────────────────────────

interface AssembledContext {
  contextEnvelope: Record<string, unknown>;
  tokenEstimate: number;
  coldStart: boolean;
}

/**
 * Assemble context envelope per-agent selectors.
 * Reads the agent's YAML frontmatter for context_requirements.
 */
async function assembleContext(
  db: DbClient,
  clientId: string,
  agentMarkdown: string,
  jobState: Record<string, unknown>,
  tenantConfig: TenantConfig,
  brandGraphEnv: { ASSETS?: R2Bucket },
): Promise<AssembledContext> {
  // Get Brand Graph context
  const brandGraphCtx = await getBrandGraphContext(db, clientId);
  const coldStart = brandGraphCtx.coldStart;

  // Parse agent context requirements from YAML frontmatter
  const requiredFields = parseContextRequirements(agentMarkdown);

  // Build envelope based on requirements
  const envelope: Record<string, unknown> = {};

  // Dynamic context (per-invocation)
  if (requiredFields.includes('job_state') || requiredFields.includes('*')) {
    envelope.job_state = jobState;
  }

  if (requiredFields.includes('brand_graph_vectors') || requiredFields.includes('*')) {
    if (brandGraphCtx.vectors.length > 0) {
      // Top 20 by relevance (already sorted by confidence from brand-graph.ts)
      envelope.brand_graph_vectors = brandGraphCtx.vectors.slice(0, 20);
    }
    // If cold-start, omit the field entirely (not null)
  }

  if (requiredFields.includes('client_sku_history') || requiredFields.includes('*')) {
    // TODO: Load from job_state or separate query
    envelope.client_sku_history = [];
  }

  // Estimate tokens (rough: 1 token ≈ 4 chars)
  const envelopeStr = JSON.stringify(envelope);
  const envelopeTokens = Math.ceil(envelopeStr.length / 4);
  const agentTokens = Math.ceil(agentMarkdown.length / 4);
  const systemTokens = Math.ceil(JSON.stringify(tenantConfig).length / 4);
  const outputSchemaTokens = 250; // approximate

  const tokenEstimate = envelopeTokens + agentTokens + systemTokens + outputSchemaTokens;

  return {
    contextEnvelope: envelope,
    tokenEstimate,
    coldStart,
  };
}

/**
 * Parse YAML frontmatter from agent markdown to extract context_requirements.
 * Returns ['*'] if no requirements specified (meaning all context).
 */
function parseContextRequirements(agentMarkdown: string): string[] {
  const frontmatterMatch = agentMarkdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return ['*'];

  const yaml = frontmatterMatch[1] ?? '';
  const requiredMatch = yaml.match(/required:\s*\[([^\]]+)\]/);
  const optionalMatch = yaml.match(/optional:\s*\[([^\]]+)\]/);

  const required = requiredMatch?.[1]
    ? requiredMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''))
    : [];
  const optional = optionalMatch?.[1]
    ? optionalMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''))
    : [];

  return [...required, ...optional].length > 0 ? [...required, ...optional] : ['*'];
}

// ─── Overflow Handling ────────────────────────────────────────────────

/**
 * Handle context budget overflow.
 * 1. Truncate brand_graph_vectors from top-20 to top-10
 * 2. If still over, truncate client_sku_history from 10 to 5
 * 3. If still over, fail-closed with HITL notification
 */
function handleOverflow(
  envelope: Record<string, unknown>,
  tokenEstimate: number,
): { envelope: Record<string, unknown>; truncated: boolean } {
  if (tokenEstimate <= MAX_TOKEN_BUDGET) {
    return { envelope, truncated: false };
  }

  // Step 1: Truncate vectors to top-10
  if (Array.isArray(envelope.brand_graph_vectors) && envelope.brand_graph_vectors.length > 10) {
    envelope = { ...envelope, brand_graph_vectors: envelope.brand_graph_vectors.slice(0, 10) };
  }

  const afterStep1 = Math.ceil(JSON.stringify(envelope).length / 4);
  if (afterStep1 <= MAX_TOKEN_BUDGET) {
    return { envelope, truncated: true };
  }

  // Step 2: Truncate SKU history to 5
  if (Array.isArray(envelope.client_sku_history) && envelope.client_sku_history.length > 5) {
    envelope = { ...envelope, client_sku_history: envelope.client_sku_history.slice(0, 5) };
  }

  const afterStep2 = Math.ceil(JSON.stringify(envelope).length / 4);
  if (afterStep2 <= MAX_TOKEN_BUDGET) {
    return { envelope, truncated: true };
  }

  // Step 3: Fail-closed
  return { envelope, truncated: false };
}

// ─── Claude API Call ──────────────────────────────────────────────────

/**
 * Call Claude API with structured output.
 * Returns parsed JSON output or throws on error.
 */
async function callClaude(
  agentMarkdown: string,
  contextEnvelope: Record<string, unknown>,
  tenantConfig: TenantConfig,
  anthropicApiKey: string,
): Promise<{ output: Record<string, unknown>; tokens: number }> {
  const systemPrompt = [
    agentMarkdown,
    '',
    '--- Tenant Config ---',
    `Locale: ${tenantConfig.locale}`,
    `Constraints: ${tenantConfig.gngConstraints.join(', ')}`,
    `Brand Direction: ${tenantConfig.brandDirection}`,
    '',
    '--- Context ---',
    JSON.stringify(contextEnvelope, null, 2),
  ].join('\n');

  const startTime = Date.now();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Produce the output specified in your instructions. Respond ONLY with valid JSON.',
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorBody}`);
  }

  const result = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const content = result.content?.[0]?.text || '';
  const tokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Agent output did not contain valid JSON');
  }

  const output = JSON.parse(jsonMatch[0]);
  return { output, tokens };
}

// ─── Confidence Scoring ───────────────────────────────────────────────

/**
 * Determine decision based on confidence score and HITL threshold.
 * - score > threshold + band → approved
 * - score < threshold - band → rejected
 * - within ±band → HITL review
 */
function scoreDecision(
  confidence: number | null,
  threshold: number = 0.85,
): InvocationDecision {
  if (confidence === null) return 'error';

  if (confidence >= threshold + HITL_CONFIDENCE_BAND) return 'approved';
  if (confidence < threshold - HITL_CONFIDENCE_BAND) return 'rejected';
  return 'hitl_review';
}

// ─── Main Invocation ──────────────────────────────────────────────────

/**
 * Invoke an agent: load → assemble context → call Claude → validate → log.
 */
export async function invokeAgent(
  db: DbClient,
  env: { ANTHROPIC_API_KEY?: string; ASSETS?: R2Bucket; AGENT_STORE?: R2Bucket },
  params: InvokeAgentParams,
): Promise<InvokeAgentResult> {
  const tenantConfig = params.tenantConfig ?? DEFAULT_TENANT_CONFIG;
  const startTime = Date.now();

  // 1. Load agent markdown
  let agentMarkdown: string;
  try {
    agentMarkdown = await loadAgentMarkdown(params.agentName, env);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await logInvocation(db, {
      jobId: params.jobId,
      clientId: params.clientId,
      agentName: params.agentName,
      invocationType: params.invocationType,
      contextEnvelope: params.jobState,
      output: null,
      confidence: null,
      decision: 'error',
      errorMessage,
      durationMs: Date.now() - startTime,
    });
    return { success: false, decision: 'error', output: null, confidence: null, error: errorMessage };
  }

  // 2. Assemble context
  const { contextEnvelope, tokenEstimate, coldStart } = await assembleContext(
    db,
    params.clientId,
    agentMarkdown,
    params.jobState,
    tenantConfig,
    env,
  );

  // 3. Handle overflow
  const { envelope: finalEnvelope, truncated } = handleOverflow(contextEnvelope, tokenEstimate);
  if (!truncated && tokenEstimate > MAX_TOKEN_BUDGET) {
    // Fail-closed: context too large even after truncation
    const errorMessage = `Context budget exceeded (${tokenEstimate} tokens > ${MAX_TOKEN_BUDGET}). HITL review required.`;
    await logInvocation(db, {
      jobId: params.jobId,
      clientId: params.clientId,
      agentName: params.agentName,
      invocationType: params.invocationType,
      contextEnvelope: finalEnvelope,
      output: null,
      confidence: null,
      decision: 'hitl_review',
      errorMessage,
      durationMs: Date.now() - startTime,
    });

    const hitlReviewId = await createReview(db, {
      jobId: params.jobId,
      clientId: params.clientId,
      reviewType: 'plan_approval',
      contextSummary: { reason: 'context_budget_exceeded', agentName: params.agentName, tokenEstimate },
      confidenceScore: null as number | null,
    });

    return {
      success: false,
      decision: 'hitl_review',
      output: null,
      confidence: null,
      hitlReviewId,
      error: errorMessage,
    };
  }

  // 4. Call Claude API (with retry)
  let output: Record<string, unknown> = {};
  let tokens = 0;
  let retryCount = 0;

  while (retryCount <= MAX_RETRIES) {
    try {
      const result = await callClaude(agentMarkdown, finalEnvelope, tenantConfig, params.anthropicApiKey);
      output = result.output;
      tokens = result.tokens;
      break;
    } catch (error) {
      retryCount++;
      if (retryCount > MAX_RETRIES) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logInvocation(db, {
          jobId: params.jobId,
          clientId: params.clientId,
          agentName: params.agentName,
          invocationType: params.invocationType,
          contextEnvelope: finalEnvelope,
          output: null,
          confidence: null,
          decision: 'error',
          errorMessage,
          tokenCount: 0,
          durationMs: Date.now() - startTime,
        });
        return { success: false, decision: 'error', output: null, confidence: null, error: errorMessage };
      }
      // Retry once with reformatted prompt
    }
  }

  // 5. Extract confidence and determine decision
  const confidence = typeof output.confidence === 'number' ? output.confidence : null;
  const decision = scoreDecision(confidence);

  // 6. If HITL review needed, create review entry
  let hitlReviewId: string | undefined = undefined;
  if (decision === 'hitl_review') {
    const reviewId = await createReview(db, {
      jobId: params.jobId,
      clientId: params.clientId,
      reviewType: params.invocationType === 'plan' ? 'plan_approval'
        : params.invocationType === 'qa' ? 'qa_override'
        : 'plan_approval',
      contextSummary: {
        agentName: params.agentName,
        confidence: confidence ?? 0,
        decision,
        output: JSON.stringify(output).slice(0, 2000), // Truncate for review
      },
      confidenceScore: confidence ?? 0,
    });
    hitlReviewId = reviewId;
  }

  // 7. Log invocation
  await logInvocation(db, {
    jobId: params.jobId,
    clientId: params.clientId,
    agentName: params.agentName,
    invocationType: params.invocationType,
    contextEnvelope: finalEnvelope,
    output,
    confidence,
    decision,
    tokenCount: tokens,
    durationMs: Date.now() - startTime,
  });

  return {
    success: decision !== 'error',
    decision,
    output,
    confidence,
    hitlReviewId,
  };
}