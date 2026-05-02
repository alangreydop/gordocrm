import { and, eq, isNull, lte, or } from "drizzle-orm";
import { schema, type Database } from "../../db/index.js";
import type { AppBindings } from "../types/index.js";
import {
  buildBrandDnaSnapshotR2Key,
  resolveClientBrandFolder,
  sha256Hex,
} from "./client-storage.js";
import { ensureClientBrandFolder } from "./client-storage-db.js";
import {
  getBrandAssetReadiness,
  extractBrandAssetType,
} from "./brand-assets-readiness.js";

const STUCK_CAPTURE_MS = 60 * 1000;

type BrandDnaSources = {
  research_text?: string;
  logo_urls?: string[];
  reference_image_urls?: string[];
  website_url?: string;
  explicit?: {
    colors?: string[];
    typography?: string;
  };
};

type OrchestratorDnaResponse = {
  brandId?: string;
  version?: number;
  dna?: {
    colors?: string[];
    typography?: string;
    forbidden?: string[];
    mood?: string;
    voice?: string;
  };
  sourceHash?: string;
};

function safeJsonParse(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function publicUrlForR2Key(publicOrigin: string | undefined, r2Key: string): string | null {
  if (!publicOrigin) return null;
  return `${publicOrigin.replace(/\/$/, "")}/${r2Key}`;
}

async function hashSources(sources: BrandDnaSources): Promise<string> {
  const canonical = JSON.stringify(canonicalize(sources));
  return sha256Hex(new TextEncoder().encode(canonical).buffer as ArrayBuffer);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(record[key]);
        return acc;
      }, {});
  }
  return value;
}

function extractHexColors(...values: Array<string | null | undefined>): string[] {
  const colors = new Set<string>();
  for (const value of values) {
    for (const match of value?.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      colors.add(match.toUpperCase());
    }
  }
  return Array.from(colors).slice(0, 8);
}

function isKieVisionSupportedAsset(
  r2Key: string,
  url: string | null,
  metadata: Record<string, unknown>,
): boolean {
  const contentType = String(metadata.contentType ?? "").toLowerCase();
  if (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/jpg" ||
    contentType === "image/webp" ||
    contentType === "image/gif"
  ) {
    return true;
  }

  const candidate = `${r2Key} ${url ?? ""}`.toLowerCase();
  return /\.(png|jpe?g|webp|gif)(?:$|\?)/.test(candidate);
}

