import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { schema } from '../../../../db/index.js';
import { requireAdmin } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const clients = schema.clients;
const jobs = schema.jobs;
const assets = schema.assets;

const kanban = new Hono<AppContext>();

kanban.use('*', requireAdmin);

// Production stages for kanban
const PRODUCTION_STAGES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  REVIEW: 'review',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
};

kanban.get('/columns', async (c) => {
  const db = c.get('db');

  try {
    const allJobs = await db
      .select({
        id: jobs.id,
        clientId: jobs.clientId,
        clientName: clients.name,
        status: jobs.status,
        briefText: jobs.briefText,
        platform: jobs.platform,
        type: jobs.type,
        unitsPlanned: jobs.unitsPlanned,
        unitsConsumed: jobs.unitsConsumed,
        dueAt: jobs.dueAt,
        stackLane: jobs.stackLane,
        assetDominant: jobs.assetDominant,
        createdAt: jobs.createdAt,
        assetCount: sql<number>`(SELECT COUNT(*) FROM ${assets} WHERE ${assets.jobId} = ${jobs.id})`,
      })
      .from(jobs)
      .leftJoin(clients, eq(jobs.clientId, clients.id))
      .orderBy(desc(jobs.createdAt));

    // Group by status
    const columns = {
      [PRODUCTION_STAGES.PENDING]: [] as any[],
      [PRODUCTION_STAGES.PROCESSING]: [] as any[],
      [PRODUCTION_STAGES.REVIEW]: [] as any[],
      [PRODUCTION_STAGES.DELIVERED]: [] as any[],
      [PRODUCTION_STAGES.COMPLETED]: [] as any[],
    };

    allJobs.forEach((job) => {
      const status = job.status as keyof typeof columns;
      if (columns[status]) {
        columns[status].push({
          ...job,
          assetCount: Number(job.assetCount) || 0,
        });
      }
    });

    return c.json({ columns });
  } catch (error) {
    console.error('[Kanban] Error fetching columns:', error);
    return c.json({ error: 'Failed to fetch kanban columns' }, 500);
  }
});

kanban.patch('/jobs/:id/status', async (c) => {
  const db = c.get('db');
  const { id } = c.req.param();
  const body = await c.req.json();
  const { status } = body;

  if (!status || !Object.values(PRODUCTION_STAGES).includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  try {
    const updated = await db
      .update(jobs)
      .set({ status, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();

    if (!updated.length) {
      return c.json({ error: 'Job not found' }, 404);
    }

    return c.json({ job: updated[0] });
  } catch (error) {
    console.error('[Kanban] Error updating job status:', error);
    return c.json({ error: 'Failed to update job status' }, 500);
  }
});

kanban.get('/stats', async (c) => {
  const db = c.get('db');

  try {
    const stats = await db
      .select({
        status: jobs.status,
        count: sql<number>`COUNT(*)`,
        totalUnits: sql<number>`SUM(${jobs.unitsPlanned})`,
      })
      .from(jobs)
      .groupBy(jobs.status);

    const summary = {
      total: 0,
      pending: 0,
      processing: 0,
      review: 0,
      delivered: 0,
      completed: 0,
      totalUnits: 0,
    };

    stats.forEach((row) => {
      const key = row.status as string;
      summary[key as keyof typeof summary] = Number(row.count);
      summary.total += Number(row.count);
      summary.totalUnits += Number(row.totalUnits) || 0;
    });

    return c.json({ stats: summary });
  } catch (error) {
    console.error('[Kanban] Error fetching stats:', error);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

export { kanban as kanbanRoutes };
