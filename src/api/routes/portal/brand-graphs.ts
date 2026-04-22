/**
 * Brand Graph API
 *
 * GET/PUT per-client brand graph (JSON column on clients table).
 * Admin writes, client reads their own.
 */

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const brandGraphSchema = z.object({
  lighting: z.string().optional(),
  angles: z.string().optional(),
  materials: z.string().optional(),
  compositionRules: z.string().optional(),
  colorPalette: z.array(z.string()).optional(),
  emotionalTone: z.string().optional(),
  doNotUse: z.string().optional(),
}).optional().nullable();

const updateBrandGraphSchema = z.object({
  brandGraph: brandGraphSchema,
});

export const brandGraphRoutes = new Hono<AppContext>();
brandGraphRoutes.use('*', requireAuth);

// GET /api/portal/clients/:id/brand-graph
brandGraphRoutes.get('/clients/:id/brand-graph', async (c) => {
  const user = c.get('user');
  const clientId = c.req.param('id');

  // Clients can only read their own brand graph
  if (user.role === 'client') {
    const db = c.get('db');
    const [client] = await db
      .select({ userId: schema.clients.userId })
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId))
      .limit(1);

    if (!client || client.userId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  const db = c.get('db');
  const [client] = await db
    .select({ brandGraph: schema.clients.brandGraph })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) return c.json({ error: 'Client not found' }, 404);

  let parsed: unknown = null;
  if (client.brandGraph) {
    try {
      parsed = JSON.parse(client.brandGraph);
    } catch {
      parsed = null;
    }
  }

  return c.json({ brandGraph: parsed });
});

// PUT /api/portal/clients/:id/brand-graph (admin only)
brandGraphRoutes.put('/clients/:id/brand-graph', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Admin access required' }, 403);

  const clientId = c.req.param('id');
  const payload: unknown = await c.req.json().catch(() => null);
  const parsed = updateBrandGraphSchema.safeParse(payload);
  if (!parsed.success) return c.json({ error: 'Invalid data', details: parsed.error.issues }, 400);

  const db = c.get('db');

  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) return c.json({ error: 'Client not found' }, 404);

  const brandGraphJson = parsed.data.brandGraph ? JSON.stringify(parsed.data.brandGraph) : null;

  await db
    .update(schema.clients)
    .set({
      brandGraph: brandGraphJson,
      updatedAt: new Date(),
    })
    .where(eq(schema.clients.id, clientId));

  return c.json({ ok: true, brandGraph: parsed.data.brandGraph });
});
