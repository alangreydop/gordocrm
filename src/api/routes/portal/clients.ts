import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, sql, count } from 'drizzle-orm';
import { db, schema } from '../../../../db/index.js';
import { requireAuth, requireAdmin, type AuthUser } from '../../../lib/auth.js';

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
});

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  subscriptionStatus: z.enum(['active', 'inactive', 'cancelled']).optional(),
});

export async function clientRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  // List clients
  app.get('/', async (_request) => {
    const rows = await db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        email: schema.clients.email,
        company: schema.clients.company,
        subscriptionStatus: schema.clients.subscriptionStatus,
        createdAt: schema.clients.createdAt,
        jobCount: count(schema.jobs.id),
      })
      .from(schema.clients)
      .leftJoin(schema.jobs, eq(schema.jobs.clientId, schema.clients.id))
      .groupBy(schema.clients.id)
      .orderBy(desc(schema.clients.createdAt));

    return { clients: rows };
  });

  // Get single client
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, id))
      .limit(1);

    if (!client) {
      return reply.code(404).send({ error: 'Client not found' });
    }

    const jobs = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.clientId, id))
      .orderBy(desc(schema.jobs.createdAt));

    return { client, jobs };
  });

  // Create client
  app.post('/', async (request, reply) => {
    const body = createClientSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid data', details: body.error.issues });
    }

    const [client] = await db
      .insert(schema.clients)
      .values(body.data)
      .returning();

    return reply.code(201).send({ client });
  });

  // Update client
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = updateClientSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid data', details: body.error.issues });
    }

    const updates = { ...body.data, updatedAt: new Date() };
    const [client] = await db
      .update(schema.clients)
      .set(updates)
      .where(eq(schema.clients.id, id))
      .returning();

    if (!client) {
      return reply.code(404).send({ error: 'Client not found' });
    }

    return { client };
  });
}
