import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const createNotificationSchema = z.object({
  type: z.enum(['job_completed', 'job_updated', 'feedback_received', 'message', 'reminder']),
  title: z.string().min(1),
  message: z.string().min(1),
  relatedJobId: z.string().uuid().optional(),
  relatedInvoiceId: z.string().uuid().optional(),
});

const updateNotificationSchema = z.object({
  read: z.boolean().optional(),
});

export const notificationRoutes = new Hono<AppContext>();

notificationRoutes.use('*', requireAuth);

// Get notifications for current user
notificationRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  const notifications = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return c.json({ notifications, unreadCount });
});

// Mark notification as read
notificationRoutes.patch('/:id/read', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = c.get('db');

  // Verify ownership
  const [notification] = await db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, user.id)))
    .limit(1);

  if (!notification) {
    return c.json({ error: 'Notification not found' }, 404);
  }

  await db
    .update(schema.notifications)
    .set({ read: 1, updatedAt: new Date() })
    .where(eq(schema.notifications.id, id));

  return c.json({ success: true });
});

// Mark all notifications as read
notificationRoutes.post('/mark-all-read', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  await db
    .update(schema.notifications)
    .set({ read: 1, updatedAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.read, 0)));

  return c.json({ success: true });
});

// Create notification (admin only)
notificationRoutes.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  const payload: unknown = await c.req.json().catch(() => null);
  const body = createNotificationSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  const db = c.get('db');

  // Get target users (all clients or specific user)
  const targetUserId = body.data.relatedJobId
    ? await (async () => {
        const [job] = await db
          .select({ clientId: schema.jobs.clientId })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, body.data.relatedJobId!))
          .limit(1);
        if (!job) return null;

        const [client] = await db
          .select({ userId: schema.clients.userId })
          .from(schema.clients)
          .where(eq(schema.clients.id, job.clientId))
          .limit(1);
        return client?.userId ?? null;
      })()
    : null;

  const targetUsers = targetUserId
    ? [targetUserId]
    : (
        await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.role, 'client'))
      ).map((u) => u.id);

  const now = new Date();
  const notificationId = crypto.randomUUID();

  // Create notification for each target user
  const values = targetUsers.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    type: body.data.type,
    title: body.data.title,
    message: body.data.message,
    relatedJobId: body.data.relatedJobId ?? null,
    relatedInvoiceId: body.data.relatedInvoiceId ?? null,
    read: 0,
    createdAt: now,
  }));

  if (values.length > 0) {
    await db.insert(schema.notifications).values(values);
  }

  return c.json({ success: true, created: values.length });
});

// Delete notification
notificationRoutes.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const db = c.get('db');

  // Verify ownership
  const [notification] = await db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, user.id)))
    .limit(1);

  if (!notification) {
    return c.json({ error: 'Notification not found' }, 404);
  }

  await db.delete(schema.notifications).where(eq(schema.notifications.id, id));

  return c.json({ success: true });
});
