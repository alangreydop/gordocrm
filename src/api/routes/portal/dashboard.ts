import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
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
  const reviewWindowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    [headline],
    [marginAndUnits],
    [reviewSummary],
    [capacitySummary],
    [alerts],
    laneDistribution,
    statusBreakdown,
    recentJobs,
    upcomingReviews,
  ] = await Promise.all([
    db
      .select({
        activeJobs: sql<number>`cast(coalesce(sum(case when ${schema.jobs.status} in ('pending', 'processing') then 1 else 0 end), 0) as integer)`,
        urgentJobs: sql<number>`cast(coalesce(sum(case when ${schema.jobs.turnaround} = 'urgente' and ${schema.jobs.status} in ('pending', 'processing') then 1 else 0 end), 0) as integer)`,
        completedThisMonth: sql<number>`cast(coalesce(sum(case when ${schema.jobs.status} = 'completed' and ${schema.jobs.updatedAt} >= ${monthStart} then 1 else 0 end), 0) as integer)`,
        deliveredThisMonth: sql<number>`cast(coalesce(sum(case when ${schema.jobs.status} = 'delivered' and ${schema.jobs.updatedAt} >= ${monthStart} then 1 else 0 end), 0) as integer)`,
        totalClients: sql<number>`cast((select count(*) from ${schema.clients}) as integer)`,
      })
      .from(schema.jobs),
    db
      .select({
        unitsPlannedThisMonth: sql<number>`cast(coalesce(sum(case when ${schema.jobs.createdAt} >= ${monthStart} then ${schema.jobs.unitsPlanned} else 0 end), 0) as integer)`,
        unitsConsumedThisMonth: sql<number>`cast(coalesce(sum(case when ${schema.jobs.createdAt} >= ${monthStart} then ${schema.jobs.unitsConsumed} else 0 end), 0) as integer)`,
        avgEstimatedMargin: sql<number>`coalesce(avg(${schema.jobs.grossMarginEstimated}), 0)`,
        lowMarginJobs: sql<number>`cast(coalesce(sum(case when ${schema.jobs.grossMarginEstimated} is not null and ${schema.jobs.grossMarginEstimated} < 65 then 1 else 0 end), 0) as integer)`,
      })
      .from(schema.jobs),
    db
      .select({
        reviewsDueSoon: sql<number>`cast(coalesce(sum(case when ${schema.clients.nextReviewAt} >= ${now} and ${schema.clients.nextReviewAt} <= ${reviewWindowEnd} then 1 else 0 end), 0) as integer)`,
      })
      .from(schema.clients),
    // Capacity summary
    db
      .select({
        totalMonthlyCapacity: sql<number>`cast(coalesce(sum(${schema.clients.monthlyUnitCapacity}), 0) as integer)`,
        activeClients: sql<number>`cast(coalesce(sum(case when ${schema.clients.subscriptionStatus} = 'active' then 1 else 0 end), 0) as integer)`,
        avgUtilization: sql<number>`coalesce(avg(case when ${schema.clients.monthlyUnitCapacity} > 0 then cast(${schema.clients.monthlyUnitCapacity} as real) else null end), 0)`,
      })
      .from(schema.clients),
    // Alerts: jobs past due, low capacity clients
    db
      .select({
        pastDueJobs: sql<number>`cast(coalesce(sum(case when ${schema.jobs.dueAt} < ${now} and ${schema.jobs.status} in ('pending', 'processing') then 1 else 0 end), 0) as integer)`,
        clientsLowCapacity: sql<number>`cast(coalesce(sum(case when ${schema.clients.monthlyUnitCapacity} > 0 and ${schema.clients.monthlyUnitCapacity} - (select coalesce(sum(${schema.jobs.unitsConsumed}), 0) from ${schema.jobs} where ${schema.jobs.clientId} = ${schema.clients.id}) < 5 then 1 else 0 end), 0) as integer)`,
      })
      .from(schema.clients),
    // Lane distribution
    db
      .select({
        lane: schema.jobs.stackLane,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(schema.jobs)
      .groupBy(schema.jobs.stackLane),
    // Status breakdown
    db
      .select({
        status: schema.jobs.status,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(schema.jobs)
      .groupBy(schema.jobs.status),
    db
      .select({
        id: schema.jobs.id,
        clientId: schema.jobs.clientId,
        clientName: schema.clients.name,
        briefText: schema.jobs.briefText,
        status: schema.jobs.status,
        dueAt: schema.jobs.dueAt,
        unitsPlanned: schema.jobs.unitsPlanned,
        grossMarginEstimated: schema.jobs.grossMarginEstimated,
        turnaround: schema.jobs.turnaround,
        stackLane: schema.jobs.stackLane,
        benchmarkLevel: schema.jobs.benchmarkLevel,
        updatedAt: schema.jobs.updatedAt,
      })
      .from(schema.jobs)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
      .orderBy(desc(schema.jobs.updatedAt))
      .limit(8),
    db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        company: schema.clients.company,
        plan: schema.clients.plan,
        nextReviewAt: schema.clients.nextReviewAt,
        accountManager: schema.clients.accountManager,
      })
      .from(schema.clients)
      .where(
        and(
          gte(schema.clients.nextReviewAt, now),
          lte(schema.clients.nextReviewAt, reviewWindowEnd),
        ),
      )
      .orderBy(asc(schema.clients.nextReviewAt))
      .limit(6),
  ]);

  return c.json({
    activeJobs: headline?.activeJobs ?? 0,
    urgentJobs: headline?.urgentJobs ?? 0,
    completedThisMonth: headline?.completedThisMonth ?? 0,
    deliveredThisMonth: headline?.deliveredThisMonth ?? 0,
    totalClients: headline?.totalClients ?? 0,
    unitsPlannedThisMonth: marginAndUnits?.unitsPlannedThisMonth ?? 0,
    unitsConsumedThisMonth: marginAndUnits?.unitsConsumedThisMonth ?? 0,
    avgEstimatedMargin: marginAndUnits?.avgEstimatedMargin ?? 0,
    lowMarginJobs: marginAndUnits?.lowMarginJobs ?? 0,
    reviewsDueSoon: reviewSummary?.reviewsDueSoon ?? 0,
    totalMonthlyCapacity: capacitySummary?.totalMonthlyCapacity ?? 0,
    activeClients: capacitySummary?.activeClients ?? 0,
    avgUtilization: capacitySummary?.avgUtilization ?? 0,
    pastDueJobs: alerts?.pastDueJobs ?? 0,
    clientsLowCapacity: alerts?.clientsLowCapacity ?? 0,
    laneDistribution: laneDistribution || [],
    statusBreakdown: statusBreakdown || [],
    recentJobs,
    upcomingReviews,
  });
});
