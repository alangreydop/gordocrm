import { describe, it, expect } from 'vitest';
import { isBrandGraphReadyForQA } from './brand-graph.js';
import type { BrandGraphContext } from './brand-graph.js';

describe('brand-graph — isBrandGraphReadyForQA', () => {
  it('returns true when coverage >= 0.5 and all dimensions present', () => {
    const context: BrandGraphContext = {
      vectors: [
        { id: 'v1', clientId: 'c1', vectorType: 'color', label: 'red', value: '#FF0000', confidence: 0.9, source: 'manual' },
        { id: 'v2', clientId: 'c1', vectorType: 'typography', label: 'serif', value: 'Merriweather', confidence: 0.8, source: 'manual' },
        { id: 'v3', clientId: 'c1', vectorType: 'composition', label: 'centered', value: 'hero', confidence: 0.75, source: 'manual' },
        { id: 'v4', clientId: 'c1', vectorType: 'lighting', label: 'natural', value: 'golden-hour', confidence: 0.85, source: 'manual' },
        { id: 'v5', clientId: 'c1', vectorType: 'style', label: 'editorial', value: 'dark-rose', confidence: 0.88, source: 'manual' },
      ],
      coverage: [
        { dimension: 'color', coverageScore: 0.7, lastAssessedAt: new Date() },
        { dimension: 'typography', coverageScore: 0.6, lastAssessedAt: new Date() },
        { dimension: 'composition', coverageScore: 0.5, lastAssessedAt: new Date() },
        { dimension: 'lighting', coverageScore: 0.65, lastAssessedAt: new Date() },
        { dimension: 'style', coverageScore: 0.8, lastAssessedAt: new Date() },
      ],
      overallCoverage: 0.65,
      coldStart: false,
    };

    expect(isBrandGraphReadyForQA(context)).toBe(true);
  });

  it('returns false when coverage < 0.5', () => {
    const context: BrandGraphContext = {
      vectors: [],
      coverage: [],
      overallCoverage: 0.3,
      coldStart: false,
    };

    expect(isBrandGraphReadyForQA(context)).toBe(false);
  });

  it('returns false on cold start', () => {
    const context: BrandGraphContext = {
      vectors: [],
      coverage: [],
      overallCoverage: 0,
      coldStart: true,
    };

    expect(isBrandGraphReadyForQA(context)).toBe(false);
  });

  it('returns true at exactly 0.5 coverage with all dimensions', () => {
    const context: BrandGraphContext = {
      vectors: [
        { id: 'v1', clientId: 'c1', vectorType: 'color', label: 'red', value: '#FF0000', confidence: 0.7, source: 'manual' },
      ],
      coverage: [
        { dimension: 'color', coverageScore: 0.5, lastAssessedAt: new Date() },
        { dimension: 'typography', coverageScore: 0.5, lastAssessedAt: new Date() },
        { dimension: 'composition', coverageScore: 0.5, lastAssessedAt: new Date() },
        { dimension: 'lighting', coverageScore: 0.5, lastAssessedAt: new Date() },
        { dimension: 'style', coverageScore: 0.5, lastAssessedAt: new Date() },
      ],
      overallCoverage: 0.5,
      coldStart: false,
    };

    expect(isBrandGraphReadyForQA(context)).toBe(true);
  });

  it('returns false when a required dimension is missing', () => {
    const context: BrandGraphContext = {
      vectors: [
        { id: 'v1', clientId: 'c1', vectorType: 'color', label: 'red', value: '#FF0000', confidence: 0.9, source: 'manual' },
      ],
      coverage: [
        { dimension: 'color', coverageScore: 0.7, lastAssessedAt: new Date() },
        // Missing: typography, composition, lighting, style
      ],
      overallCoverage: 0.7,
      coldStart: false,
    };

    expect(isBrandGraphReadyForQA(context)).toBe(false);
  });
});