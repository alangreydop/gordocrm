import { and, eq, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from '../db/index.js';
import { schema } from '../db/index.js';
import { authRoutes } from './api/routes/portal/auth.js';
import { assetsRoutes } from './api/routes/portal/assets.js';
import { briefRoutes } from './api/routes/portal/briefs.js';
import { clientRoutes } from './api/routes/portal/clients.js';
import { cronRoutes } from './api/routes/portal/cron.js';
import { dashboardRoutes } from './api/routes/portal/dashboard.js';
import { jobRoutes } from './api/routes/portal/jobs.js';
import { notificationRoutes } from './api/routes/portal/notifications.js';
import { searchRoutes } from './api/routes/portal/search.js';
import { publicBriefRoutes } from './api/routes/public/briefs.js';
import { aiProxyRoutes } from './api/routes/ai-proxy.js';
import { webhookRoutes } from './api/routes/portal/webhooks.js';
import { assistantRoutes } from './api/routes/portal/brief-assistant.js';
import { clientActivityRoutes } from './api/routes/portal/client-activities.js';
import { uploadRoutes } from './api/routes/portal/upload.js';
import { invoiceRoutes } from './api/routes/admin/invoices.js';
import { vaultRoutes } from './api/routes/portal/vault.js';
import { invoiceRoutes as clientInvoiceRoutes } from './api/routes/portal/invoices.js';
import { kanbanRoutes } from './api/routes/admin/kanban.js';
import { pipelineMappingRoutes } from './api/routes/portal/pipeline-mappings.js';
import { brandGraphRoutes } from './api/routes/portal/brand-graphs.js';
import { getAllowedOrigins, getConfig } from './lib/config.js';
import { sendQuarterlyReviewReminderEmail } from './lib/email.js';
import { getPortalBaseUrl } from './lib/portal-url.js';
import { leadWonWebhook } from './api/routes/lead-won-webhook.js';
import { getPendingQaJobs, markQaComplete, markQaFailed, markQaProcessing } from './lib/qa-queue.js';
import { scoreAsset } from './lib/qa-engine.js';
import type { AppBindings, AppContext } from './types/index.js';

const app = new Hono<AppContext>();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
});

// SECURITY: Security headers middleware
app.use('*', async (c, next) => {
  const isProd = c.env.APP_ENV === 'production';

  if (isProd) {
    // Content Security Policy
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https: data:",
        "font-src 'self' https:",
        "connect-src 'self' https://ai-engine.grandeandgordo.com https://resend.com",
        "frame-ancestors 'none'",
      ].join('; '),
    );

    // Clickjacking protection
    c.header('X-Frame-Options', 'DENY');

    // MIME sniffing protection
    c.header('X-Content-Type-Options', 'nosniff');

    // HSTS
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // Referrer policy
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  }

  await next();
});

app.use('*', async (c, next) => {
  c.set('db', getDb(c.env));
  await next();
});

app.use(
  '/api/*',
  cors({
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    origin: (origin, c) => {
      if (!origin) return undefined;
      const allowedOrigins = getAllowedOrigins(c.env as AppBindings);
      return allowedOrigins.includes(origin) ? origin : undefined;
    },
  }),
);

app.get('/health', (c) => {
  const config = getConfig(c.env);
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    database: 'd1',
    environment: config.APP_ENV,
  });
});

app.route('/api/portal/auth', authRoutes);
app.route('/api/portal/assets', assetsRoutes);
app.route('/api/portal/briefs', briefRoutes);
app.route('/api/portal/clients', clientRoutes);
app.route('/api/portal/cron', cronRoutes);
app.route('/api/portal/jobs', jobRoutes);
app.route('/api/portal/notifications', notificationRoutes);
app.route('/api/portal/dashboard', dashboardRoutes);
app.route('/api/portal/search', searchRoutes);
app.route('/api/portal/webhooks', webhookRoutes);
app.route('/api/portal/brief/assistant', assistantRoutes);
app.route('/api/portal/client/activities', clientActivityRoutes);
app.route('/api/portal/upload', uploadRoutes);
app.route('/api/portal/vault', vaultRoutes);
app.route('/api/portal/invoices', clientInvoiceRoutes);
app.route('/api/public/briefs', publicBriefRoutes);
app.route('/api/ai', aiProxyRoutes);
app.route('/api/admin/invoices', invoiceRoutes);
app.route('/api/admin/kanban', kanbanRoutes);
app.route('/api/webhooks', leadWonWebhook);
app.route('/api/portal/pipeline-mappings', pipelineMappingRoutes);
app.route('/api/portal/brand-graphs', brandGraphRoutes);

