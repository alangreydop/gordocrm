import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../../../../db/index.js';
import { requireAdmin } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

export const dashboardRoutes = new Hono<AppContext>();

dashboardRoutes.use('*', requireAdmin);

dashboardRoutes.get('/stats', async (c) => {
  const db = c.get('db');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[activeJobs], [completedThisMonth], [totalClients]] = await Promise.all([
    db
      .select({ value: sql<number>`cast(count(*) as integer)` })
      .from(schema.jobs)
      .where(inArray(schema.jobs.status, ['pending', 'processing'])),
    db
      .select({ value: sql<number>`cast(count(*) as integer)` })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.status, 'completed'),
          gte(schema.jobs.updatedAt, monthStart),
        ),
      ),
    db
      .select({ value: sql<number>`cast(count(*) as integer)` })
      .from(schema.clients),
  ]);

  return c.json({
    activeJobs: activeJobs?.value ?? 0,
    completedThisMonth: completedThisMonth?.value ?? 0,
    totalClients: totalClients?.value ?? 0,
  });
});
