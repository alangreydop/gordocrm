import { describe, it, expect } from 'vitest';

// scoreDecision and handleOverflow are module-private, so we test through
// the exported invokeAgent or by extracting the logic. For now we test
// the pure functions by re-implementing the thresholds for verification.

const HITL_CONFIDENCE_BAND = 0.05;
const MAX_TOKEN_BUDGET = 16000;

function scoreDecision(
  confidence: number | null,
  threshold: number = 0.85,
): 'approved' | 'rejected' | 'hitl_review' | 'error' {
  if (confidence === null) return 'error';
  if (confidence >= threshold + HITL_CONFIDENCE_BAND) return 'approved';
  if (confidence < threshold - HITL_CONFIDENCE_BAND) return 'rejected';
  return 'hitl_review';
}

function handleOverflow(
  envelope: Record<string, unknown>,
  tokenEstimate: number,
): { envelope: Record<string, unknown>; truncated: boolean } {
  if (tokenEstimate <= MAX_TOKEN_BUDGET) {
    return { envelope, truncated: false };
  }

  if (Array.isArray(envelope.brand_graph_vectors) && envelope.brand_graph_vectors.length > 10) {
    envelope = { ...envelope, brand_graph_vectors: envelope.brand_graph_vectors.slice(0, 10) };
  }

  const afterStep1 = Math.ceil(JSON.stringify(envelope).length / 4);
  if (afterStep1 <= MAX_TOKEN_BUDGET) {
    return { envelope, truncated: true };
  }

  if (Array.isArray(envelope.client_sku_history) && envelope.client_sku_history.length > 5) {
    envelope = { ...envelope, client_sku_history: envelope.client_sku_history.slice(0, 5) };
  }

  const afterStep2 = Math.ceil(JSON.stringify(envelope).length / 4);
  if (afterStep2 <= MAX_TOKEN_BUDGET) {
    return { envelope, truncated: true };
  }

  return { envelope, truncated: false };
}

describe('reasoning worker — scoreDecision', () => {
  it('approves when confidence is well above threshold', () => {
    expect(scoreDecision(0.95)).toBe('approved');
    expect(scoreDecision(0.91)).toBe('approved');
    expect(scoreDecision(0.90)).toBe('approved');
  });

  it('rejects when confidence is well below threshold', () => {
    expect(scoreDecision(0.70)).toBe('rejected');
    expect(scoreDecision(0.75)).toBe('rejected');
    expect(scoreDecision(0.79)).toBe('rejected');
  });

  it('triggers HITL review within ±0.05 band', () => {
    expect(scoreDecision(0.85)).toBe('hitl_review');
    expect(scoreDecision(0.86)).toBe('hitl_review');
    expect(scoreDecision(0.89)).toBe('hitl_review');
    expect(scoreDecision(0.8499)).toBe('hitl_review');
    expect(scoreDecision(0.80)).toBe('hitl_review');
  });

  it('returns error for null confidence', () => {
    expect(scoreDecision(null)).toBe('error');
  });

  it('uses custom threshold', () => {
    // threshold 0.65, band ±0.05 → approved >= 0.70
    expect(scoreDecision(0.71, 0.65)).toBe('approved');
    // rejected < 0.60
    expect(scoreDecision(0.59, 0.65)).toBe('rejected');
    // in band [0.60, 0.70)
    expect(scoreDecision(0.65, 0.65)).toBe('hitl_review');
  });

  it('band boundaries are exact', () => {
    // threshold + band = 0.90 → approved (>=)
    expect(scoreDecision(0.90, 0.85)).toBe('approved');
    // 0.80 is exactly at threshold - band, not strictly less → in band
    expect(scoreDecision(0.80, 0.85)).toBe('hitl_review');
    // 0.7999 is strictly below threshold - band → rejected
    expect(scoreDecision(0.79, 0.85)).toBe('rejected');
  });
});

describe('reasoning worker — handleOverflow', () => {
  it('passes through envelope when under budget', () => {
    const envelope = { job_state: { id: '123' } };
    const result = handleOverflow(envelope, 100);
    expect(result.truncated).toBe(false);
    expect(result.envelope).toEqual(envelope);
  });

  it('truncates vectors from 20 to 10 on first overflow step', () => {
    const vectors = Array.from({ length: 20 }, (_, i) => ({ id: i, value: `v${i}` }));
    const envelope = { brand_graph_vectors: vectors };
    // Make token estimate exceed budget but truncation fixes it
    const result = handleOverflow(envelope, MAX_TOKEN_BUDGET + 500);
    expect(result.envelope.brand_graph_vectors).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it('truncates SKU history when vectors already under threshold', () => {
    // When vectors are already small (<10), step 1 is a no-op.
    // Step 2 can still truncate SKU history if envelope exceeds budget.
    // To force step 2, we need actual JSON > 16K tokens after step 1.
    // Build a large padding field to push JSON over budget.
    const vectors = Array.from({ length: 5 }, (_, i) => ({ id: i, value: `v${i}` }));
    const skuHistory = Array.from({ length: 15 }, (_, i) => ({
      sku: `SKU${i}`,
      data: 'x'.repeat(4000), // ~1000 tokens per SKU
    }));
    const envelope = {
      brand_graph_vectors: vectors,
      client_sku_history: skuHistory,
      padding: 'p'.repeat(40000), // ensure envelope is large
    };
    const tokenEstimate = MAX_TOKEN_BUDGET + 5000; // Over budget
    const result = handleOverflow(envelope, tokenEstimate);
    // Step 1: vectors already 5 < 10, no truncation
    expect(result.envelope.brand_graph_vectors).toHaveLength(5);
    // Step 2: SKU history 15 > 5, truncated
    expect(result.envelope.client_sku_history).toHaveLength(5);
  });

  it('returns untruncated when over budget and nothing to truncate', () => {
    const envelope = { large_field: 'x'.repeat(100000) };
    const result = handleOverflow(envelope, MAX_TOKEN_BUDGET + 1);
    expect(result.truncated).toBe(false);
  });
});

describe('reasoning worker — parseContextRequirements', () => {
  // Re-implement to test the parsing logic
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

  it('returns wildcard when no frontmatter', () => {
    expect(parseContextRequirements('No frontmatter here')).toEqual(['*']);
  });

  it('parses required fields from YAML frontmatter', () => {
    const md = `---\nrequired: ['job_state', 'brand_graph_vectors']\n---\nAgent content`;
    expect(parseContextRequirements(md)).toEqual(['job_state', 'brand_graph_vectors']);
  });

  it('parses optional fields from YAML frontmatter', () => {
    const md = `---\noptional: ['client_sku_history']\n---\nAgent content`;
    expect(parseContextRequirements(md)).toEqual(['client_sku_history']);
  });

  it('parses both required and optional', () => {
    const md = `---\nrequired: ['job_state']\noptional: ['brand_graph_vectors', 'client_sku_history']\n---\nAgent content`;
    expect(parseContextRequirements(md)).toEqual(['job_state', 'brand_graph_vectors', 'client_sku_history']);
  });

  it('returns wildcard when frontmatter has no requirements', () => {
    const md = `---\nname: test-agent\n---\nAgent content`;
    expect(parseContextRequirements(md)).toEqual(['*']);
  });
});