import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  verifyCredentials,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  requireAuth,
  type AuthUser,
} from '../../../lib/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid email or password format' });
    }

    const user = await verifyCredentials(body.data.email, body.data.password);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return reply.send({ user });
  });

  app.post('/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const token = getSessionToken(request)!;
    await destroySession(token);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: [requireAuth] }, async (request) => {
    return { user: (request as any).user as AuthUser };
  });
}
