import { Hono } from 'hono';
import { z } from 'zod';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionToken,
  requireAuth,
  setSessionCookie,
  verifyCredentials,
} from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  return c.json({ user: c.get('user') });
});
