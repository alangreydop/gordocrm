import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { clientAreaRoutes, createClientAreaRoutes } from '../../api/routes/portal/client-area';
import { loadClientAreaWorkspace } from '../../lib/client-area/load-workspace';
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

function createLimitedSelectChain<T>(
  rows: T[],
  recorder?: { whereArgs?: unknown[]; orderByArgs?: unknown[]; limitArg?: number },
) {
  return {
    from() {
      return {
        where(...whereArgs: unknown[]) {
          if (recorder) {
            recorder.whereArgs = whereArgs;
          }
          return {
            orderBy(...orderByArgs: unknown[]) {
              if (recorder) {
                recorder.orderByArgs = orderByArgs;
              }
              return {
                limit(limitArg: number) {
                  if (recorder) {
                    recorder.limitArg = limitArg;
                  }
                  return Promise.resolve(rows);
                },
              };
            },
          };
        },
      };
    },
  };
}

function createOrderedSelectChain<T>(
  rows: T[],
  recorder?: { whereArgs?: unknown[]; orderByArgs?: unknown[] },
) {
  return {
    from() {
      return {
        where(...whereArgs: unknown[]) {
          if (recorder) {
            recorder.whereArgs = whereArgs;
          }
          return {
            orderBy(...orderByArgs: unknown[]) {
              if (recorder) {
                recorder.orderByArgs = orderByArgs;
              }
              return Promise.resolve(rows);
            },
          };
        },
      };
    },
  };
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
      assets: [
        {
          id: 'asset-1',
          jobId: 'job-1',
          label: 'Pack final',
          type: 'image',
          deliveryUrl: 'https://cdn.grandeandgordo.com/asset-1.jpg',
          status: 'approved',
          createdAt: new Date('2026-04-16T12:00:00.000Z'),
          updatedAt: new Date('2026-04-16T12:30:00.000Z'),
        },
      ],
      reviews: [
        {
          id: 'review-1',
          clientId: 'client-1',
          jobId: 'job-1',
          assetId: 'asset-1',
          title: 'Hero v3',
          summary: 'Revisa el encuadre final.',
          status: 'needs_review',
          requestedAt: new Date('2026-04-16T11:00:00.000Z'),
          dueAt: new Date('2026-04-18T12:00:00.000Z'),
          decisionNote: null,
          updatedAt: new Date('2026-04-16T11:00:00.000Z'),
        },
      ],
      threads: [
        {
          id: 'thread-1',
          clientId: 'client-1',
          jobId: 'job-1',
          subject: 'Entrega semanal',
          status: 'active',
          createdAt: new Date('2026-04-15T09:00:00.000Z'),
          updatedAt: new Date('2026-04-16T09:30:00.000Z'),
        },
      ],
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          authorRole: 'studio',
          body: 'Te dejamos la entrega semanal lista para revisar.',
          createdAt: new Date('2026-04-16T09:30:00.000Z'),
          readAt: null,
        },
      ],
    });

    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        id: 'job-1',
        title: 'Campaign launch stills',
        status: 'processing',
        dueAt: '2026-04-30T12:00:00.000Z',
      }),
    ]);
    expect(snapshot.billing.invoices).toEqual([
      expect.objectContaining({
        id: 'invoice-1',
        invoiceNumber: 'F2026-001',
        status: 'issued',
        totalCents: 155000,
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
        expect.objectContaining({
          id: 'review-1',
          kind: 'review',
        }),
      ]),
    );
    expect(snapshot.files).toEqual([
      expect.objectContaining({
        id: 'asset-1',
        title: 'Pack final',
        category: 'deliverable',
      }),
    ]);
    expect(snapshot.reviews).toEqual([
      expect.objectContaining({
        id: 'review-1',
        title: 'Hero v3',
        status: 'needs_review',
      }),
    ]);
    expect(snapshot.messages).toEqual([
      expect.objectContaining({
        id: 'thread-1',
        subject: 'Entrega semanal',
        unreadCount: 1,
      }),
    ]);
  });

  it('uses a calm fallback title when a job has no brief or media hints', () => {
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
          id: 'job-untitled',
          clientId: 'client-1',
          status: 'pending',
          briefText: null,
          platform: null,
          type: null,
          dueAt: null,
          unitsPlanned: 0,
          unitsConsumed: 0,
          createdAt: new Date('2026-04-10T10:00:00.000Z'),
          updatedAt: new Date('2026-04-15T10:00:00.000Z'),
        },
      ],
      invoices: [],
      notifications: [],
      assets: [],
      reviews: [],
      threads: [],
      messages: [],
    });

    expect(snapshot.projects).toEqual([
      expect.objectContaining({
        id: 'job-untitled',
        title: 'Proyecto sin título',
      }),
    ]);
  });
});

