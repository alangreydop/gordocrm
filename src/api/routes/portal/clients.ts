import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { clearSessionsForUser, createUser, hashPassword, requireAdmin } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const clientSubscriptionStatuses = ['active', 'inactive', 'cancelled'] as const;
const clientDatasetStatuses = [
  'pending_capture',
  'captured',
  'trained',
  'active',
  'archived',
] as const;
const clientSegments = ['rentable', 'growth', 'premium', 'enterprise'] as const;
const marginProfiles = ['estrecho', 'medio', 'alto'] as const;

const optionalNullableString = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  },
  z.union([z.string(), z.null()]).optional(),
);

const optionalNullableNumber = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  },
  z.union([z.number().int().min(0), z.null()]).optional(),
);

const optionalNullableDate = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date;
    }
    return value;
  },
  z.union([z.date(), z.null()]).optional(),
);

const optionalNullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      return value;
    },
    z.union([z.enum(values), z.null()]).optional(),
  );

const createClientSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  company: optionalNullableString,
  plan: optionalNullableString,
  accountManager: optionalNullableString,
  monthlyUnitCapacity: optionalNullableNumber,
  subscriptionStatus: z.enum(clientSubscriptionStatuses).optional(),
  datasetStatus: z.enum(clientDatasetStatuses).optional(),
  segment: z.enum(clientSegments).optional(),
  marginProfile: z.enum(marginProfiles).optional(),
  notes: optionalNullableString,
  nextReviewAt: optionalNullableDate,
  lastContactedAt: optionalNullableDate,
  portalPassword: z.string().min(8).optional(),

  // Campos fiscales
  taxId: optionalNullableString,
  taxIdType: z.enum(['NIF', 'CIF', 'NIE', 'VIES']).optional(),
  legalName: optionalNullableString,
  addressLine1: optionalNullableString,
  addressLine2: optionalNullableString,
  city: optionalNullableString,
  region: optionalNullableString,
  postalCode: optionalNullableString,
  country: z.string().length(2).optional(),
  phone: optionalNullableString,
  registrationNumber: optionalNullableString,
});

const updateClientSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  company: optionalNullableString,
  plan: optionalNullableString,
  accountManager: optionalNullableString,
  monthlyUnitCapacity: optionalNullableNumber,
  subscriptionStatus: z.enum(clientSubscriptionStatuses).optional(),
  datasetStatus: z.enum(clientDatasetStatuses).optional(),
  segment: optionalNullableEnum(clientSegments),
  marginProfile: optionalNullableEnum(marginProfiles),
  notes: optionalNullableString,
  nextReviewAt: optionalNullableDate,
  lastContactedAt: optionalNullableDate,

  // Campos fiscales
  taxId: optionalNullableString,
  taxIdType: z.enum(['NIF', 'CIF', 'NIE', 'VIES']).optional(),
  legalName: optionalNullableString,
  addressLine1: optionalNullableString,
  addressLine2: optionalNullableString,
  city: optionalNullableString,
  region: optionalNullableString,
  postalCode: optionalNullableString,
  country: z.string().length(2).optional(),
  phone: optionalNullableString,
  registrationNumber: optionalNullableString,
});

const portalAccessSchema = z.object({
  email: z.string().trim().email().optional(),
  name: z.string().trim().min(1).optional(),
  password: z.string().min(8),
});

export const clientRoutes = new Hono<AppContext>();

clientRoutes.use('*', requireAdmin);

