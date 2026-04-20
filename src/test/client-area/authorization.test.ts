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

const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  c.set('user', authenticatedClient);
  await next();
};

describe('client area authorization', () => {
  it('returns 403 when review does not belong to the authenticated client', async () => {
    const saveReviewDecision = vi.fn().mockResolvedValue(null);

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ saveReviewDecision, requireAuth }),
    );

    const response = await app.request('/client-area/reviews/review-other/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'No autorizado' });
    expect(saveReviewDecision).toHaveBeenCalledWith({
      db: {},
      reviewId: 'review-other',
      userId: 'user-123',
      status: 'approved',
      note: null,
    });
  });

  it('returns 403 when thread does not belong to the authenticated client', async () => {
    const postThreadMessage = vi.fn().mockResolvedValue(null);

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ postThreadMessage, requireAuth }),
    );

    const response = await app.request('/client-area/threads/thread-other/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Hello' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'No autorizado' });
    expect(postThreadMessage).toHaveBeenCalledWith({
      db: {},
      threadId: 'thread-other',
      userId: 'user-123',
      body: 'Hello',
    });
  });

  it('returns 200 when review belongs to the authenticated client', async () => {
    const saveReviewDecision = vi.fn().mockResolvedValue({
      id: 'review-own',
      status: 'approved',
    });

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ saveReviewDecision, requireAuth }),
    );

    const response = await app.request('/client-area/reviews/review-own/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'review-own', status: 'approved' });
  });

  it('returns 200 when thread belongs to the authenticated client', async () => {
    const postThreadMessage = vi.fn().mockResolvedValue({
      id: 'msg-1',
    });

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ postThreadMessage, requireAuth }),
    );

    const response = await app.request('/client-area/threads/thread-own/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Hello' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'msg-1' });
  });

  it('returns 403 when no client record is linked to the user for a review decision', async () => {
    const saveReviewDecision = vi.fn().mockResolvedValue(null);

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ saveReviewDecision, requireAuth }),
    );

    const response = await app.request('/client-area/reviews/review-1/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'changes_requested', note: null }),
    });

    expect(response.status).toBe(403);
  });

  it('returns 403 when no client record is linked to the user for a thread message', async () => {
    const postThreadMessage = vi.fn().mockResolvedValue(null);

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ postThreadMessage, requireAuth }),
    );

    const response = await app.request('/client-area/threads/thread-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Message from unlinked user' }),
    });

    expect(response.status).toBe(403);
  });
});

describe('unauthenticated client area requests', () => {
  it('rejects unauthenticated review decision POST with 401', async () => {
    const app = createApp();
    app.route('/client-area', createClientAreaRoutes());

    const response = await app.request('/client-area/reviews/review-1/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated thread message POST with 401', async () => {
    const app = createApp();
    app.route('/client-area', createClientAreaRoutes());

    const response = await app.request('/client-area/threads/thread-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Unauthorized post' }),
    });

    expect(response.status).toBe(401);
  });
});

describe('client area input validation', () => {
  // NOTE: The route handler uses schema.parse() which throws ZodError.
  // Hono surfaces unhandled errors as 500. Once a proper error handler is
  // added that catches ZodError and returns 400, these expectations should
  // be updated to 400.
  it('rejects an invalid review decision status (currently 500 from unhandled ZodError)', async () => {
    const saveReviewDecision = vi.fn().mockResolvedValue(null);

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ saveReviewDecision, requireAuth }),
    );

    const response = await app.request('/client-area/reviews/review-1/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'invalid_status', note: null }),
    });

    expect(response.status).toBe(500);
  });

  it('rejects a whitespace-only message body (currently 500 from unhandled ZodError)', async () => {
    const postThreadMessage = vi.fn().mockResolvedValue(null);

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ postThreadMessage, requireAuth }),
    );

    const response = await app.request('/client-area/threads/thread-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '   ' }),
    });

    expect(response.status).toBe(500);
  });

  it('rejects an empty message body (currently 500 from unhandled ZodError)', async () => {
    const postThreadMessage = vi.fn().mockResolvedValue(null);

    const app = createApp();
    app.route(
      '/client-area',
      createClientAreaRoutes({ postThreadMessage, requireAuth }),
    );

    const response = await app.request('/client-area/threads/thread-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    });

    expect(response.status).toBe(500);
  });
});
