import { and, asc, desc, eq, gte, lte, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

export const dashboardRoutes = new Hono<AppContext>();

dashboardRoutes.use('*', requireAuth);

// Client cockpit — unified dashboard data in a single request
// Replaces 6 parallel client-side calls with one server-side join
dashboardRoutes.get('/client', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  if (user.role !== 'client') {
    return c.json({ error: 'Client access only' }, 403);
  }

  const [clientRecord] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!clientRecord) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const now = new Date();
  const clientId = clientRecord.id;

  const [
    jobsResult,
    latestBriefResult,
    activitiesResult,
    notificationsResult,
    assetsResult,
    brandAssetsResult,
  ] = await Promise.all([
    db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        briefText: schema.jobs.briefText,
        platform: schema.jobs.platform,
        type: schema.jobs.type,
        dueAt: schema.jobs.dueAt,
        unitsPlanned: schema.jobs.unitsPlanned,
        unitsConsumed: schema.jobs.unitsConsumed,
        updatedAt: schema.jobs.updatedAt,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.clientId, clientId))
      .orderBy(desc(schema.jobs.updatedAt))
      .limit(20),
    db
      .select({
        id: schema.briefSubmissions.id,
        contentType: schema.briefSubmissions.contentType,
        description: schema.briefSubmissions.description,
        status: schema.briefSubmissions.status,
        createdAt: schema.briefSubmissions.createdAt,
      })
      .from(schema.briefSubmissions)
      .where(eq(schema.briefSubmissions.clientId, clientId))
      .orderBy(desc(schema.briefSubmissions.createdAt))
      .limit(1),
    db
      .select()
      .from(schema.clientActivities)
      .where(eq(schema.clientActivities.clientId, clientId))
      .orderBy(desc(schema.clientActivities.createdAt))
      .limit(20),
    db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, user.id))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(10),
    db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.clientId, clientId),
          or(eq(schema.assets.status, 'approved'), eq(schema.assets.status, 'pending')),
        ),
      ),
    db
      .select({ r2Key: schema.assets.r2Key })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.clientId, clientId),
          eq(schema.assets.category, 'brand-assets'),
        ),
      ),
  ]);

  const REQUIRED_TYPES = ['logo', 'palette', 'identity_manual'];
  const foundTypes = new Set<string>();
  for (const asset of brandAssetsResult) {
    if (!asset.r2Key) continue;
    const parts = asset.r2Key.split('/');
    const assetsIdx = parts.indexOf('assets');
    if (assetsIdx !== -1 && assetsIdx + 1 < parts.length) {
      const filename = parts[assetsIdx + 1];
      if (!filename) continue;
      const typePrefix = filename.split('_')[0];
      const normalized = typePrefix === 'identity-manual' ? 'identity_manual' : typePrefix;
      if (normalized && REQUIRED_TYPES.includes(normalized)) {
        foundTypes.add(normalized);
      }
    }
  }
  const missingBrandAssets = REQUIRED_TYPES.filter((t) => !foundTypes.has(t));

  const unreadCount = notificationsResult.filter((n) => !n.read).length;

  return c.json({
    client: {
      id: clientRecord.id,
      name: clientRecord.name,
      company: clientRecord.company,
      plan: clientRecord.plan,
      subscriptionStatus: clientRecord.subscriptionStatus,
      datasetStatus: clientRecord.datasetStatus,
      monthlyUnitCapacity: clientRecord.monthlyUnitCapacity,
      accountManager: clientRecord.accountManager,
      nextReviewAt: clientRecord.nextReviewAt,
      onboardingCompletedAt: clientRecord.onboardingCompletedAt,
    },
    jobs: jobsResult,
    latestBrief: latestBriefResult[0] ?? null,
    activities: activitiesResult,
    notifications: notificationsResult,
    unreadCount,
    assetCount: assetsResult[0]?.count ?? 0,
    brandReadiness: {
      ready: missingBrandAssets.length === 0,
      missing: missingBrandAssets,
    },
  });
});

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
