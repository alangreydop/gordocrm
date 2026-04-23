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

import { webhookRoutes } from '../../src/api/routes/portal/webhooks';

function createMockDb() {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'client-123' }],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserts.push(values);
      },
    }),
  };

  return { db, updates, inserts };
}

function makeApp(db: unknown) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('db', db as any);
    await next();
  });
  app.route('/api/portal/webhooks', webhookRoutes);
  return app;
}

describe('portal webhook boundary', () => {
  beforeEach(() => {
    mockUser = {
      id: 'user-123',
      email: 'client@example.com',
      role: 'client',
      name: 'Client User',
      company: 'Acme',
    };
  });

  it('returns 410 for disabled web brief intake', async () => {
    const { db } = createMockDb();
    const app = makeApp(db);

    const res = await app.fetch(
      new Request('http://localhost/api/portal/webhooks/web/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'lead@example.com',
          tipo: 'video',
          description: 'Lead brief',
        }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: 'Web brief intake is disabled',
      message:
        'Client records are now provisioned only after lead-won, and brief updates must come from an authenticated portal session.',
    });
  });

  it('rejects onboarding writes without an authenticated session', async () => {
    mockUser = null;
    const { db } = createMockDb();
    const app = makeApp(db);

    const res = await app.fetch(
      new Request('http://localhost/api/portal/webhooks/web/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklistCompleted: true }),
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not authenticated' });
  });

  it('binds onboarding writes to the authenticated client instead of request body ids', async () => {
    const { db, updates, inserts } = createMockDb();
    const app = makeApp(db);

    const res = await app.fetch(
      new Request('http://localhost/api/portal/webhooks/web/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'forged-client-id',
          checklistCompleted: true,
          sessionScheduled: true,
          sessionDate: '2026-04-30T10:00',
          readiness: {
            materialsReady: true,
            brandReady: false,
            accessReady: true,
          },
          priorityFocus: 'Amazon PDP launch',
          openQuestions: 'Definir ratio y claims',
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, clientId: 'client-123' });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      onboardingCompletedAt: expect.any(Date),
      firstSessionAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      clientId: 'client-123',
      type: 'activation.completed',
      createdAt: expect.any(Date),
    });
    expect(inserts[0].content).toContain('Activacion confirmada desde portal.');
  });
});
