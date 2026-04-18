import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { createClientAreaRoutes } from '../../api/routes/portal/client-area';
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

describe('client area actions', () => {
  it('records a review decision', async () => {
    const saveReviewDecision = vi
      .fn()
      .mockResolvedValue({ id: 'review-1', status: 'approved' });

    const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
      c.set('user', authenticatedClient);
      await next();
    };

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({
        loadWorkspace: vi.fn(),
        requireAuth,
        saveReviewDecision,
        postThreadMessage: vi.fn(),
      }),
    );

    const response = await app.request('/client-area/reviews/review-1/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        note: 'Listo para cerrar.',
      }),
    });

    expect(response.status).toBe(200);
    expect(saveReviewDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        db: {},
        reviewId: 'review-1',
        userId: 'user-123',
        status: 'approved',
        note: 'Listo para cerrar.',
      }),
    );
  });

  it('posts a contextual message into a thread', async () => {
    const postThreadMessage = vi.fn().mockResolvedValue({ id: 'message-1' });

    const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
      c.set('user', authenticatedClient);
      await next();
    };

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({
        loadWorkspace: vi.fn(),
        requireAuth,
        saveReviewDecision: vi.fn(),
        postThreadMessage,
      }),
    );

    const response = await app.request('/client-area/threads/thread-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: 'Necesitamos mover la entrega al jueves.',
      }),
    });

    expect(response.status).toBe(200);
    expect(postThreadMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        db: {},
        threadId: 'thread-1',
        userId: 'user-123',
        body: 'Necesitamos mover la entrega al jueves.',
      }),
    );
  });
});
