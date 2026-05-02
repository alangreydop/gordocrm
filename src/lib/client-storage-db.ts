import { eq, sql } from "drizzle-orm";
import { schema, type Database } from "../../db/index.js";
import {
  buildCanonicalBrandFolder,
  isCanonicalBrandFolder,
  resolveClientBrandFolder,
  type ClientStorageRecord,
} from "./client-storage.js";

function parseCanonicalClientNumber(folder: string | null | undefined): number | null {
  if (!isCanonicalBrandFolder(folder)) return null;
  const suffix = folder!.split("_").pop();
  const parsed = Number(suffix);
  return Number.isInteger(parsed) ? parsed : null;
}

async function nextClientNumber(db: Database): Promise<number> {
  const [row] = await db
    .select({
      nextClientNumber: sql<number>`cast(coalesce(max(${schema.clients.clientNumber}), 0) + 1 as integer)`,
    })
    .from(schema.clients);

  return row?.nextClientNumber ?? 1;
}

export async function ensureClientBrandFolder(
  db: Database,
  client: ClientStorageRecord,
): Promise<ClientStorageRecord & { brandFolder: string; clientNumber: number | null }> {
  if (isCanonicalBrandFolder(client.brandFolder)) {
    return { ...client, brandFolder: client.brandFolder!, clientNumber: client.clientNumber };
  }

  let clientNumber = client.clientNumber;
  let brandFolder: string | null = null;

  if (isCanonicalBrandFolder(client.externalClientId)) {
    brandFolder = client.externalClientId!;
    clientNumber = clientNumber ?? parseCanonicalClientNumber(brandFolder);
  } else {
    clientNumber = clientNumber ?? (await nextClientNumber(db));
    brandFolder = buildCanonicalBrandFolder(client.company || client.name, clientNumber);
  }

  const resolved = brandFolder ?? resolveClientBrandFolder({ ...client, clientNumber });
  await db
    .update(schema.clients)
    .set({
      brandFolder: resolved,
      clientNumber,
      updatedAt: new Date(),
    })
    .where(eq(schema.clients.id, client.id));

  return { ...client, brandFolder: resolved, clientNumber };
}
