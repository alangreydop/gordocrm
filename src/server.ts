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
import { invoiceRoutes } from './api/routes/admin/invoices.js';
import { vaultRoutes } from './api/routes/portal/vault.js';
import { invoiceRoutes as clientInvoiceRoutes } from './api/routes/portal/invoices.js';
import { kanbanRoutes } from './api/routes/admin/kanban.js';
import { getAllowedOrigins, getConfig } from './lib/config.js';
import { sendQuarterlyReviewReminderEmail } from './lib/email.js';
import type { AppBindings, AppContext } from './types/index.js';

const app = new Hono<AppContext>();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
});

app.use('*', async (c, next) => {
  c.set('db', getDb(c.env));
  await next();
});

app.use(
  '/api/*',
  cors({
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
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
app.route('/api/portal/vault', vaultRoutes);
app.route('/api/portal/invoices', clientInvoiceRoutes);
app.route('/api/public/briefs', publicBriefRoutes);
app.route('/api/ai', aiProxyRoutes);
app.route('/api/admin/invoices', invoiceRoutes);
app.route('/api/admin/kanban', kanbanRoutes);

// Cron handler for quarterly review reminders
app.get('/__scheduled', async (c) => {
  const db = c.get('db');
  const env = c.env;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Find clients due for review
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
      portalUrl: 'https://crm.grandeandgordo.com',
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

  return c.json({
    ok: true,
    sent: sentCount,
    total: clientsDue.length,
  });
});

export default app;
