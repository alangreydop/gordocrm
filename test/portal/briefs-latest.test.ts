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

import { briefRoutes } from '../../src/api/routes/portal/briefs';

function createMockDb(latestBrief: Record<string, unknown> | null) {
  let selectCount = 0;

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => (latestBrief ? [latestBrief] : []),
          }),
          limit: async () => {
            selectCount += 1;
            if (selectCount === 1) {
              return [{ id: 'client-123', email: 'client@example.com' }];
            }

            return latestBrief ? [latestBrief] : [];
          },
        }),
      }),
      leftJoin: () => ({
        orderBy: async () => [],
      }),
    }),
  };

  return db;
}

function makeApp(db: unknown) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db', db as any);
    await next();
  });
  app.route('/api/portal/briefs', briefRoutes);
  return app;
}

describe('latest brief boundary', () => {
  beforeEach(() => {
    mockUser = {
      id: 'user-123',
      email: 'client@example.com',
      role: 'client',
      name: 'Client User',
      company: 'Acme',
    };
  });

  it('returns null when the client has no linked brief', async () => {
    const app = makeApp(createMockDb(null));

    const res = await app.fetch(
      new Request('http://localhost/api/portal/briefs/latest'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ brief: null });
  });

  it('returns the latest linked brief for the authenticated client', async () => {
    const app = makeApp(
      createMockDb({
        id: 'brief-123',
        email: 'client@example.com',
        tipo: null,
        description: 'Nuevo contexto para mayo',
        status: 'new',
        source: 'ai-assistant',
        sourcePage: '/client/brief-assistant',
        createdAt: new Date('2026-04-23T08:15:00Z'),
        updatedAt: new Date('2026-04-23T08:15:00Z'),
      }),
    );

    const res = await app.fetch(
      new Request('http://localhost/api/portal/briefs/latest'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      brief: {
        id: 'brief-123',
        description: 'Nuevo contexto para mayo',
        source: 'ai-assistant',
      },
    });
  });
});