describe('loadClientAreaWorkspace', () => {
  it('returns null when no client is linked to the authenticated user', async () => {
    const db = {
      select: vi.fn().mockImplementationOnce(() => createLimitedSelectChain([])),
    } as unknown as AppContext['Variables']['db'];

    const workspace = await loadClientAreaWorkspace({
      db,
      userId: 'user-123',
    });

    expect(workspace).toBeNull();
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('loads the workspace from current CRM reads and uses deterministic client ordering', async () => {
    const clientQuery: { whereArgs?: unknown[]; orderByArgs?: unknown[]; limitArg?: number } = {};
    const jobsQuery: { whereArgs?: unknown[]; orderByArgs?: unknown[] } = {};
    const invoicesQuery: { whereArgs?: unknown[]; orderByArgs?: unknown[] } = {};
    const notificationsQuery: { whereArgs?: unknown[]; orderByArgs?: unknown[] } = {};
    const reviewsQuery: { whereArgs?: unknown[]; orderByArgs?: unknown[] } = {};
    const threadsQuery: { whereArgs?: unknown[]; orderByArgs?: unknown[] } = {};

    const db = {
      select: vi
        .fn()
        // 1. client lookup
        .mockImplementationOnce(
          () =>
            createLimitedSelectChain(
              [
                {
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
              ],
              clientQuery,
            ),
        )
        // 2. jobs
        .mockImplementationOnce(
          () =>
            createOrderedSelectChain(
              [
                {
                  id: 'job-1',
                  clientId: 'client-1',
                  status: 'processing',
                  briefText: null,
                  platform: 'instagram',
                  type: 'image',
                  dueAt: new Date('2026-04-30T12:00:00.000Z'),
                  unitsPlanned: 12,
                  unitsConsumed: 4,
                  createdAt: new Date('2026-04-10T10:00:00.000Z'),
                  updatedAt: new Date('2026-04-15T10:00:00.000Z'),
                },
              ],
              jobsQuery,
            ),
        )
        // 3. invoices
        .mockImplementationOnce(
          () =>
            createOrderedSelectChain(
              [
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
              invoicesQuery,
            ),
        )
        // 4. notifications
        .mockImplementationOnce(
          () =>
            createOrderedSelectChain(
              [
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
              notificationsQuery,
            ),
        )
        // 5. reviews
        .mockImplementationOnce(
          () =>
            createOrderedSelectChain(
              [
                {
                  id: 'review-1',
                  clientId: 'client-1',
                  jobId: 'job-1',
                  assetId: 'asset-1',
                  title: 'Hero v3',
                  summary: 'Revisa el encuadre final.',
                  status: 'needs_review',
                  requestedAt: new Date('2026-04-16T11:00:00.000Z'),
                  dueAt: new Date('2026-04-18T12:00:00.000Z'),
                  decisionNote: null,
                  updatedAt: new Date('2026-04-16T11:00:00.000Z'),
                },
              ],
              reviewsQuery,
            ),
        )
        // 6. threads
        .mockImplementationOnce(
          () =>
            createOrderedSelectChain(
              [
                {
                  id: 'thread-1',
                  clientId: 'client-1',
                  jobId: 'job-1',
                  subject: 'Entrega semanal',
                  status: 'active',
                  createdAt: new Date('2026-04-15T09:00:00.000Z'),
                  updatedAt: new Date('2026-04-16T09:30:00.000Z'),
                },
              ],
              threadsQuery,
            ),
        )
        // 7. assets (depends on jobIds being non-empty)
        .mockImplementationOnce(
          () =>
            createOrderedSelectChain([
              {
                id: 'asset-1',
                jobId: 'job-1',
                label: 'Pack final',
                type: 'image',
                deliveryUrl: 'https://cdn.grandeandgordo.com/asset-1.jpg',
                status: 'approved',
                createdAt: new Date('2026-04-16T12:00:00.000Z'),
                updatedAt: new Date('2026-04-16T12:30:00.000Z'),
              },
            ]),
        )
        // 8. messages (depends on threadIds being non-empty)
        .mockImplementationOnce(
          () =>
            createOrderedSelectChain([
              {
                id: 'message-1',
                threadId: 'thread-1',
                authorRole: 'studio',
                body: 'Te dejamos la entrega semanal lista para revisar.',
                createdAt: new Date('2026-04-16T09:30:00.000Z'),
                readAt: null,
              },
            ]),
        ),
    } as unknown as AppContext['Variables']['db'];

    const workspace = await loadClientAreaWorkspace({
      db,
      userId: 'user-123',
    });

    expect(workspace).not.toBeNull();
    expect(workspace?.projects).toEqual([
      expect.objectContaining({
        id: 'job-1',
        title: 'instagram image',
        status: 'processing',
        dueAt: '2026-04-30T12:00:00.000Z',
      }),
    ]);
    expect(workspace?.billing.invoices).toEqual([
      expect.objectContaining({
        id: 'invoice-1',
        invoiceNumber: 'F2026-001',
        status: 'issued',
      }),
    ]);
    expect(workspace?.reviews).toEqual([
      expect.objectContaining({
        id: 'review-1',
        title: 'Hero v3',
        status: 'needs_review',
      }),
    ]);
    expect(workspace?.files).toEqual([
      expect.objectContaining({
        id: 'asset-1',
        title: 'Pack final',
        category: 'deliverable',
      }),
    ]);
    expect(workspace?.messages).toEqual([
      expect.objectContaining({
        id: 'thread-1',
        subject: 'Entrega semanal',
        unreadCount: 1,
      }),
    ]);
    expect(clientQuery.orderByArgs).toHaveLength(2);
    expect(clientQuery.limitArg).toBe(1);
    expect(jobsQuery.orderByArgs).toHaveLength(1);
    expect(invoicesQuery.orderByArgs).toHaveLength(1);
    expect(notificationsQuery.orderByArgs).toHaveLength(1);
    expect(reviewsQuery.orderByArgs).toHaveLength(1);
    expect(threadsQuery.orderByArgs).toHaveLength(1);
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
