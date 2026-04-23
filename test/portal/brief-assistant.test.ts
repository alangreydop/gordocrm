import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

let mockUser:
  | {
      id: string;
      email: string;
      role: 'admin' | 'client';
      name: string;
      company: string | null;
    }
  | null = null;

vi.mock('../../src/lib/auth.js', () => ({
  requireAuth: async (c: any, next: () => Promise<void>) => {
    if (!mockUser) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    c.set('user', mockUser);
    await next();
  },
}));

import { assistantRoutes } from '../../src/api/routes/portal/brief-assistant';

function createMockDb() {
  const inserts: Array<Record<string, unknown>> = [];

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'client-123', email: 'client-record@example.com' }],
        }),
        orderBy: async () => [],
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          inserts.push(values);
          return [{ id: 'brief-123' }];
        },
      }),
    }),
  };

  return { db, inserts };
}

function makeApp(db: unknown) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db', db as any);
    await next();
  });
  app.route('/api/portal/brief/assistant', assistantRoutes);
  return app;
}

describe('brief assistant boundary', () => {
  beforeEach(() => {
    mockUser = {
      id: 'user-123',
      email: 'portal-user@example.com',
      role: 'client',
      name: 'Portal User',
      company: 'Acme',
    };
  });

  it('rejects assistant chat when unauthenticated', async () => {
    mockUser = null;
    const { db } = createMockDb();
    const app = makeApp(db);

    const res = await app.fetch(
      new Request('http://localhost/api/portal/brief/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hola', history: [] }),
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
  });

  it('rejects assistant chat for admins', async () => {
    mockUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      name: 'Admin',
      company: null,
    };
    const { db } = createMockDb();
    const app = makeApp(db);

    const res = await app.fetch(
      new Request('http://localhost/api/portal/brief/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hola', history: [] }),
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Client access only' });
  });

  it('stores the final brief against the authenticated client instead of body-controlled ids', async () => {
    const { db, inserts } = createMockDb();
    const app = makeApp(db);

    const res = await app.fetch(
      new Request('http://localhost/api/portal/brief/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'forged-client-id',
          userEmail: 'forged@example.com',
          message: 'Que escriban por WhatsApp',
          history: [
            { stage: 'OBJECTIVE', answer: 'Vender más' },
            { stage: 'HOOK', answer: 'Abrimos con una objeción' },
            { stage: 'STYLE', answer: 'Directo y claro' },
            { stage: 'AUDIENCE', answer: 'Fundadores ecommerce' },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      stage: 'COMPLETE',
      isComplete: true,
      briefId: 'brief-123',
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      clientId: 'client-123',
      email: 'portal-user@example.com',
      source: 'ai-assistant',
      sourcePage: '/client/brief-assistant',
      status: 'new',
    });
  });

  it('stores a structured brief against the authenticated client', async () => {
    const { db, inserts } = createMockDb();
    const app = makeApp(db);

    const res = await app.fetch(
      new Request('http://localhost/api/portal/brief/assistant/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'forged-client-id',
          contentType: 'video',
          objective: 'Lanzar nueva línea de producto',
          usageContext: 'Paid social y landing',
          style: 'Oscuro, premium y sin saturar claims',
          audience: 'Compradores premium',
          cta: 'Ir a la ficha',
          description: 'Urgente para la campaña de mayo',
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      briefId: 'brief-123',
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      clientId: 'client-123',
      email: 'portal-user@example.com',
      contentType: 'video',
      objective: 'Lanzar nueva línea de producto',
      hook: 'Paid social y landing',
      style: 'Oscuro, premium y sin saturar claims',
      audience: 'Compradores premium',
      cta: 'Ir a la ficha',
      source: 'client-portal-form',
      sourcePage: '/client/brief-assistant',
      status: 'new',
    });
  });
});
