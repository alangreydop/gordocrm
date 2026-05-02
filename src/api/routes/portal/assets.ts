import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { schema } from "../../../../db/index.js";
import { requireAuth } from "../../../lib/auth.js";
import { getBrandAssetReadiness } from "../../../lib/brand-assets-readiness.js";
import {
  enqueueBrandDnaCaptureIfReady,
  processPendingBrandCaptures,
} from "../../../lib/brand-dna-capture.js";
import type { AppContext } from "../../../types/index.js";

export const assetsRoutes = new Hono<AppContext>();

assetsRoutes.use("*", requireAuth);

const assetFields = {
  id: schema.assets.id,
  jobId: schema.assets.jobId,
  clientId: schema.assets.clientId,
  label: schema.assets.label,
  type: schema.assets.type,
  r2Key: schema.assets.r2Key,
  deliveryUrl: schema.assets.deliveryUrl,
  status: schema.assets.status,
  sku: schema.assets.sku,
  category: schema.assets.category,
  fileSize: schema.assets.fileSize,
  metadata: schema.assets.metadata,
  createdAt: schema.assets.createdAt,
  updatedAt: schema.assets.updatedAt,
};

assetsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = c.get("db");

  if (user.role === "admin") {
    const assets = await db
      .select({
        ...assetFields,
        jobBriefText: schema.jobs.briefText,
      })
      .from(schema.assets)
      .leftJoin(schema.jobs, eq(schema.jobs.id, schema.assets.jobId))
      .orderBy(desc(schema.assets.createdAt))
      .limit(100);

    return c.json({ assets });
  }

  // Client sees only their own assets
  const [clientRecord] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!clientRecord) {
    return c.json({ assets: [] });
  }

  // Get client's jobs
  const clientJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.clientId, clientRecord.id));

  const jobIds = clientJobs.map((j) => j.id);

  const visibleToClient = or(
    eq(schema.assets.status, "approved"),
    isNull(schema.assets.status),
    eq(schema.assets.category, "assets"),
  );

  if (jobIds.length === 0) {
    // Include client brand assets even while pending so the upload form updates immediately.
    const directAssets = await db
      .select(assetFields)
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.clientId, clientRecord.id),
          visibleToClient,
        ),
      )
      .orderBy(desc(schema.assets.createdAt))
      .limit(50);

    return c.json({ assets: directAssets });
  }

  // Approved job assets plus client brand assets, including freshly uploaded pending ones.
  const assets = await db
    .select(assetFields)
    .from(schema.assets)
    .where(
      and(
        or(
          inArray(schema.assets.jobId, jobIds),
          eq(schema.assets.clientId, clientRecord.id),
        ),
        visibleToClient,
      ),
    )
    .orderBy(desc(schema.assets.createdAt))
    .limit(50);

  return c.json({ assets });
});

// Brand assets readiness check
assetsRoutes.get("/brand-readiness", async (c) => {
  const user = c.get("user");
  const db = c.get("db");

  const [clientRecord] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!clientRecord) {
    return c.json({ error: "Client not found" }, 404);
  }

  const readiness = await getBrandAssetReadiness(db, clientRecord.id);

  return c.json({
    ready: readiness.ready,
    found: readiness.found,
    missing: readiness.missing,
    totalAssets: readiness.totalAssets,
  });
});

assetsRoutes.post("/brand-capture", async (c) => {
  const user = c.get("user");
  const db = c.get("db");

  let clientId: string | null = null;
  if (user.role === "admin") {
    clientId = c.req.query("clientId") ?? null;
  } else {
    const [clientRecord] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);
    clientId = clientRecord?.id ?? null;
  }

  if (!clientId) {
    return c.json({ error: "Client not found" }, 404);
  }

  const capture = await enqueueBrandDnaCaptureIfReady(db, clientId);
  if (capture.enqueued || capture.skippedReason === "capture_already_queued") {
    c.executionCtx.waitUntil(processPendingBrandCaptures(db, c.env, 1));
  }

  return c.json({ ok: true, capture });
});
