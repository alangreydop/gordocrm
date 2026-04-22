import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

export const clientActivityRoutes = new Hono<AppContext>();

clientActivityRoutes.use('*', requireAuth);

clientActivityRoutes.get('/', async (c) => {
  const user = c.get('user');
  const db = c.get('db');

  // Obtener cliente vinculado al usuario
  const [clientRecord] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!clientRecord) {
    return c.json({ activities: [] });
  }

  const activities = await db
    .select()
    .from(schema.clientActivities)
    .where(eq(schema.clientActivities.clientId, clientRecord.id))
    .orderBy(desc(schema.clientActivities.createdAt))
    .limit(50);

  return c.json({ activities });
});
