import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import { requireAuth as requireAuthMiddleware } from '../../../lib/auth.js';
import { loadClientAreaWorkspace, type LoadClientAreaWorkspaceInput } from '../../../lib/client-area/load-workspace.js';
import type { AppContext } from '../../../types/index.js';

interface ClientAreaRouteDeps {
  loadWorkspace?: (input: LoadClientAreaWorkspaceInput) => ReturnType<typeof loadClientAreaWorkspace>;
  requireAuth?: MiddlewareHandler<AppContext>;
}

export function createClientAreaRoutes(deps: ClientAreaRouteDeps = {}) {
  const routes = new Hono<AppContext>();
  const requireAuth = deps.requireAuth ?? requireAuthMiddleware;
  const loadWorkspace = deps.loadWorkspace ?? loadClientAreaWorkspace;

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

  return routes;
}

export const clientAreaRoutes = createClientAreaRoutes();
