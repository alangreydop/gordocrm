import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { clientAreaRoutes, createClientAreaRoutes } from '../../api/routes/portal/client-area';
import { buildClientAreaSnapshot } from '../../lib/client-area/workspace-builder';
import type { AppContext, AuthUser } from '../../types';

const authenticatedClient: AuthUser = {
  id: 'user-123',
  email: 'client@example.com',
  role: 'client',
  name: 'Client User',
  company: 'Acme Co',
};

function createApp() {
  const app = new Hono<AppContext>();
  app.use('*', async (c, next) => {
    c.set('db', {} as AppContext['Variables']['db']);
    await next();
  });
  return app;
}

describe('buildClientAreaSnapshot', () => {
  it('maps CRM jobs into workspace projects', () => {
    const snapshot = buildClientAreaSnapshot({
      client: {
        id: 'client-1',
        userId: 'user-123',
        name: 'Client User',
        email: 'client@example.com',
        company: 'Acme Co',
        subscriptionStatus: 'active',
        datasetStatus: 'active',
        createdAt: new Date('2026-04-01T08:00:00.000Z'),
        updatedAt: new Date('2026-04-02T09:00:00.000Z'),
      },
      jobs: [
        {
          id: 'job-1',
          clientId: 'client-1',
          status: 'processing',
          briefText: 'Campaign launch stills',
          platform: 'instagram',
          type: 'image',
          dueAt: new Date('2026-04-30T12:00:00.000Z'),
          unitsPlanned: 12,
          unitsConsumed: 4,
          createdAt: new Date('2026-04-10T10:00:00.000Z'),
          updatedAt: new Date('2026-04-15T10:00:00.000Z'),
        },
      ],
      invoices: [
        {
          id: 'invoice-1',
          clientId: 'client-1',
          invoiceNumber: 'F2026-001',
          issueDate: new Date('2026-04-05T00:00:00.000Z'),
          dueDate: new Date('2026-04-20T00:00:00.000Z'),
          totalCents: 155000,
          status: 'issued',
          createdAt: new Date('2026-04-05T00:00:00.000Z'),
          updatedAt: new Date('2026-04-05T00:00:00.000Z'),
        },
      ],
      notifications: [
        {
          id: 'notification-1',
          userId: 'user-123',
          type: 'job_updated',
          title: 'Campaign updated',
          message: 'New previews are ready',
          read: 0,
          relatedJobId: 'job-1',
          relatedInvoiceId: null,
          createdAt: new Date('2026-04-16T10:00:00.000Z'),
          updatedAt: new Date('2026-04-16T10:00:00.000Z'),
        },
      ],
    });

    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        id: 'job-1',
        title: 'Campaign launch stills',
        status: 'processing',
      }),
    ]);
    expect(snapshot.billing.invoices).toEqual([
      expect.objectContaining({
        id: 'invoice-1',
      }),
    ]);
    expect(snapshot.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'job-1',
          kind: 'project',
        }),
        expect.objectContaining({
          id: 'notification-1',
          kind: 'notification',
        }),
      ]),
    );
  });
});

describe('client area workspace route', () => {
  it('returns 401 on the real route tree when unauthenticated', async () => {
    const app = createApp();
    app.route('/client-area', clientAreaRoutes);

    const response = await app.request('/client-area/workspace');

    expect(response.status).toBe(401);
  });

  it('serves GET /workspace for the authenticated client and calls the loader with the user id', async () => {
    const loadWorkspace = vi.fn().mockResolvedValue({
      account: {
        label: 'Acme Co',
        supportEmail: 'hola@grandeandgordo.com',
      },
      projects: [{ id: 'job-1', title: 'Campaign launch stills', status: 'processing' }],
      reviews: [],
      files: [],
      messages: [],
      billing: {
        invoices: [{ id: 'invoice-1' }],
      },
      timeline: [],
    });

    const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
      c.set('user', authenticatedClient);
      await next();
    };

    const app = createApp();
    app.route('/client-area', createClientAreaRoutes({ loadWorkspace, requireAuth }));

    const response = await app.request('/client-area/workspace');

    expect(response.status).toBe(200);
    expect(loadWorkspace).toHaveBeenCalledWith({
      db: {},
      userId: 'user-123',
    });
    expect(await response.json()).toEqual({
      account: {
        label: 'Acme Co',
        supportEmail: 'hola@grandeandgordo.com',
      },
      projects: [{ id: 'job-1', title: 'Campaign launch stills', status: 'processing' }],
      reviews: [],
      files: [],
      messages: [],
      billing: {
        invoices: [{ id: 'invoice-1' }],
      },
      timeline: [],
    });
  });

  it('returns 404 when the authenticated client record is missing', async () => {
    const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
      c.set('user', authenticatedClient);
      await next();
    };

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({
        loadWorkspace: vi.fn().mockResolvedValue(null),
        requireAuth,
      }),
    );

    const response = await app.request('/client-area/workspace');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'Cliente no encontrado',
    });
  });
});
