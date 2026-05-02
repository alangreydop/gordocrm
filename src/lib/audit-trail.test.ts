import { describe, it, expect } from 'vitest';

describe('audit trail — invocation type mapping', () => {
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

  it('maps all 14 agents to invocation types', () => {
    // 14 agents total: 4 plan + 1 generate + 3 qa + 5 enrich + 1 curate
    expect(Object.keys(AGENT_INVOCATION_MAP)).toHaveLength(14);
  });

  it('maps plan agents correctly', () => {
    const planAgents = Object.entries(AGENT_INVOCATION_MAP).filter(([, type]) => type === 'plan');
    expect(planAgents).toHaveLength(4);
    expect(planAgents.map(([name]) => name)).toEqual([
      'visual-production-planner', 'design-ux-architect', 'design-ui-designer', 'design-whimsy-injector',
    ]);
  });

  it('maps generate agents correctly', () => {
    const generateAgents = Object.entries(AGENT_INVOCATION_MAP).filter(([, type]) => type === 'generate');
    expect(generateAgents).toHaveLength(1);
    expect(generateAgents[0]![0]).toBe('visual-prompt-engineer');
  });

  it('maps qa agents correctly', () => {
    const qaAgents = Object.entries(AGENT_INVOCATION_MAP).filter(([, type]) => type === 'qa');
    expect(qaAgents).toHaveLength(3);
    expect(qaAgents.map(([name]) => name)).toEqual([
      'design-qa-reviewer', 'visual-qa-brand-graph', 'design-brand-guardian',
    ]);
  });

  it('maps enrich agents correctly', () => {
    const enrichAgents = Object.entries(AGENT_INVOCATION_MAP).filter(([, type]) => type === 'enrich');
    expect(enrichAgents).toHaveLength(5);
    expect(enrichAgents.map(([name]) => name)).toEqual([
      'marketing-growth-hacker', 'marketing-content-creator', 'marketing-seo-specialist', 'eu-compliance-auditor', 'lead-enrichment-spain',
    ]);
  });

  it('maps curate agents correctly', () => {
    const curateAgents = Object.entries(AGENT_INVOCATION_MAP).filter(([, type]) => type === 'curate');
    expect(curateAgents).toHaveLength(1);
    expect(curateAgents[0]![0]).toBe('brand-graph-curator');
  });

  it('every invocation type is represented', () => {
    const types = new Set(Object.values(AGENT_INVOCATION_MAP));
    expect(types).toContain('plan');
    expect(types).toContain('generate');
    expect(types).toContain('qa');
    expect(types).toContain('enrich');
    expect(types).toContain('curate');
  });
});