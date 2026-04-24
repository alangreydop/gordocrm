import { Hono } from 'hono';
import { eq, like, and } from 'drizzle-orm';
import { z } from 'zod';
import { clients, users, briefSubmissions, clientActivities } from '../../../db/schema';
import { verifyWebhookSignature } from '../../lib/webhook-signature.js';
import { createUser } from '../../lib/auth.js';
import { getPortalLoginUrl } from '../../lib/portal-url.js';
import type { AppContext } from '../../types/index.js';

// Zod schema for the incoming TransferPayload — acts as the cross-worker contract.
// When adding fields to gordoleads TransferPayload, add them here too.
const fiscalSchema = z.object({
  taxId: z.string().nullable().optional(),
  taxIdType: z.enum(['NIF', 'NIE', 'CIF']).nullable().optional(),
  legalName: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().default('ES'),
});

const transferDataSchema = z.object({
  companyName: z.string(),
  contactName: z.string().nullable().optional(),
  contactTitle: z.string().nullable().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  subsector: z.string().nullable().optional(),
  tier: z.enum(['T1', 'T2', 'T3']).nullable().optional(),
  region: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  uspVerified: z.string().nullable().optional(),
  painPoint: z.string().nullable().optional(),
  productStar: z.string().nullable().optional(),
  commercialAngle: z.string().nullable().optional(),
  briefDescription: z.string().nullable().optional(),
  productionType: z.enum(['foto', 'video', 'ambos']).nullable().optional(),
  recommendedPlan: z.string().nullable().optional(),
  recommendedSession: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  source: z.string(),
  notes: z.string().nullable().optional(),
  fiscal: fiscalSchema.optional(),
  activities: z.array(
    z.object({
      type: z.string(),
      content: z.string().nullable().optional(),
      performedBy: z.string().nullable().optional(),
      createdAt: z.number(),
    }),
  ).optional(),
});

const transferPayloadSchema = z.object({
  event: z.literal('lead.won'),
  leadId: z.string(),
  timestamp: z.string(),
  traceId: z.string().optional(),
  data: transferDataSchema,
});

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

export const leadWonWebhook = new Hono<AppContext>();

