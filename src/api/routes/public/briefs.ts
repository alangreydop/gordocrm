import { desc, eq, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import type { AppContext } from '../../../types/index.js';

const briefContentTypes = ['foto', 'video', 'ambos'] as const;

const createBriefSchema = z.object({
  email: z.string().trim().email(),
  tipo: z.enum(briefContentTypes),
  descripcion: z.string().trim().min(1).max(2000),
  source: z.string().trim().min(1).max(80).optional(),
  sourcePage: z.string().trim().max(500).optional(),
});

export const publicBriefRoutes = new Hono<AppContext>();

publicBriefRoutes.post('/', async (c) => {
  const payload: unknown = await c.req.json().catch(() => null);
  const body = createBriefSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid brief payload', details: body.error.issues }, 400);
  }

  const db = c.get('db');
  const now = new Date();
  const email = body.data.email.trim().toLowerCase();

  const [matchedClient] = await db
    .select({
      id: schema.clients.id,
      email: schema.clients.email,
      name: schema.clients.name,
      company: schema.clients.company,
    })
    .from(schema.clients)
    .leftJoin(schema.users, eq(schema.users.id, schema.clients.userId))
    .where(
      or(
        eq(schema.clients.email, email),
        eq(schema.users.email, email),
      ),
    )
    .orderBy(desc(schema.clients.updatedAt))
    .limit(1);

  const briefId = crypto.randomUUID();

  await db.insert(schema.briefSubmissions).values({
    id: briefId,
    clientId: matchedClient?.id ?? null,
    email,
    contentType: body.data.tipo,
    description: body.data.descripcion,
    status: 'new',
    source: body.data.source?.trim() || 'website',
    sourcePage: body.data.sourcePage?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  if (matchedClient?.id) {
    await db
      .update(schema.clients)
      .set({
        lastContactedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.clients.id, matchedClient.id));
  }

  return c.json({
    ok: true,
    brief: {
      id: briefId,
      email,
      tipo: body.data.tipo,
      status: 'new',
      createdAt: now,
      linkedClientId: matchedClient?.id ?? null,
    },
  });
});
