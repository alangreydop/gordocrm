export type ClientStorageRecord = {
  id: string;
  name: string;
  company: string | null;
  clientNumber: number | null;
  brandFolder?: string | null;
  externalClientId?: string | null;
};

const CANONICAL_FOLDER_RE = /^[a-z0-9][a-z0-9-]*_[0-9]{3}$/;

export function slugifyStorageSegment(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "brand"
  );
}

export function sanitizeR2Filename(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "upload"
  );
}

export function formatClientNumber(clientNumber: number | null): string | null {
  if (clientNumber === null || !Number.isFinite(clientNumber)) return null;
  if (clientNumber < 0) return null;
  return String(Math.trunc(clientNumber)).padStart(3, "0");
}

export function buildCanonicalBrandFolder(
  name: string,
  clientNumber: number | null,
): string | null {
  const formattedNumber = formatClientNumber(clientNumber);
  if (!formattedNumber) return null;
  return `${slugifyStorageSegment(name)}_${formattedNumber}`;
}

export function isCanonicalBrandFolder(value: string | null | undefined): boolean {
  return typeof value === "string" && CANONICAL_FOLDER_RE.test(value);
}

export function resolveClientBrandFolder(client: ClientStorageRecord): string {
  if (isCanonicalBrandFolder(client.brandFolder)) {
    return client.brandFolder!;
  }

  const sourceName = client.company || client.name;
  const generated = buildCanonicalBrandFolder(sourceName, client.clientNumber);
  if (generated) return generated;

  // Migration bridge only: some existing clients already store puki_001-style
  // folder ids in external_client_id. New writes should persist brand_folder.
  if (isCanonicalBrandFolder(client.externalClientId)) {
    return client.externalClientId!;
  }

  return `${slugifyStorageSegment(sourceName)}_${client.id.slice(0, 8).toLowerCase()}`;
}

export function formatDateForR2(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function buildTempR2Key(
  brandFolder: string,
  timestamp: number,
  filename: string,
): string {
  return `${brandFolder}/temp/${timestamp}_${sanitizeR2Filename(filename)}`;
}

export function buildBrandAssetR2Key(
  brandFolder: string,
  assetType: string,
  timestamp: number,
  filename: string,
): string {
  return `${brandFolder}/brand/assets/${slugifyStorageSegment(assetType)}_${timestamp}_${sanitizeR2Filename(filename)}`;
}

export function buildJobInputR2Key(params: {
  brandFolder: string;
  jobId: string;
  filename: string;
  sku?: string | null;
  platforms?: string | null;
  date?: Date;
}): string {
  const safeName = sanitizeR2Filename(params.filename);
  const ext = safeName.includes(".") ? safeName.split(".").pop() || "bin" : "bin";
  const brandSlug = params.brandFolder.split("_")[0] || "brand";
  const dateStr = formatDateForR2(params.date);
  const skuPart = params.sku ? `_${slugifyStorageSegment(params.sku)}` : "";
  const platformPart = params.platforms ? `_${slugifyStorageSegment(params.platforms)}` : "";
  const outputName = `${brandSlug}_${params.jobId}_${dateStr}${skuPart}${platformPart}.${ext}`;
  return `${params.brandFolder}/jobs/${params.jobId}/inputs/${outputName}`;
}

export function buildJobOutputPrefix(brandFolder: string, jobId: string): string {
  return `${brandFolder}/jobs/${jobId}/output/`;
}

export function buildBrandDnaSnapshotR2Key(
  brandFolder: string,
  timestamp: number,
): string {
  return `${brandFolder}/brand/dna/brand_graph_${timestamp}.json`;
}

export function classifyClientR2Key(
  r2Key: string | null,
  canonicalBrandFolder: string,
): "canonical" | "legacy" | "external" | "unknown" {
  if (!r2Key) return "unknown";
  if (r2Key.startsWith(`${canonicalBrandFolder}/`)) return "canonical";
  if (r2Key.startsWith("clients/")) return "legacy";
  if (r2Key.includes("/brand-assets/")) return "legacy";
  if (/^[^/]+\/[^/]+\/(inputs|outputs)\//.test(r2Key)) return "legacy";
  if (/^[^/]+\/assets\//.test(r2Key)) return "external";
  return "unknown";
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