leadWonWebhook.post('/lead-won', async (c) => {
  const clientIp = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (isRateLimited(clientIp)) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  const signature = c.req.header('X-Webhook-Signature');
  const timestamp = c.req.header('X-Webhook-Timestamp');
  const secret = c.env.LEAD_TRANSFER_SECRET;
  const traceId = c.req.header('X-Request-Id') ?? 'no-trace';

  if (!signature || !timestamp || !secret) {
    return c.json({ error: 'Missing auth headers' }, 401);
  }

  const body = await c.req.json();
  const payload = JSON.stringify(body) + timestamp;
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);

  if (Math.abs(now - ts) > 300) {
    return c.json({ error: 'Timestamp expired' }, 401);
  }

  const valid = await verifyWebhookSignature(payload, signature, secret);
  if (!valid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  const db = c.get('db');

  // Parse and validate payload structure (runtime contract across worker boundary)
  const parsed = transferPayloadSchema.safeParse(body);
  if (!parsed.success) {
    console.error(`[Lead Won Webhook] [${traceId}] Invalid payload:`, parsed.error.issues);
    return c.json({ error: 'Invalid payload structure', issues: parsed.error.issues }, 400);
  }

  const raw = parsed.data.data;
  const leadId = parsed.data.leadId;

  // Normalize optional-nullable fields to string | null for exactOptionalPropertyTypes compat.
  const data = {
    ...raw,
    contactName: raw.contactName ?? null,
    contactTitle: raw.contactTitle ?? null,
    contactPhone: raw.contactPhone ?? null,
    websiteUrl: raw.websiteUrl ?? null,
    sector: raw.sector ?? null,
    subsector: raw.subsector ?? null,
    tier: raw.tier ?? null,
    region: raw.region ?? null,
    address: raw.address ?? null,
    uspVerified: raw.uspVerified ?? null,
    painPoint: raw.painPoint ?? null,
    productStar: raw.productStar ?? null,
    commercialAngle: raw.commercialAngle ?? null,
    briefDescription: raw.briefDescription ?? null,
    productionType: raw.productionType ?? null,
    recommendedPlan: raw.recommendedPlan ?? null,
    recommendedSession: raw.recommendedSession ?? null,
    assignedTo: raw.assignedTo ?? null,
    notes: raw.notes ?? null,
    activities: (raw.activities ?? []).map((a) => ({
      type: a.type,
      content: a.content ?? null,
      performedBy: a.performedBy ?? null,
      createdAt: a.createdAt,
    })),
  } as const;

  try {
    const tempPassword = generateTempPassword(data.companyName);
    let userId: string;
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.contactEmail))
      .limit(1);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const newUser = await createUser(
        db,
        data.contactEmail,
        tempPassword,
        'client',
        data.contactName ?? data.companyName,
        data.companyName,
      );
      if (!newUser) {
        console.error(`[Lead Won Webhook] [${traceId}] Failed to create portal user for`, data.contactEmail);
        return c.json({ error: 'Failed to create portal user' }, 500);
      }
      userId = newUser.id;
    }

    const [existingByExternal] = await db
      .select()
      .from(clients)
      .where(eq(clients.externalClientId, leadId))
      .limit(1);

    const [existingByEmail] = await db
      .select()
      .from(clients)
      .where(eq(clients.email, data.contactEmail))
      .limit(1);

    let clientId: string;

    const fiscalUpdates = data.fiscal
      ? {
          taxId: data.fiscal.taxId ?? undefined,
          taxIdType: data.fiscal.taxIdType ?? undefined,
          legalName: data.fiscal.legalName ?? undefined,
          addressLine1: data.fiscal.addressLine1 ?? data.address ?? undefined,
          addressLine2: data.fiscal.addressLine2 ?? undefined,
          city: data.fiscal.city ?? undefined,
          postalCode: data.fiscal.postalCode ?? undefined,
          country: data.fiscal.country ?? 'ES',
        }
      : { addressLine1: data.address ?? undefined, country: 'ES' };

    if (existingByExternal) {
      clientId = existingByExternal.id;
      await db.update(clients).set({
        name: data.companyName,
        email: data.contactEmail,
        phone: data.contactPhone ?? undefined,
        region: data.region ?? undefined,
        leadTier: data.tier ?? undefined,
        leadSource: data.source,
        websiteUrl: data.websiteUrl ?? undefined,
        userId,
        notes: buildNotes(data),
        updatedAt: new Date(),
        ...fiscalUpdates,
      }).where(eq(clients.id, clientId));
    } else if (existingByEmail) {
      clientId = existingByEmail.id;
      await db.update(clients).set({
        name: data.companyName,
        phone: data.contactPhone ?? undefined,
        region: data.region ?? undefined,
        leadTier: data.tier ?? undefined,
        leadSource: data.source,
        websiteUrl: data.websiteUrl ?? undefined,
        externalClientId: leadId,
        userId,
        notes: buildNotes(data),
        updatedAt: new Date(),
        ...fiscalUpdates,
      }).where(eq(clients.id, clientId));
    } else {
      const newClient = {
        id: crypto.randomUUID(),
        name: data.companyName,
        email: data.contactEmail,
        phone: data.contactPhone ?? undefined,
        region: data.region ?? undefined,
        taxIdType: 'NIF' as const,
        leadTier: data.tier ?? undefined,
        leadSource: data.source,
        websiteUrl: data.websiteUrl ?? undefined,
        externalClientId: leadId,
        userId,
        notes: buildNotes(data),
        datasetStatus: 'pending_capture' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...fiscalUpdates,
      };
      await db.insert(clients).values(newClient);
      clientId = newClient.id;
    }

    const briefId = crypto.randomUUID();
    await db.insert(briefSubmissions).values({
      id: briefId,
      clientId,
      email: data.contactEmail,
      description: data.briefDescription ?? `Brief inicial para ${data.companyName}`,
      objective: buildObjective(data),
      audience: data.sector ? `${data.sector}${data.subsector ? ` / ${data.subsector}` : ''}` : null,
      style: data.uspVerified,
      cta: data.recommendedPlan,
      contentType: data.productionType ?? 'ambos',
      sourcePage: data.websiteUrl,
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [existingActivity] = await db
      .select()
      .from(clientActivities)
      .where(and(
        eq(clientActivities.clientId, clientId),
        like(clientActivities.metadata, `%"leadId":"${leadId}"%`),
      ))
      .limit(1);

    if (!existingActivity && data.activities && data.activities.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < data.activities.length; i += batchSize) {
        const batch = data.activities.slice(i, i + batchSize);
        await db.insert(clientActivities).values(
          batch.map((a: { type: string; content?: string | null; performedBy?: string | null; createdAt: number }) => ({
            id: crypto.randomUUID(),
            clientId,
            type: a.type,
            content: a.content,
            metadata: JSON.stringify({ leadId, originalCreatedAt: a.createdAt, originalPerformedBy: a.performedBy }),
            createdAt: new Date(a.createdAt),
          })),
        );
      }
    }

    try {
      const { sendWelcomeEmail } = await import('../../lib/email.js');
      await sendWelcomeEmail(c.env, {
        to: data.contactEmail,
        clientName: data.contactName ?? data.companyName,
        companyName: data.companyName,
        tempPassword,
        portalUrl: getPortalLoginUrl(c.env),
      });
    } catch (e) {
      console.error(`[Welcome Email] [${traceId}] Failed:`, e);
    }

    return c.json({ clientId, userId, briefId }, 201);
  } catch (err) {
    console.error(`[Lead Won Webhook] [${traceId}] Error:`, err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

function buildNotes(data: {
  contactName?: string | null;
  sector?: string | null;
  subsector?: string | null;
  painPoint?: string | null;
  commercialAngle?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
}): string {
  const parts: string[] = [];
  if (data.notes) parts.push(`[Lead Notes]\n${data.notes}`);
  if (data.sector || data.subsector) parts.push(`Sector: ${data.sector ?? '?'} | Subsector: ${data.subsector ?? '?'}`);
  if (data.painPoint) parts.push(`Pain Point: ${data.painPoint}`);
  if (data.commercialAngle) parts.push(`Angle: ${data.commercialAngle}`);
  if (data.assignedTo) parts.push(`Cerrado por: ${data.assignedTo}`);
  return parts.join('\n\n');
}

function buildObjective(data: { painPoint?: string | null; commercialAngle?: string | null }): string {
  const parts: string[] = [];
  if (data.painPoint) parts.push(`Problema: ${data.painPoint}`);
  if (data.commercialAngle) parts.push(`Enfoque: ${data.commercialAngle}`);
  return parts.join(' | ') || '';
}

function generateTempPassword(companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${slug}-${digits}`;
}
