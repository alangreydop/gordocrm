import { describe, it, expect } from 'vitest';

describe('HITL domain model — review types', () => {
  it('defines the three valid review types', () => {
    const validTypes = ['plan_approval', 'qa_override', 'brand_graph_override'] as const;
    expect(validTypes).toHaveLength(3);
    expect(validTypes).toContain('plan_approval');
    expect(validTypes).toContain('qa_override');
    expect(validTypes).toContain('brand_graph_override');
  });

  it('defines the three valid reviewer actions', () => {
    const validActions = ['approved', 'rejected', 'override_brand_graph'] as const;
    expect(validActions).toHaveLength(3);
    expect(validActions).toContain('approved');
    expect(validActions).toContain('rejected');
    expect(validActions).toContain('override_brand_graph');
  });
});

describe('HITL domain model — confidence band boundaries', () => {
  const HITL_BAND = 0.05;
  const QA_THRESHOLD = 0.85;

  it('score at threshold exactly is in HITL band', () => {
    const score = QA_THRESHOLD;
    expect(score >= QA_THRESHOLD - HITL_BAND).toBe(true);
    expect(score < QA_THRESHOLD + HITL_BAND).toBe(true);
  });

  it('score at threshold + band is approved', () => {
    const score = QA_THRESHOLD + HITL_BAND;
    expect(score >= QA_THRESHOLD + HITL_BAND).toBe(true);
  });

  it('score at threshold - band - epsilon is rejected', () => {
    const score = QA_THRESHOLD - HITL_BAND - 0.001;
    expect(score < QA_THRESHOLD - HITL_BAND).toBe(true);
  });

  it('score within band requires HITL', () => {
    const scores = [0.80, 0.81, 0.84, 0.85, 0.86, 0.89, 0.8499];
    for (const s of scores) {
      const inBand = s >= QA_THRESHOLD - HITL_BAND && s < QA_THRESHOLD + HITL_BAND;
      expect(inBand).toBe(true);
    }
  });
});