/**
 * Brand Graph — Vector retrieval, coverage model, and cold-start handling
 *
 * Brand Graph stores visual identity vectors per client.
 * Coverage scoring tracks how complete each dimension is.
 * Cold-start: clients with no vectors defer to human review.
 */

import { eq, and, desc } from 'drizzle-orm';
import { schema } from '../../db/index.js';
import type { getDb } from '../../db/index.js';

type DbClient = ReturnType<typeof getDb>;

export interface BrandGraphVector {
  id: string;
  clientId: string;
  vectorType: string;
  label: string;
  value: string; // JSON: hex color, description, or embedding array
  confidence: number;
  source: string;
}

export interface BrandGraphCoverage {
  dimension: string;
  coverageScore: number;
  lastAssessedAt: Date;
}

export interface BrandGraphContext {
  vectors: BrandGraphVector[];
  coverage: BrandGraphCoverage[];
  overallCoverage: number;
  coldStart: boolean;
}

const REQUIRED_DIMENSIONS = ['color', 'typography', 'composition', 'lighting', 'style'] as const;

type Dimension = typeof REQUIRED_DIMENSIONS[number];

const MIN_VECTORS_FOR_COVERAGE: Record<Dimension, number> = {
  color: 3,
  typography: 1,
  composition: 2,
  lighting: 2,
  style: 2,
};

/**
 * Retrieve Brand Graph context for a client.
 * Returns vectors, coverage, and cold-start status.
 */
export async function getBrandGraphContext(
  db: DbClient,
  clientId: string,
): Promise<BrandGraphContext> {
  const vectors = await db
    .select({
      id: schema.brandGraphVectors.id,
      clientId: schema.brandGraphVectors.clientId,
      vectorType: schema.brandGraphVectors.vectorType,
      label: schema.brandGraphVectors.label,
      value: schema.brandGraphVectors.value,
      confidence: schema.brandGraphVectors.confidence,
      source: schema.brandGraphVectors.source,
    })
    .from(schema.brandGraphVectors)
    .where(eq(schema.brandGraphVectors.clientId, clientId))
    .orderBy(desc(schema.brandGraphVectors.confidence));

  const coverageRows = await db
    .select({
      dimension: schema.brandGraphCoverage.dimension,
      coverageScore: schema.brandGraphCoverage.coverageScore,
      lastAssessedAt: schema.brandGraphCoverage.lastAssessedAt,
    })
    .from(schema.brandGraphCoverage)
    .where(eq(schema.brandGraphCoverage.clientId, clientId));

  // Calculate coverage from vectors if no coverage rows exist
  const coverage = coverageRows.length > 0
    ? coverageRows
    : calculateCoverage(vectors);

  const overallCoverage = coverage.length > 0
    ? coverage.reduce((sum: number, c) => sum + c.coverageScore, 0) / coverage.length
    : 0;

  const coldStart = vectors.length === 0 || overallCoverage < 0.3;

  return {
    vectors,
    coverage,
    overallCoverage,
    coldStart,
  };
}

/**
 * Get top-N vectors by confidence, optionally filtered by type.
 */
export async function getTopVectors(
  db: DbClient,
  clientId: string,
  limit: number = 20,
  vectorType?: string,
): Promise<BrandGraphVector[]> {
  const conditions = vectorType
    ? and(eq(schema.brandGraphVectors.clientId, clientId), eq(schema.brandGraphVectors.vectorType, vectorType))
    : eq(schema.brandGraphVectors.clientId, clientId);

  const rows = await db
    .select({
      id: schema.brandGraphVectors.id,
      clientId: schema.brandGraphVectors.clientId,
      vectorType: schema.brandGraphVectors.vectorType,
      label: schema.brandGraphVectors.label,
      value: schema.brandGraphVectors.value,
      confidence: schema.brandGraphVectors.confidence,
      source: schema.brandGraphVectors.source,
    })
    .from(schema.brandGraphVectors)
    .where(conditions)
    .orderBy(desc(schema.brandGraphVectors.confidence))
    .limit(limit);

  return rows;
}

/**
 * Calculate coverage from existing vectors.
 * Each dimension has a minimum number of vectors for full coverage.
 */
function calculateCoverage(vectors: BrandGraphVector[]): BrandGraphCoverage[] {
  const byType = new Map<Dimension, number>();

  for (const v of vectors) {
    const dim = v.vectorType as Dimension;
    byType.set(dim, (byType.get(dim) || 0) + 1);
  }

  return REQUIRED_DIMENSIONS.map((dim) => {
    const count = byType.get(dim) || 0;
    const required = MIN_VECTORS_FOR_COVERAGE[dim];
    const score = Math.min(1, count / required);

    return {
      dimension: dim,
      coverageScore: score,
      lastAssessedAt: new Date(),
    };
  });
}

/**
 * Check if a client has sufficient Brand Graph data for automated QA.
 * Returns true if coverage is adequate, false if human review is needed.
 */
export function isBrandGraphReadyForQA(context: BrandGraphContext): boolean {
  if (context.coldStart) return false;
  if (context.overallCoverage < 0.5) return false;

  // Every dimension must have at least 1 vector
  const hasAllDimensions = REQUIRED_DIMENSIONS.every((dim) => {
    const dimCoverage = context.coverage.find((c) => c.dimension === dim);
    return dimCoverage && dimCoverage.coverageScore > 0;
  });

  return hasAllDimensions;
}

/**
 * Get seeding guidance for a cold-start client.
 * Returns the minimum required vectors per dimension.
 */
export function getSeedingGuidance(): Record<Dimension, { minimum: number; description: string }> {
  return {
    color: { minimum: 3, description: 'Primary, secondary, and accent brand colors' },
    typography: { minimum: 1, description: 'Primary font family and style' },
    composition: { minimum: 2, description: 'Composition rules (e.g., centered hero, rule-of-thirds)' },
    lighting: { minimum: 2, description: 'Preferred lighting styles (e.g., natural, studio, moody)' },
    style: { minimum: 2, description: 'Overall visual style references (e.g., editorial, minimalist, bold)' },
  };
}