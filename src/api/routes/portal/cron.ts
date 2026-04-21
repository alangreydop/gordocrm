import { and, eq, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../../../../db/index.js';
import { sendQuarterlyReviewReminderEmail } from '../../../lib/email.js';
import type { AppContext } from '../../../types/index.js';

export const cronRoutes = new Hono<AppContext>();

// GET /api/portal/cron/quarterly-reviews
// Send quarterly review reminders to clients due for review
cronRoutes.get('/quarterly-reviews', async (c) => {
  const db = c.get('db');
  const env = c.env;

  // Verify cron secret
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const expectedToken = env.CRON_SECRET;
  if (!expectedToken || token !== expectedToken) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Find clients due for review (nextReviewAt in past or next 7 days, not contacted in last 7 days)
  const clientsDue = await db
    .select()
    .from(schema.clients)
    .where(
      and(
        or(
          lt(schema.clients.nextReviewAt, now),
          and(schema.clients.nextReviewAt, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
        ),
        or(
          lt(schema.clients.lastContactedAt, sevenDaysAgo),
          schema.clients.lastContactedAt === null,
        ),
      ),
    );

  let sentCount = 0;
  let skippedCount = 0;

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
      // Update lastContactedAt
      await db
        .update(schema.clients)
        .set({ lastContactedAt: new Date() })
        .where(eq(schema.clients.id, client.id));
    } else {
      skippedCount++;
    }
  }

  return c.json({
    ok: true,
    sent: sentCount,
    skipped: skippedCount,
    total: clientsDue.length,
  });
});