clientRoutes.get('/', async (c) => {
  const db = c.get('db');
  const rows = await db
    .select({
      id: schema.clients.id,
      userId: schema.clients.userId,
      name: schema.clients.name,
      email: schema.clients.email,
      company: schema.clients.company,
      plan: schema.clients.plan,
      accountManager: schema.clients.accountManager,
      subscriptionStatus: schema.clients.subscriptionStatus,
      datasetStatus: schema.clients.datasetStatus,
      segment: schema.clients.segment,
      marginProfile: schema.clients.marginProfile,
      monthlyUnitCapacity: schema.clients.monthlyUnitCapacity,
      nextReviewAt: schema.clients.nextReviewAt,
      createdAt: schema.clients.createdAt,
      // Campos fiscales
      taxId: schema.clients.taxId,
      taxIdType: schema.clients.taxIdType,
      legalName: schema.clients.legalName,
      city: schema.clients.city,
      postalCode: schema.clients.postalCode,
      country: schema.clients.country,
      jobCount: sql<number>`cast(count(${schema.jobs.id}) as integer)`,
      activeJobs: sql<number>`cast(coalesce(sum(case when ${schema.jobs.status} in ('pending', 'processing') then 1 else 0 end), 0) as integer)`,
      plannedUnits: sql<number>`cast(coalesce(sum(${schema.jobs.unitsPlanned}), 0) as integer)`,
    })
    .from(schema.clients)
    .leftJoin(schema.jobs, eq(schema.jobs.clientId, schema.clients.id))
    .groupBy(
      schema.clients.id,
      schema.clients.userId,
      schema.clients.name,
      schema.clients.email,
      schema.clients.company,
      schema.clients.plan,
      schema.clients.accountManager,
      schema.clients.subscriptionStatus,
      schema.clients.datasetStatus,
      schema.clients.segment,
      schema.clients.marginProfile,
      schema.clients.monthlyUnitCapacity,
      schema.clients.nextReviewAt,
      schema.clients.createdAt,
      schema.clients.taxId,
      schema.clients.taxIdType,
      schema.clients.legalName,
      schema.clients.city,
      schema.clients.postalCode,
      schema.clients.country,
    )
    .orderBy(desc(schema.clients.createdAt));

  return c.json({ clients: rows });
});

clientRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).limit(1);

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const [portalUser, summary, jobs] = await Promise.all([
    client.userId
      ? db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            createdAt: schema.users.createdAt,
            updatedAt: schema.users.updatedAt,
          })
          .from(schema.users)
          .where(eq(schema.users.id, client.userId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        totalJobs: sql<number>`cast(count(*) as integer)`,
        activeJobs: sql<number>`cast(coalesce(sum(case when ${schema.jobs.status} in ('pending', 'processing') then 1 else 0 end), 0) as integer)`,
        deliveredJobs: sql<number>`cast(coalesce(sum(case when ${schema.jobs.status} = 'delivered' then 1 else 0 end), 0) as integer)`,
        unitsPlanned: sql<number>`cast(coalesce(sum(${schema.jobs.unitsPlanned}), 0) as integer)`,
        unitsConsumed: sql<number>`cast(coalesce(sum(${schema.jobs.unitsConsumed}), 0) as integer)`,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.clientId, id))
      .then(
        (rows) =>
          rows[0] ?? {
            totalJobs: 0,
            activeJobs: 0,
            deliveredJobs: 0,
            unitsPlanned: 0,
            unitsConsumed: 0,
          },
      ),
    db
      .select({
        id: schema.jobs.id,
        clientId: schema.jobs.clientId,
        status: schema.jobs.status,
        briefText: schema.jobs.briefText,
        platform: schema.jobs.platform,
        type: schema.jobs.type,
        dueAt: schema.jobs.dueAt,
        unitsPlanned: schema.jobs.unitsPlanned,
        unitsConsumed: schema.jobs.unitsConsumed,
        grossMarginEstimated: schema.jobs.grossMarginEstimated,
        stackLane: schema.jobs.stackLane,
        benchmarkLevel: schema.jobs.benchmarkLevel,
        createdAt: schema.jobs.createdAt,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.clientId, id))
      .orderBy(desc(schema.jobs.createdAt)),
  ]);

  return c.json({
    client: {
      ...client,
      // Incluir campos fiscales completos
      taxId: client.taxId,
      taxIdType: client.taxIdType,
      legalName: client.legalName,
      addressLine1: client.addressLine1,
      addressLine2: client.addressLine2,
      city: client.city,
      region: client.region,
      postalCode: client.postalCode,
      country: client.country,
      phone: client.phone,
      registrationNumber: client.registrationNumber,
    },
    portalUser,
    summary,
    jobs,
  });
});

