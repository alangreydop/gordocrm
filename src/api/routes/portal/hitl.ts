/**
 * HITL Routes — Human-in-the-Loop review queue and resolution
 *
 * Endpoints:
 * GET    /              — List pending HITL reviews (admin)
 * GET    /:id           — Get review detail (admin)
 * POST   /:id/approve   — Approve a review (admin)
 * POST   /:id/reject    — Reject a review (admin)
 * POST   /:id/override  — Override with brand graph context (admin)
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { schema } from '../../../../db/index.js';
import type { AppBindings, AppContext } from '../../../types/index.js';
import { resolveReview, getReviewQueue, type OrchestratorEnv } from '../../../lib/orchestrator.js';
import { getJobReviews } from '../../../lib/hitl.js';
import { requireAuth } from '../../../lib/auth.js';

function buildEnv(env: AppBindings): OrchestratorEnv {
  const result: OrchestratorEnv = {};
  if (env.ANTHROPIC_API_KEY) result.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  if (env.ASSETS) result.ASSETS = env.ASSETS;
  if (env.AGENT_STORE) result.AGENT_STORE = env.AGENT_STORE;
  return result;
}

export const hitlRoutes = new Hono<AppContext>();

// All HITL routes require admin
hitlRoutes.use('/*', requireAuth, async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
  return;
});

// GET / — List pending HITL reviews
hitlRoutes.get('/', async (c) => {
  const db = c.get('db');
  const reviews = await getReviewQueue(db);
  return c.json({ reviews });
});

// GET /:id — Get review detail
hitlRoutes.get('/:id', async (c) => {
  const db = c.get('db');
  const reviewId = c.req.param('id');

  const reviews = await db
    .select()
    .from(schema.hitlReviews)
    .where(eq(schema.hitlReviews.id, reviewId))
    .limit(1);

  if (!reviews.length) {
    return c.json({ error: 'Review not found' }, 404);
  }

  return c.json({ review: reviews[0] });
});

// POST /:id/approve — Approve a review
hitlRoutes.post('/:id/approve', async (c) => {
  const db = c.get('db');
  const env = buildEnv(c.env);
  const reviewId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const note = (body as { note?: string }).note;

  const result = await resolveReview(db, env, reviewId, user.id, 'approved', note);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true, newState: result.newState });
});

// POST /:id/reject — Reject a review
hitlRoutes.post('/:id/reject', async (c) => {
  const db = c.get('db');
  const env = buildEnv(c.env);
  const reviewId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const note = (body as { note?: string }).note;

  const result = await resolveReview(db, env, reviewId, user.id, 'rejected', note);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true, newState: result.newState });
});

// POST /:id/override — Override with brand graph context
hitlRoutes.post('/:id/override', async (c) => {
  const db = c.get('db');
  const env = buildEnv(c.env);
  const reviewId = c.req.param('id');
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const note = (body as { note?: string }).note;

  const result = await resolveReview(db, env, reviewId, user.id, 'override_brand_graph', note);

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true, newState: result.newState });
});

// GET /jobs/:jobId — Get reviews for a specific job
hitlRoutes.get('/jobs/:jobId', async (c) => {
  const db = c.get('db');
  const jobId = c.req.param('jobId');

  const reviews = await getJobReviews(db, jobId);
  return c.json({ reviews });
});