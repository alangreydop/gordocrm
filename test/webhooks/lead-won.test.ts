import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { leadWonWebhook } from '../../src/api/routes/webhooks/lead-won';
import { generateWebhookSignature } from '../../src/lib/webhook-signature';

vi.mock('../../src/lib/auth.js', () => ({
  createUser: vi.fn().mockResolvedValue({ id: 'user-123' }),
}));

vi.mock('../../src/lib/email.js', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

describe('lead-won webhook', () => {
  const secret = 'test-transfer-secret';

  function buildPayload(overrides: Record<string, unknown> = {}) {
    return {
      leadId: 'lead-123',
      data: {
        companyName: 'Acme Corp',
        contactEmail: 'john@acme.com',
        contactPhone: '+1234567890',
        contactName: 'John Doe',
        region: 'Madrid',
        address: 'Calle Mayor 1',
        tier: 'T1',
        source: 'outbound_research',
        websiteUrl: 'https://acme.com',
        sector: 'Tecnologia',
        subsector: 'SaaS',
        painPoint: 'Needs photos',
        commercialAngle: 'Visual story',
        uspVerified: 'Premium',
        recommendedPlan: 'Pro',
        productionType: 'foto',
        briefDescription: 'Q2 shoot',
        assignedTo: 'Alice',
        notes: 'Hot lead',
        activities: [],
        ...overrides,
      },
    };
  }

  function createMockDb(existingClient: Record<string, unknown> | null = null, existingUser: Record<string, unknown> | null = null) {
    const inserts: Record<string, Array<Record<string, unknown>>> = {};
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

    const chain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      limit: (n: number) => Promise.resolve(existingClient ? [existingClient] : []) as unknown as typeof chain,
      get: async () => existingClient,
      all: async () => existingClient ? [existingClient] : [],
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            updates.push({ table: (table as { name?: string }).name || 'unknown', values });
            return Promise.resolve();
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
          const name = (table as { name?: string }).name || 'unknown';
          if (!inserts[name]) inserts[name] = [];
          const arr = Array.isArray(rows) ? rows : [rows];
          inserts[name].push(...arr);
          return Promise.resolve();
        },
      }),
    };

    return { db: chain, inserts, updates };
  }

  async function makeApp(existingClient?: Record<string, unknown> | null, existingUser?: Record<string, unknown> | null) {
    const { db, inserts, updates } = createMockDb(existingClient, existingUser);

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('db', db as unknown as import('../../src/types').AppVariables['db']);
      await next();
    });
    app.route('/api/webhooks', leadWonWebhook);

    return { app, db, inserts, updates };
  }

  it('returns 401 when signature header is missing', async () => {
    const { app } = await makeApp();
    const body = buildPayload();
    const req = new Request('http://localhost/api/webhooks/lead-won', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await app.fetch(req, { DB: {} as D1Database, LEAD_TRANSFER_SECRET: secret } as unknown as Record<string, unknown>);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Missing auth headers' });
  });

  it('returns 401 when timestamp is expired', async () => {
    const { app } = await makeApp();
    const body = buildPayload();
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
    const signature = await generateWebhookSignature(JSON.stringify(body) + oldTimestamp, secret);
    const req = new Request('http://localhost/api/webhooks/lead-won', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': oldTimestamp,
      },
      body: JSON.stringify(body),
    });
    const res = await app.fetch(req, { DB: {} as D1Database, LEAD_TRANSFER_SECRET: secret } as unknown as Record<string, unknown>);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Timestamp expired' });
  });

  it('returns 401 when signature is invalid', async () => {
    const { app } = await makeApp();
    const body = buildPayload();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const req = new Request('http://localhost/api/webhooks/lead-won', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': 'invalid-signature',
        'X-Webhook-Timestamp': timestamp,
      },
      body: JSON.stringify(body),
    });
    const res = await app.fetch(req, { DB: {} as D1Database, LEAD_TRANSFER_SECRET: secret } as unknown as Record<string, unknown>);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('creates client, user, brief and activities on valid payload', async () => {
    const { app, inserts } = await makeApp(null, null);
    const body = buildPayload();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await generateWebhookSignature(JSON.stringify(body) + timestamp, secret);

    const req = new Request('http://localhost/api/webhooks/lead-won', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp,
      },
      body: JSON.stringify(body),
    });

    const res = await app.fetch(req, { DB: {} as D1Database, LEAD_TRANSFER_SECRET: secret } as unknown as Record<string, unknown>);
    expect(res.status).toBe(201);
    const json = await res.json() as { clientId: string; userId: string; briefId: string };
    expect(json.clientId).toBeDefined();
    expect(json.userId).toBeDefined();
    expect(json.briefId).toBeDefined();

    // Verify inserts happened
    expect(Object.keys(inserts).length).toBeGreaterThan(0);
  });
});
