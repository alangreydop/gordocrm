import { Hono } from 'hono';
import type { AppContext } from '../../../types/index.js';

export const publicBriefRoutes = new Hono<AppContext>();

publicBriefRoutes.post('/', async (c) => {
  return c.json({
    error: 'Public brief intake is disabled',
    message:
      'Brief intake now starts from a won handoff or an authenticated client session inside the portal.',
  }, 410);
});
