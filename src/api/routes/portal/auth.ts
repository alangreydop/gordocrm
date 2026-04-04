import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import {
  checkPassword,
  clearSessionsForUser,
  clearSessionCookie,
  createSession,
  destroySession,
  getUserRecordById,
  getSessionToken,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyCredentials,
} from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const authRoutes = new Hono<AppContext>();

authRoutes.post('/login', async (c) => {
  const payload = await c.req.json().catch(() => null);
  const body = loginSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid email or password format' }, 400);
  }

  const user = await verifyCredentials(
    c.get('db'),
    body.data.email,
    body.data.password,
  );

  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const token = await createSession(c.get('db'), c.env, user.id);
  setSessionCookie(c, token);
  return c.json({ user });
});

authRoutes.post('/logout', requireAuth, async (c) => {
  const token = getSessionToken(c);
  if (token) {
    await destroySession(c.get('db'), c.env, token);
  }

  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  const user = c.get('user');

  if (user.role !== 'client') {
    return c.json({ user });
  }

  const [client] = await c
    .get('db')
    .select({
      id: schema.clients.id,
      userId: schema.clients.userId,
      name: schema.clients.name,
      email: schema.clients.email,
      company: schema.clients.company,
      accountManager: schema.clients.accountManager,
      subscriptionStatus: schema.clients.subscriptionStatus,
      plan: schema.clients.plan,
      monthlyUnitCapacity: schema.clients.monthlyUnitCapacity,
      datasetStatus: schema.clients.datasetStatus,
      segment: schema.clients.segment,
      marginProfile: schema.clients.marginProfile,
      notes: schema.clients.notes,
      nextReviewAt: schema.clients.nextReviewAt,
      lastContactedAt: schema.clients.lastContactedAt,
    })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  return c.json({ user, client: client ?? null });
});

authRoutes.post('/change-password', requireAuth, async (c) => {
  const payload = await c.req.json().catch(() => null);
  const body = changePasswordSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid password payload', details: body.error.issues }, 400);
  }

  const user = c.get('user');
  const db = c.get('db');
  const userRecord = await getUserRecordById(db, user.id);

  if (!userRecord) {
    return c.json({ error: 'User not found' }, 404);
  }

  const currentPasswordOk = await checkPassword(
    body.data.currentPassword,
    userRecord.passwordHash,
  );

  if (!currentPasswordOk) {
    return c.json({ error: 'Current password is incorrect' }, 400);
  }

  const samePassword = await checkPassword(
    body.data.newPassword,
    userRecord.passwordHash,
  );

  if (samePassword) {
    return c.json({ error: 'Choose a different password' }, 400);
  }

  await db
    .update(schema.users)
    .set({
      passwordHash: await hashPassword(body.data.newPassword),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));

  const currentToken = getSessionToken(c);
  await clearSessionsForUser(db, user.id);

  if (currentToken) {
    const newToken = await createSession(db, c.env, user.id);
    setSessionCookie(c, newToken);
  } else {
    clearSessionCookie(c);
  }

  return c.json({ ok: true });
});
