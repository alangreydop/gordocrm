import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';

import { requireAuth as requireAuthMiddleware } from '../../../lib/auth.js';
import { loadClientAreaWorkspace, type LoadClientAreaWorkspaceInput } from '../../../lib/client-area/load-workspace.js';
import {
  postThreadMessage as postThreadMessageService,
  type PostThreadMessageInput,
} from '../../../lib/client-area/message-service.js';
import {
  saveReviewDecision as saveReviewDecisionService,
  type SaveReviewDecisionInput,
} from '../../../lib/client-area/review-service.js';
import type { AppContext } from '../../../types/index.js';

interface ClientAreaRouteDeps {
  loadWorkspace?: (input: LoadClientAreaWorkspaceInput) => ReturnType<typeof loadClientAreaWorkspace>;
  requireAuth?: MiddlewareHandler<AppContext>;
  saveReviewDecision?: (input: SaveReviewDecisionInput) => ReturnType<typeof saveReviewDecisionService>;
  postThreadMessage?: (input: PostThreadMessageInput) => ReturnType<typeof postThreadMessageService>;
}

const reviewDecisionSchema = z.object({
  status: z.enum(['approved', 'changes_requested']),
  note: z.string().trim().nullable().optional(),
});

const threadMessageSchema = z.object({
  body: z.string().trim().min(1),
});

export function createClientAreaRoutes(deps: ClientAreaRouteDeps = {}) {
  const routes = new Hono<AppContext>();
  const requireAuth = deps.requireAuth ?? requireAuthMiddleware;
  const loadWorkspace = deps.loadWorkspace ?? loadClientAreaWorkspace;
  const saveReviewDecision = deps.saveReviewDecision ?? saveReviewDecisionService;
  const postThreadMessage = deps.postThreadMessage ?? postThreadMessageService;

  routes.use('*', requireAuth);

  routes.get('/workspace', async (c) => {
    const workspace = await loadWorkspace({
      db: c.get('db'),
      userId: c.get('user').id,
    });

    if (!workspace) {
      return c.json({ error: 'Cliente no encontrado' }, 404);
    }

    return c.json(workspace);
  });

  routes.post('/reviews/:reviewId/decision', async (c) => {
    const payload = reviewDecisionSchema.parse(await c.req.json());

    const result = await saveReviewDecision({
      db: c.get('db'),
      reviewId: c.req.param('reviewId'),
      userId: c.get('user').id,
      status: payload.status,
      note: payload.note ?? null,
    });

    return c.json(result);
  });

  routes.post('/threads/:threadId/messages', async (c) => {
    const payload = threadMessageSchema.parse(await c.req.json());

    const result = await postThreadMessage({
      db: c.get('db'),
      threadId: c.req.param('threadId'),
      userId: c.get('user').id,
      body: payload.body,
    });

    return c.json(result);
  });

  return routes;
}

export const clientAreaRoutes = createClientAreaRoutes();
