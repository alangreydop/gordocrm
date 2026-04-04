import { and, eq, gt } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { schema, type Database } from '../../db/index.js';
import { getConfig, isProduction } from './config.js';
import type { AppBindings, AppContext, AuthUser, UserRole } from '../types/index.js';

const SESSION_COOKIE = 'gg_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hashSessionToken(
  sessionSecret: string,
  rawToken: string,
): Promise<string> {
  const payload = new TextEncoder().encode(`${sessionSecret}:${rawToken}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return toHex(digest);
}

function getCookieOptions(env: AppBindings) {
  const config = getConfig(env);
  const sameSite = isProduction(env) ? ('None' as const) : ('Lax' as const);
  const options = {
    path: '/',
    httpOnly: true,
    sameSite,
    secure: isProduction(env),
    maxAge: SESSION_MAX_AGE_SECONDS,
  };

  if (!config.SESSION_COOKIE_DOMAIN) {
    return options;
  }

  return {
    ...options,
    domain: config.SESSION_COOKIE_DOMAIN,
  };
}

export async function createUser(
  db: Database,
  email: string,
  password: string,
  role: UserRole,
  name: string,
  company?: string,
) {
  const id = crypto.randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(password);

  await db.insert(schema.users).values({
    id,
    email,
    passwordHash,
    role,
    name,
    company: company ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  return user ?? null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function checkPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyCredentials(
  db: Database,
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user) return null;

  const valid = await checkPassword(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
    name: user.name,
    company: user.company ?? null,
  };
}

export async function getUserRecordById(
  db: Database,
  userId: string,
) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function updateUserPassword(
  db: Database,
  userId: string,
  password: string,
): Promise<void> {
  await db
    .update(schema.users)
    .set({
      passwordHash: await hashPassword(password),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}

export async function clearSessionsForUser(
  db: Database,
  userId: string,
): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function createSession(
  db: Database,
  env: AppBindings,
  userId: string,
): Promise<string> {
  const rawToken = crypto.randomUUID();
  const tokenHash = await hashSessionToken(getConfig(env).SESSION_SECRET, rawToken);
  const now = new Date();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await db.insert(schema.sessions).values({
    id: crypto.randomUUID(),
    userId,
    token: tokenHash,
    expiresAt,
    createdAt: now,
  });

  return rawToken;
}

export async function destroySession(
  db: Database,
  env: AppBindings,
  rawToken: string,
): Promise<void> {
  const tokenHash = await hashSessionToken(getConfig(env).SESSION_SECRET, rawToken);
  await db.delete(schema.sessions).where(eq(schema.sessions.token, tokenHash));
}

export async function getUserFromSession(
  db: Database,
  env: AppBindings,
  rawToken: string,
): Promise<AuthUser | null> {
  const tokenHash = await hashSessionToken(getConfig(env).SESSION_SECRET, rawToken);
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
        eq(schema.sessions.token, tokenHash),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    name: row.name,
    company: row.company ?? null,
  };
}

export function getSessionToken(c: Context<AppContext>): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export function setSessionCookie(c: Context<AppContext>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, getCookieOptions(c.env));
}

export function clearSessionCookie(c: Context<AppContext>): void {
  const options = {
    path: '/',
  };
  const { SESSION_COOKIE_DOMAIN } = getConfig(c.env);

  if (!SESSION_COOKIE_DOMAIN) {
    deleteCookie(c, SESSION_COOKIE, options);
    return;
  }

  deleteCookie(c, SESSION_COOKIE, {
    ...options,
    domain: SESSION_COOKIE_DOMAIN,
  });
}

export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const token = getSessionToken(c);
  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const user = await getUserFromSession(c.get('db'), c.env, token);
  if (!user) {
    clearSessionCookie(c);
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  c.set('user', user);
  await next();
  return;
};

export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  // eslint-disable-next-line @typescript-eslint/require-await
  const authResponse = await requireAuth(c, async () => undefined);
  if (authResponse) return authResponse;

  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  await next();
  return;
};
