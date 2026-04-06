import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

export const assetsRoutes = new Hono<AppContext>();

assetsRoutes.use('*', requireAuth);

assetsRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  if (user.role === 'admin') {
    // Admin ve todos los assets
    const assets = await db
      .select({
        id: schema.assets.id,
        jobId: schema.assets.jobId,
        jobBriefText: schema.jobs.briefText,
        label: schema.assets.label,
        type: schema.assets.type,
        r2Key: schema.assets.r2Key,
        deliveryUrl: schema.assets.deliveryUrl,
        status: schema.assets.status,
        metadata: schema.assets.metadata,
        createdAt: schema.assets.createdAt,
        updatedAt: schema.assets.updatedAt,
      })
      .from(schema.assets)
      .leftJoin(schema.jobs, eq(schema.jobs.id, schema.assets.jobId))
      .orderBy(desc(schema.assets.createdAt))
      .limit(50);

    return c.json({ assets });
  }

  // Cliente solo ve sus assets aprobados
  const [clientRecord] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!clientRecord) {
    return c.json({ assets: [] });
  }

  // Obtener jobs del cliente
  const clientJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.clientId, clientRecord.id));

  const jobIds = clientJobs.map((j) => j.id);

  if (jobIds.length === 0) {
    return c.json({ assets: [] });
  }

  // Assets aprobados (o sin QA status definido) de los jobs del cliente
  const assets = await db
    .select({
      id: schema.assets.id,
      jobId: schema.assets.jobId,
      jobBriefText: schema.jobs.briefText,
      label: schema.assets.label,
      type: schema.assets.type,
      r2Key: schema.assets.r2Key,
      deliveryUrl: schema.assets.deliveryUrl,
      status: schema.assets.status,
      metadata: schema.assets.metadata,
      createdAt: schema.assets.createdAt,
      updatedAt: schema.assets.updatedAt,
    })
    .from(schema.assets)
    .leftJoin(schema.jobs, eq(schema.jobs.id, schema.assets.jobId))
    .where(
      and(
        eq(schema.assets.jobId, schema.jobs.clientId),
        or(eq(schema.assets.status, 'approved'), isNull(schema.assets.status)),
      ),
    )
    .orderBy(desc(schema.assets.createdAt))
    .limit(50);

  return c.json({ assets });
});
