import { randomUUID } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db, schema } from '../../db/index.js';

const SESSION_COOKIE = 'gg_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'client';
  name: string;
  company: string | null;
}

export async function createUser(
  email: string,
  password: string,
  role: 'admin' | 'client',
  name: string,
  company?: string,
) {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash, role, name, company: company ?? null })
    .returning();
  return user;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role as 'admin' | 'client',
    name: user.name,
    company: user.company,
  };
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await db.insert(schema.sessions).values({ userId, token, expiresAt });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
}

export async function getUserFromSession(
  token: string,
): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
      name: schema.users.name,
      company: schema.users.company,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.token, token),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role as 'admin' | 'client',
    name: row.name,
    company: row.company ?? null,
  };
}

export function getSessionToken(request: FastifyRequest): string | null {
  const cookie = request.headers.cookie ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const maxAge = SESSION_MAX_AGE_MS / 1000;
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
  );
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}

// Fastify preHandler hooks
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = getSessionToken(request);
  if (!token) {
    reply.code(401).send({ error: 'Not authenticated' });
    return;
  }
  const user = await getUserFromSession(token);
  if (!user) {
    reply.code(401).send({ error: 'Invalid or expired session' });
    return;
  }
  (request as any).user = user;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  const user = (request as any).user as AuthUser;
  if (user.role !== 'admin') {
    reply.code(403).send({ error: 'Admin access required' });
  }
}
