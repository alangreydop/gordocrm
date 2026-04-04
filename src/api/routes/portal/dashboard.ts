import type { FastifyInstance } from 'fastify';
import { eq, sql, and, gte } from 'drizzle-orm';
import { db, schema } from '../../../../db/index.js';
import { requireAdmin } from '../../../lib/auth.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  app.get('/stats', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [[activeJobs], [completedThisMonth], [totalClients]] = await Promise.all([
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.jobs)
        .where(
          sql`${schema.jobs.status} IN ('pending', 'processing')`,
        ),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.status, 'completed'),
            gte(schema.jobs.updatedAt, monthStart),
          ),
        ),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.clients),
    ]);

    return {
      activeJobs: activeJobs?.value ?? 0,
      completedThisMonth: completedThisMonth?.value ?? 0,
      totalClients: totalClients?.value ?? 0,
    };
  });
}
