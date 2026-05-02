import { and, eq } from "drizzle-orm";
import { schema, type Database } from "../../db/index.js";
import type { ClientDatasetStatus } from "../types/index.js";

const KNOWN_BRAND_ASSET_TYPES = [
  "logo",
  "typography",
  "font_file",
  "palette",
  "identity_manual",
  "iconography",
] as const;

const REQUIRED_BRAND_ASSET_GROUPS = [
  { key: "logo", types: ["logo"] },
  { key: "palette", types: ["palette"] },
  { key: "typography", types: ["typography", "font_file"] },
] as const;

export type BrandAssetReadiness = {
  ready: boolean;
  found: string[];
  missing: string[];
  totalAssets: number;
};

export function extractBrandAssetType(r2Key: string | null): string | null {
  if (!r2Key) return null;

  const parts = r2Key.split("/");
  const folderIdx = parts.indexOf("assets");
  const legacyFolderIdx = parts.indexOf("brand-assets");
  const assetIdx = folderIdx !== -1 ? folderIdx : legacyFolderIdx;

  if (assetIdx === -1 || assetIdx + 1 >= parts.length) return null;

  const filename = parts[assetIdx + 1];
  if (!filename) return null;

  const typePrefix = filename.split("_")[0] ?? "";
  const normalized = typePrefix.replace(/-/g, "_");

  if (normalized === "other") return normalized;
  return KNOWN_BRAND_ASSET_TYPES.includes(
    normalized as (typeof KNOWN_BRAND_ASSET_TYPES)[number],
  )
    ? normalized
    : null;
}

export function computeBrandAssetReadinessFromKeys(
  r2Keys: Array<string | null>,
): BrandAssetReadiness {
  const foundTypes = new Set<string>();
  let otherPrefixCount = 0;

  for (const r2Key of r2Keys) {
    const type = extractBrandAssetType(r2Key);
    if (!type) continue;
    if (type === "other") {
      otherPrefixCount++;
      continue;
    }
    foundTypes.add(type);
  }

  const missingGroups = () =>
    REQUIRED_BRAND_ASSET_GROUPS.filter((group) =>
      group.types.every((type) => !foundTypes.has(type)),
    );

  // Assets uploaded before the asset_type bugfix have an "other_" prefix.
  // Treat each one as satisfying one missing required group.
  for (const group of missingGroups().slice(0, otherPrefixCount)) {
    foundTypes.add(group.key);
  }

  const missing = missingGroups().map((group) => group.key);

  return {
    ready: missing.length === 0,
    found: Array.from(foundTypes),
    missing,
    totalAssets: r2Keys.length,
  };
}

export async function getBrandAssetReadiness(
  db: Database,
  clientId: string,
): Promise<BrandAssetReadiness> {
  const assets = await db
    .select({ r2Key: schema.assets.r2Key })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.clientId, clientId),
        eq(schema.assets.category, "assets"),
      ),
    );

  return computeBrandAssetReadinessFromKeys(assets.map((asset) => asset.r2Key));
}

export async function syncClientDatasetStatus(
  db: Database,
  clientId: string,
  currentStatus?: ClientDatasetStatus,
): Promise<ClientDatasetStatus> {
  const readiness = await getBrandAssetReadiness(db, clientId);
  const status = currentStatus ?? (await getCurrentDatasetStatus(db, clientId));
  const hasCapturedGraph = await clientHasBrandGraph(db, clientId);

  if (hasCapturedGraph && status !== "captured") {
    await db
      .update(schema.clients)
      .set({ datasetStatus: "captured", updatedAt: new Date() })
      .where(eq(schema.clients.id, clientId));
    return "captured";
  }

  if (!readiness.ready) {
    return status;
  }

  if (
    status === "capture_ready" ||
    status === "capturing" ||
    status === "captured" ||
    status === "capture_failed"
  ) {
    return status;
  }

  await db
    .update(schema.clients)
    .set({ datasetStatus: "capture_ready", updatedAt: new Date() })
    .where(eq(schema.clients.id, clientId));

  return "capture_ready";
}

async function getCurrentDatasetStatus(
  db: Database,
  clientId: string,
): Promise<ClientDatasetStatus> {
  const [client] = await db
    .select({ datasetStatus: schema.clients.datasetStatus })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  return (
    (client?.datasetStatus as ClientDatasetStatus | undefined) ??
    "pending_capture"
  );
}

async function clientHasBrandGraph(
  db: Database,
  clientId: string,
): Promise<boolean> {
  const [client] = await db
    .select({ brandGraph: schema.clients.brandGraph })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  return !!client?.brandGraph;
}
