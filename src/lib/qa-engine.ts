/**
 * QA Engine — Anthropic vision scoring for asset quality
 *
 * Scores assets against brand graph criteria.
 * Requires ANTHROPIC_API_KEY secret.
 */

import type { R2Bucket } from '@cloudflare/workers-types';

export interface QaScores {
  consistency: number;
  composition: number;
  lighting: number;
  brandAlignment: number;
  overall: number;
}

interface BrandGraph {
  lighting?: string;
  angles?: string;
  materials?: string;
  compositionRules?: string;
  colorPalette?: string[];
  emotionalTone?: string;
  doNotUse?: string;
}

/**
 * Score a single asset using Anthropic Claude vision.
 * Fail-closed: throws if ANTHROPIC_API_KEY is not configured.
 * Assets without QA scores remain 'pending' for human review.
 */
export async function scoreAsset(params: {
  r2Key: string;
  assetType: string;
  brandGraph: BrandGraph | null;
  anthropicApiKey: string | undefined;
  assetsBucket: R2Bucket;
}): Promise<QaScores> {
  const { r2Key, assetType, brandGraph, anthropicApiKey, assetsBucket } = params;

  // Fetch asset from R2
  const object = await assetsBucket.get(r2Key);
  if (!object) {
    throw new Error(`Asset not found in R2: ${r2Key}`);
  }

  const bytes = await object.arrayBuffer();

  // Fail-closed: no API key means no QA, which means no auto-approval.
  // Assets without QA remain 'pending' until reviewed by a human.
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured — QA cannot run. Asset remains pending for human review.');
  }

  const base64Image = arrayBufferToBase64(bytes);
  const mediaType = assetType === 'video' ? 'image/jpeg' : 'image/png'; // thumbnails for videos

  const systemPrompt = buildQaSystemPrompt(brandGraph);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: 'Score this asset against the brand criteria above. Respond ONLY with a JSON object containing exactly these keys: consistency, composition, lighting, brand_alignment, overall. Each value must be an integer 0-100.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const result: any = await response.json();
  const content = result.content?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Anthropic response did not contain JSON scores');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    consistency: clampScore(parsed.consistency),
    composition: clampScore(parsed.composition),
    lighting: clampScore(parsed.lighting),
    brandAlignment: clampScore(parsed.brand_alignment),
    overall: clampScore(parsed.overall),
  };
}

function buildQaSystemPrompt(brandGraph: BrandGraph | null): string {
  const parts = ['You are a senior creative director scoring visual assets for brand consistency.'];

  if (brandGraph) {
    if (brandGraph.lighting) parts.push(`Lighting: ${brandGraph.lighting}`);
    if (brandGraph.angles) parts.push(`Angles: ${brandGraph.angles}`);
    if (brandGraph.materials) parts.push(`Materials: ${brandGraph.materials}`);
    if (brandGraph.compositionRules) parts.push(`Composition: ${brandGraph.compositionRules}`);
    if (brandGraph.colorPalette?.length) parts.push(`Color palette: ${brandGraph.colorPalette.join(', ')}`);
    if (brandGraph.emotionalTone) parts.push(`Emotional tone: ${brandGraph.emotionalTone}`);
    if (brandGraph.doNotUse) parts.push(`DO NOT USE: ${brandGraph.doNotUse}`);
  }

  parts.push(
    'Score each dimension 0-100. Be critical but fair. A score of 85+ means the asset is production-ready without human review.',
  );

  return parts.join('\n');
}

function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 50;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

// Mock scores removed — fail-closed: no API key means no QA, assets stay pending.