clientRoutes.post('/', async (c) => {
  const payload: unknown = await c.req.json().catch(() => null);
  const body = createClientSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  const db = c.get('db');
  const id = crypto.randomUUID();
  const now = new Date();

  if (body.data.portalPassword) {
    const [existingUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, body.data.email))
      .limit(1);

    if (existingUser) {
      return c.json({ error: 'A portal user with this email already exists' }, 400);
    }
  }

  await db.insert(schema.clients).values({
    id,
    name: body.data.name,
    email: body.data.email,
    company: body.data.company ?? null,
    plan: body.data.plan ?? null,
    accountManager: body.data.accountManager ?? null,
    monthlyUnitCapacity: body.data.monthlyUnitCapacity ?? null,
    subscriptionStatus: body.data.subscriptionStatus ?? 'inactive',
    datasetStatus: body.data.datasetStatus ?? 'pending_capture',
    segment: body.data.segment ?? null,
    marginProfile: body.data.marginProfile ?? null,
    notes: body.data.notes ?? null,
    nextReviewAt: body.data.nextReviewAt ?? null,
    lastContactedAt: body.data.lastContactedAt ?? null,
    // Campos fiscales
    taxId: body.data.taxId ?? null,
    taxIdType: body.data.taxIdType ?? 'NIF',
    legalName: body.data.legalName ?? null,
    addressLine1: body.data.addressLine1 ?? null,
    addressLine2: body.data.addressLine2 ?? null,
    city: body.data.city ?? null,
    region: body.data.region ?? null,
    postalCode: body.data.postalCode ?? null,
    country: body.data.country ?? 'ES',
    phone: body.data.phone ?? null,
    registrationNumber: body.data.registrationNumber ?? null,
    createdAt: now,
    updatedAt: now,
  });

  if (body.data.portalPassword) {
    const user = await createUser(
      db,
      body.data.email,
      body.data.portalPassword,
      'client',
      body.data.name,
      body.data.company ?? undefined,
    );

    if (user) {
      await db
        .update(schema.clients)
        .set({
          userId: user.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.clients.id, id));
    }
  }

  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).limit(1);

  return c.json({ client }, 201);
});

clientRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const payload: unknown = await c.req.json().catch(() => null);
  const body = updateClientSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid data', details: body.error.issues }, 400);
  }

  if (Object.keys(body.data).length === 0) {
    return c.json({ error: 'No changes provided' }, 400);
  }

  const db = c.get('db');
  const [existingClient] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  if (!existingClient) {
    return c.json({ error: 'Client not found' }, 404);
  }

  if (body.data.email && existingClient.userId) {
    const [emailOwner] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, body.data.email))
      .limit(1);

    if (emailOwner && emailOwner.id !== existingClient.userId) {
      return c.json({ error: 'Another portal user already uses this email' }, 400);
    }
  }

  await db
    .update(schema.clients)
    .set({
      ...body.data,
      subscriptionStatus: body.data.subscriptionStatus,
      datasetStatus: body.data.datasetStatus,
      segment: body.data.segment,
      marginProfile: body.data.marginProfile,
      // Campos fiscales
      taxId: body.data.taxId ?? null,
      taxIdType: body.data.taxIdType ?? 'NIF',
      legalName: body.data.legalName ?? null,
      addressLine1: body.data.addressLine1 ?? null,
      addressLine2: body.data.addressLine2 ?? null,
      city: body.data.city ?? null,
      region: body.data.region ?? null,
      postalCode: body.data.postalCode ?? null,
      country: body.data.country ?? 'ES',
      phone: body.data.phone ?? null,
      registrationNumber: body.data.registrationNumber ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.clients.id, id));

  if (existingClient.userId) {
    const userUpdates: Record<string, string | Date | null> = {};

    if (body.data.name) userUpdates.name = body.data.name;
    if (body.data.email) userUpdates.email = body.data.email;
    if ('company' in body.data) userUpdates.company = body.data.company ?? null;

    if (Object.keys(userUpdates).length > 0) {
      await db
        .update(schema.users)
        .set({
          ...userUpdates,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, existingClient.userId));
    }
  }

  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).limit(1);

  return c.json({ client });
});

clientRoutes.post('/:id/portal-access', async (c) => {
  const clientId = c.req.param('id');
  const payload: unknown = await c.req.json().catch(() => null);
  const body = portalAccessSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Invalid portal access payload', details: body.error.issues }, 400);
  }

  const db = c.get('db');
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const email = body.data.email ?? client.email;
  const name = body.data.name ?? client.name;
  const [existingOwner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existingOwner && existingOwner.id !== client.userId) {
    return c.json({ error: 'Another portal user already uses this email' }, 400);
  }

  if (client.userId) {
    await db
      .update(schema.users)
      .set({
        email,
        name,
        company: client.company ?? null,
        passwordHash: await hashPassword(body.data.password),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, client.userId));

    await db
      .update(schema.clients)
      .set({
        email,
        name,
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, clientId));

    await clearSessionsForUser(db, client.userId);
  } else {
    const user = await createUser(
      db,
      email,
      body.data.password,
      'client',
      name,
      client.company ?? undefined,
    );

    if (!user) {
      return c.json({ error: 'Could not create portal user' }, 500);
    }

    await db
      .update(schema.clients)
      .set({
        userId: user.id,
        email,
        name,
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, clientId));
  }

  const [portalUser] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      updatedAt: schema.users.updatedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  return c.json({ portalUser });
});