export async function buildBrandDnaSources(
  db: Database,
  clientId: string,
  publicAssetOrigin?: string,
): Promise<{ brandFolder: string; sources: BrandDnaSources; sourceHash: string }> {
  const [client] = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      company: schema.clients.company,
      websiteUrl: schema.clients.websiteUrl,
      clientNumber: schema.clients.clientNumber,
      brandFolder: schema.clients.brandFolder,
      externalClientId: schema.clients.externalClientId,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) throw new Error("Client not found");

  const storageClient = await ensureClientBrandFolder(db, client);
  const brandFolder = resolveClientBrandFolder(storageClient);

  const assets = await db
    .select({
      id: schema.assets.id,
      label: schema.assets.label,
      type: schema.assets.type,
      r2Key: schema.assets.r2Key,
      deliveryUrl: schema.assets.deliveryUrl,
      metadata: schema.assets.metadata,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.assets)
    .where(and(eq(schema.assets.clientId, clientId), eq(schema.assets.category, "assets")))
    .orderBy(schema.assets.createdAt);

  const logoUrls: string[] = [];
  const referenceUrls: string[] = [];
  const inventoryLines: string[] = [];
  const typographyHints: string[] = [];
  const colorHints: string[] = [];

  const canonicalAssets = assets.filter((asset) =>
    asset.r2Key.startsWith(`${brandFolder}/brand/assets/`),
  );
  const sourceAssets = canonicalAssets.length > 0 ? canonicalAssets : assets;

  for (const asset of sourceAssets) {
    const metadata = safeJsonParse(asset.metadata);
    const metadataType =
      typeof metadata.brandAssetType === "string" ? metadata.brandAssetType : null;
    const assetType = metadataType ?? extractBrandAssetType(asset.r2Key) ?? "other";
    const isCanonicalAsset = asset.r2Key.startsWith(`${brandFolder}/brand/assets/`);
    const url = asset.deliveryUrl ?? publicUrlForR2Key(publicAssetOrigin, asset.r2Key);

    inventoryLines.push(
      `- ${assetType}: ${asset.label ?? asset.r2Key} (${asset.type}, ${asset.r2Key}${isCanonicalAsset ? "" : ", legacy"})`,
    );

    if (assetType === "typography" || assetType === "font_file") {
      typographyHints.push(asset.label ?? asset.r2Key);
    }

    colorHints.push(
      ...extractHexColors(asset.label, asset.r2Key, JSON.stringify(metadata)),
    );

    if (
      !isCanonicalAsset ||
      !url?.startsWith("https://") ||
      !isKieVisionSupportedAsset(asset.r2Key, url, metadata)
    ) {
      continue;
    }
    if (assetType === "logo" && logoUrls.length < 3) {
      logoUrls.push(url);
    } else if (
      referenceUrls.length < 5 &&
      (assetType === "palette" || assetType === "iconography" || assetType === "identity_manual" || assetType === "other") &&
      (asset.type === "image" || String(metadata.contentType ?? "").startsWith("image/"))
    ) {
      referenceUrls.push(url);
    }
  }

  const explicit: BrandDnaSources["explicit"] = {};
  const colors = Array.from(new Set(colorHints)).slice(0, 8);
  if (colors.length > 0) explicit.colors = colors;
  if (typographyHints.length > 0) {
    explicit.typography = typographyHints.slice(0, 5).join(", ");
  }

  const sources: BrandDnaSources = {
    research_text: [
      `Client: ${client.name}`,
      client.company ? `Company: ${client.company}` : null,
      `Canonical R2 folder: ${brandFolder}`,
      "Uploaded brand assets:",
      ...inventoryLines,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000),
    ...(logoUrls.length > 0 ? { logo_urls: logoUrls } : {}),
    ...(referenceUrls.length > 0 ? { reference_image_urls: referenceUrls } : {}),
    ...(client.websiteUrl?.startsWith("https://") ? { website_url: client.websiteUrl } : {}),
    ...(Object.keys(explicit).length > 0 ? { explicit } : {}),
  };

  return { brandFolder, sources, sourceHash: await hashSources(sources) };
}

export async function enqueueBrandDnaCaptureIfReady(
  db: Database,
  clientId: string,
  triggerAssetId?: string,
): Promise<{ enqueued: boolean; skippedReason?: string; runId?: string }> {
  const readiness = await getBrandAssetReadiness(db, clientId);
  if (!readiness.ready) {
    return { enqueued: false, skippedReason: "brand_assets_incomplete" };
  }

  const { sourceHash } = await buildBrandDnaSources(db, clientId);

  const [activeRun] = await db
    .select({ id: schema.brandCaptureRuns.id })
    .from(schema.brandCaptureRuns)
    .where(
      and(
        eq(schema.brandCaptureRuns.clientId, clientId),
        or(
          eq(schema.brandCaptureRuns.status, "queued"),
          eq(schema.brandCaptureRuns.status, "processing"),
        ),
      ),
    )
    .limit(1);

  if (activeRun) {
    return { enqueued: false, skippedReason: "capture_already_queued", runId: activeRun.id };
  }

  const [completedRun] = await db
    .select({ id: schema.brandCaptureRuns.id })
    .from(schema.brandCaptureRuns)
    .where(
      and(
        eq(schema.brandCaptureRuns.clientId, clientId),
        eq(schema.brandCaptureRuns.sourceHash, sourceHash),
        eq(schema.brandCaptureRuns.status, "completed"),
      ),
    )
    .limit(1);

  if (completedRun) {
    return { enqueued: false, skippedReason: "capture_already_completed", runId: completedRun.id };
  }

  const runId = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.brandCaptureRuns).values({
    id: runId,
    clientId,
    triggerAssetId: triggerAssetId ?? null,
    status: "queued",
    sourceHash,
    createdAt: now,
    updatedAt: now,
  });

  await db
    .update(schema.clients)
    .set({ datasetStatus: "capture_ready", updatedAt: now })
    .where(eq(schema.clients.id, clientId));

  return { enqueued: true, runId };
}

async function callOrchestratorBrandDna(
  env: AppBindings,
  brandFolder: string,
  sources: BrandDnaSources,
): Promise<OrchestratorDnaResponse> {
  const baseUrl = env.ORCHESTRATOR_BASE_URL?.replace(/\/+$/, "");
  const adminKey = env.ORCHESTRATOR_ADMIN_KEY;
  if (!baseUrl || !adminKey) {
    throw new Error("ORCHESTRATOR_BASE_URL or ORCHESTRATOR_ADMIN_KEY not configured");
  }

  const response = await fetch(
    `${baseUrl}/api/brands/${encodeURIComponent(brandFolder)}/dna/regenerate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ sources }),
      redirect: "manual",
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Brand DNA capture failed: ${response.status} ${text.slice(0, 500)}`);
  }

  return (await response.json()) as OrchestratorDnaResponse;
}