// Shared cron logic: quarterly review reminders
async function runQuarterlyReviewReminders(db: ReturnType<typeof getDb>, env: AppBindings) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const clientsDue = await db
    .select()
    .from(schema.clients)
    .where(
      and(
        or(lt(schema.clients.nextReviewAt, sevenDaysFromNow)),
        or(
          lt(schema.clients.lastContactedAt, sevenDaysAgo),
          eq(schema.clients.lastContactedAt, null as any),
        ),
      ),
    );

  let sentCount = 0;
  for (const client of clientsDue) {
    if (!client.userId) continue;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, client.userId))
      .limit(1);

    if (!user || !user.email) continue;

    const reviewDate = client.nextReviewAt
      ? new Date(client.nextReviewAt).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : 'esta semana';

    const result = await sendQuarterlyReviewReminderEmail(env, {
      clientEmail: user.email,
      clientName: client.name,
      clientCompany: client.company,
      portalUrl: getPortalBaseUrl(env),
      reviewDate,
    });

    if (result.ok && !result.skipped) {
      sentCount++;
      await db
        .update(schema.clients)
        .set({ lastContactedAt: new Date() })
        .where(eq(schema.clients.id, client.id));
    }
  }

  return { sent: sentCount, total: clientsDue.length };
}

// Manual trigger endpoint (backward compat / debugging)
app.get('/__scheduled', async (c) => {
  const db = c.get('db');
  const env = c.env as AppBindings;
  const result = await runQuarterlyReviewReminders(db, env);
  return c.json({ ok: true, ...result });
});

export default app;

// QA Engine cron processor
async function processQaQueue(db: ReturnType<typeof getDb>, env: AppBindings) {
  const pending = await getPendingQaJobs(db, 5);
  if (pending.length === 0) return { processed: 0 };

  let processed = 0;
  for (const qaItem of pending) {
    await markQaProcessing(db, qaItem.id);

    try {
      // Fetch asset details
      const [asset] = await db
        .select({
          r2Key: schema.assets.r2Key,
          type: schema.assets.type,
        })
        .from(schema.assets)
        .where(eq(schema.assets.id, qaItem.assetId))
        .limit(1);

      if (!asset) {
        await markQaFailed(db, qaItem.id, 'Asset not found');
        continue;
      }

      // Fetch client's brand graph
      const [client] = await db
        .select({ brandGraph: schema.clients.brandGraph })
        .from(schema.clients)
        .where(eq(schema.clients.id, qaItem.clientId))
        .limit(1);

      let brandGraph: unknown = null;
      if (client?.brandGraph) {
        try {
          brandGraph = JSON.parse(client.brandGraph);
        } catch {
          brandGraph = null;
        }
      }

      if (!env.ASSETS) {
        await markQaFailed(db, qaItem.id, 'R2 ASSETS bucket not configured');
        continue;
      }

      // Score asset
      const scores = await scoreAsset({
        r2Key: asset.r2Key,
        assetType: asset.type,
        brandGraph: brandGraph as any,
        anthropicApiKey: env.ANTHROPIC_API_KEY,
        assetsBucket: env.ASSETS,
      });

      const threshold = 85;
      const autoApproved = scores.overall >= threshold;

      await markQaComplete(db, qaItem.id, scores, autoApproved);

      // If auto-approved, update asset status
      if (autoApproved) {
        await db
          .update(schema.assets)
          .set({ status: 'approved', updatedAt: new Date() })
          .where(eq(schema.assets.id, qaItem.assetId));
      }

      processed++;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      await markQaFailed(db, qaItem.id, errorMessage);
      console.error(`[QA Engine] Failed to process QA ${qaItem.id}:`, errorMessage);
    }
  }

  return { processed };
}

export const scheduled = async (event: ScheduledEvent, env: AppBindings, ctx: ExecutionContext) => {
  const db = getDb(env);

  switch (event.cron) {
    case '0 9 * * 1':
      ctx.waitUntil(runQuarterlyReviewReminders(db, env));
      break;
    default:
      console.log(`[Cron] Unknown cron pattern: ${event.cron}`);
  }

  // Always process QA queue on every cron tick (rate-limited internally)
  ctx.waitUntil(processQaQueue(db, env));
};
