import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { db, schema } from '../../../../db/index.js';
import { requireAuth, type AuthUser } from '../../../lib/auth.js';

const createJobSchema = z.object({
  clientId: z.string().uuid(),
  briefText: z.string().optional(),
  platform: z.enum(['instagram', 'tiktok', 'amazon_pdp', 'paid_ads']).optional(),
  type: z.enum(['image', 'video']).optional(),
});

const updateJobSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'delivered']).optional(),
  briefText: z.string().optional(),
  platform: z.enum(['instagram', 'tiktok', 'amazon_pdp', 'paid_ads']).optional(),
  type: z.enum(['image', 'video']).optional(),
});

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // List jobs — admin sees all, client sees only their own
  app.get('/', async (request) => {
    const user = (request as any).user as AuthUser;

    if (user.role === 'admin') {
      const rows = await db
        .select({
          id: schema.jobs.id,
          clientId: schema.jobs.clientId,
          clientName: schema.clients.name,
          status: schema.jobs.status,
          briefText: schema.jobs.briefText,
          platform: schema.jobs.platform,
          type: schema.jobs.type,
          createdAt: schema.jobs.createdAt,
          updatedAt: schema.jobs.updatedAt,
        })
        .from(schema.jobs)
        .leftJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
        .orderBy(desc(schema.jobs.createdAt));

      return { jobs: rows };
    }

    // Client: find their client record first
    const [clientRecord] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.userId, user.id))
      .limit(1);

    if (!clientRecord) {
      return { jobs: [] };
    }

    const rows = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.clientId, clientRecord.id))
      .orderBy(desc(schema.jobs.createdAt));

    return { jobs: rows };
  });

  // Get single job
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = (request as any).user as AuthUser;
    const { id } = request.params;

    const [job] = await db
      .select({
        id: schema.jobs.id,
        clientId: schema.jobs.clientId,
        clientName: schema.clients.name,
        status: schema.jobs.status,
        briefText: schema.jobs.briefText,
        platform: schema.jobs.platform,
        type: schema.jobs.type,
        loraModelId: schema.jobs.loraModelId,
        createdAt: schema.jobs.createdAt,
        updatedAt: schema.jobs.updatedAt,
      })
      .from(schema.jobs)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.jobs.clientId))
      .where(eq(schema.jobs.id, id))
      .limit(1);

    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    // Client can only see their own jobs
    if (user.role === 'client') {
      const [clientRecord] = await db
        .select()
        .from(schema.clients)
        .where(eq(schema.clients.userId, user.id))
        .limit(1);

      if (!clientRecord || job.clientId !== clientRecord.id) {
        return reply.code(403).send({ error: 'Access denied' });
      }
    }

    const assets = await db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.jobId, id));

    return { job, assets };
  });

  // Create job (admin only)
  app.post('/', async (request, reply) => {
    const user = (request as any).user as AuthUser;
    if (user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const body = createJobSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid data', details: body.error.issues });
    }

    // Verify client exists
    const [client] = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, body.data.clientId))
      .limit(1);

    if (!client) {
      return reply.code(400).send({ error: 'Client not found' });
    }

    const [job] = await db
      .insert(schema.jobs)
      .values(body.data)
      .returning();

    return reply.code(201).send({ job });
  });

  // Update job (admin only)
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = (request as any).user as AuthUser;
    if (user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }

    const { id } = request.params;
    const body = updateJobSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid data', details: body.error.issues });
    }

    const updates = { ...body.data, updatedAt: new Date() };
    const [job] = await db
      .update(schema.jobs)
      .set(updates)
      .where(eq(schema.jobs.id, id))
      .returning();

    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }

    return { job };
  });
}
