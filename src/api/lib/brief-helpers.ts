import type { AppBindings } from '../../types/index.js';

export function parseOptimizedBrief(optimizedBrief: string | null): Record<string, unknown> {
  if (!optimizedBrief) return {};
  try {
    return JSON.parse(optimizedBrief) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function buildPromptFromBrief(
  brief: {
    description?: string | null;
    objective?: string | null;
    style?: string | null;
    audience?: string | null;
    cta?: string | null;
  },
  ob: Record<string, unknown>,
  maxTotalLength = 2000,
): string {
  const safeString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const parts: string[] = [];
  const obObjective = safeString(ob.objective) || brief.objective || undefined;
  const obUsage = safeString(ob.usageContext);
  const obStyle = safeString(ob.style) || brief.style || undefined;
  const obAudience = safeString(ob.audience) || brief.audience || undefined;
  const obCta = safeString(ob.cta) || brief.cta || undefined;
  const obDesc = safeString(ob.description) || brief.description || undefined;

  if (obObjective) parts.push(`Objetivo: ${obObjective}`);
  if (obUsage) parts.push(`Canal / uso: ${obUsage}`);
  if (obStyle) parts.push(`Estilo: ${obStyle}`);
  if (obAudience) parts.push(`Audiencia: ${obAudience}`);
  if (obCta) parts.push(`CTA: ${obCta}`);
  if (obDesc) parts.push(`Descripción: ${obDesc}`);

  let prompt = parts.join('\n\n');
  if (prompt.length > maxTotalLength) {
    prompt = prompt.slice(0, maxTotalLength) + '…';
  }
  return prompt;
}

export function resolveOrchestratorBase(env: AppBindings): string | undefined {
  const base = env.ORCHESTRATOR_BASE_URL?.replace(/\/+$/, '');
  return base || undefined;
}

export function extractBriefImageUrls(ob: Record<string, unknown>): string[] {
  if (!Array.isArray(ob.productImageUrls)) return [];
  return ob.productImageUrls
    .filter((u): u is string => typeof u === 'string')
    .filter((u) => {
      try {
        const url = new URL(u);
        return url.protocol === 'https:';
      } catch {
        return false;
      }
    });
}

export function extractBriefSku(ob: Record<string, unknown>): string | undefined {
  const sku = safeString(ob.sku);
  return sku && sku.trim() ? sku.trim() : undefined;
}

export function extractAspectRatio(ob: Record<string, unknown>): string {
  const ar = safeString(ob.aspectRatio);
  return ar && ar.trim() ? ar.trim() : '1:1';
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