function toClientBrandGraph(
  response: OrchestratorDnaResponse,
  params: {
    brandFolder: string;
    sourceHash: string;
    sources: BrandDnaSources;
  },
) {
  const dna = response.dna ?? {};
  return {
    colorPalette: Array.isArray(dna.colors) ? dna.colors : [],
    typography: typeof dna.typography === "string" ? dna.typography : "",
    emotionalTone: typeof dna.mood === "string" ? dna.mood : "",
    voice: typeof dna.voice === "string" ? dna.voice : "",
    doNotUse: Array.isArray(dna.forbidden) ? dna.forbidden.join(", ") : "",
    source: "orchestrator_brand_dna",
    sourceHash: response.sourceHash ?? params.sourceHash,
    version: response.version ?? null,
    brandFolder: params.brandFolder,
    capturedAt: new Date().toISOString(),
    evidence: {
      sources: params.sources,
    },
  };
}

export async function processPendingBrandCaptures(
  db: Database,
  env: AppBindings,
  limit = 3,
): Promise<{ processed: number; failed: number }> {
  const stuckThreshold = new Date(Date.now() - STUCK_CAPTURE_MS);
  const pending = await db
    .select()
    .from(schema.brandCaptureRuns)
    .where(
      or(
        eq(schema.brandCaptureRuns.status, "queued"),
        and(
          eq(schema.brandCaptureRuns.status, "processing"),
          or(
            isNull(schema.brandCaptureRuns.processingStartedAt),
            lte(schema.brandCaptureRuns.processingStartedAt, stuckThreshold),
          ),
        ),
      ),
    )
    .orderBy(schema.brandCaptureRuns.createdAt)
    .limit(limit);

  let processed = 0;
  let failed = 0;

  for (const run of pending) {
    const startedAt = new Date();
    await db
      .update(schema.brandCaptureRuns)
      .set({
        status: "processing",
        processingStartedAt: startedAt,
        updatedAt: startedAt,
        error: null,
      })
      .where(eq(schema.brandCaptureRuns.id, run.id));

    await db
      .update(schema.clients)
      .set({ datasetStatus: "capturing", updatedAt: startedAt })
      .where(eq(schema.clients.id, run.clientId));

    try {
      const { brandFolder, sources, sourceHash } = await buildBrandDnaSources(
        db,
        run.clientId,
        env.R2_PUBLIC_URL,
      );
      const response = await callOrchestratorBrandDna(env, brandFolder, sources);
      const brandGraph = toClientBrandGraph(response, { brandFolder, sourceHash, sources });
      const timestamp = Date.now();
      let snapshotR2Key: string | null = null;

      if (env.BRANDS) {
        snapshotR2Key = buildBrandDnaSnapshotR2Key(brandFolder, timestamp);
        await env.BRANDS.put(snapshotR2Key, JSON.stringify(brandGraph, null, 2), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: {
            source: "crm_brand_dna_capture",
            clientId: run.clientId,
            sourceHash,
          },
        });
      }

      const completedAt = new Date();
      await db
        .update(schema.clients)
        .set({
          brandGraph: JSON.stringify(brandGraph),
          datasetStatus: "captured",
          updatedAt: completedAt,
        })
        .where(eq(schema.clients.id, run.clientId));

      await db
        .update(schema.brandCaptureRuns)
        .set({
          status: "completed",
          sourceHash,
          resultVersion: response.version ?? null,
          snapshotR2Key,
          completedAt,
          updatedAt: completedAt,
          error: null,
        })
        .where(eq(schema.brandCaptureRuns.id, run.id));

      processed++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = new Date();
      await db
        .update(schema.brandCaptureRuns)
        .set({
          status: "failed",
          error: message,
          updatedAt: failedAt,
        })
        .where(eq(schema.brandCaptureRuns.id, run.id));

      await db
        .update(schema.clients)
        .set({ datasetStatus: "capture_failed", updatedAt: failedAt })
        .where(eq(schema.clients.id, run.clientId));
    }
  }

  return { processed, failed };
}
