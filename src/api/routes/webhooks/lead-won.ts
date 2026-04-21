import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { clients, users, briefSubmissions, clientActivities } from '../../../../db/schema';
import { verifyWebhookSignature } from '../../../lib/webhook-signature';
import { createUser } from '../../../lib/auth';
import type { AppContext } from '../../../types';

export const leadWonWebhook = new Hono<AppContext>();

leadWonWebhook.post('/lead-won', async (c) => {
  const signature = c.req.header('X-Webhook-Signature');
  const timestamp = c.req.header('X-Webhook-Timestamp');
  const secret = c.env.LEAD_TRANSFER_SECRET;

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
  const data = body.data;
  const leadId = body.leadId;

  try {
    // Upsert logic
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

    if (existingByExternal) {
      clientId = existingByExternal.id;
      await db.update(clients).set({
        name: data.companyName,
        email: data.contactEmail,
        phone: data.contactPhone,
        region: data.region,
        addressLine1: data.address,
        leadTier: data.tier,
        leadSource: data.source,
        websiteUrl: data.websiteUrl,
        notes: buildNotes(data),
        updatedAt: new Date(),
      }).where(eq(clients.id, clientId));
    } else if (existingByEmail) {
      clientId = existingByEmail.id;
      await db.update(clients).set({
        name: data.companyName,
        phone: data.contactPhone,
        region: data.region,
        addressLine1: data.address,
        leadTier: data.tier,
        leadSource: data.source,
        websiteUrl: data.websiteUrl,
        externalClientId: leadId,
        notes: buildNotes(data),
        updatedAt: new Date(),
      }).where(eq(clients.id, clientId));
    } else {
      const newClient = {
        id: crypto.randomUUID(),
        name: data.companyName,
        email: data.contactEmail,
        phone: data.contactPhone,
        region: data.region,
        addressLine1: data.address,
        country: 'ES',
        taxIdType: 'NIF',
        leadTier: data.tier,
        leadSource: data.source,
        websiteUrl: data.websiteUrl,
        externalClientId: leadId,
        notes: buildNotes(data),
        datasetStatus: 'pending_capture',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(clients).values(newClient);
      clientId = newClient.id;
    }

    // Create portal user
    const tempPassword = generateTempPassword(data.companyName);
    const userResult = await createUser(db, {
      email: data.contactEmail,
      password: tempPassword,
      name: data.contactName ?? data.companyName,
      role: 'client',
    });

    if (!userResult.success || !userResult.userId) {
      return c.json({ error: 'Failed to create portal user' }, 500);
    }

    await db.update(clients)
      .set({ userId: userResult.userId })
      .where(eq(clients.id, clientId));

    // Seed brief
    const briefId = crypto.randomUUID();
    await db.insert(briefSubmissions).values({
      id: briefId,
      clientId,
      description: data.briefDescription ?? `Brief inicial para ${data.companyName}`,
      objective: buildObjective(data),
      audience: data.sector ? `${data.sector}${data.subsector ? ` / ${data.subsector}` : ''}` : null,
      style: data.uspVerified,
      cta: data.recommendedPlan,
      contentType: data.productionType,
      sourcePage: data.websiteUrl,
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Migrate activities in batches
    const batchSize = 50;
    for (let i = 0; i < data.activities.length; i += batchSize) {
      const batch = data.activities.slice(i, i + batchSize);
      await db.insert(clientActivities).values(
        batch.map((a: { type: string; content: string | null; performedBy: string | null; createdAt: number }) => ({
          id: crypto.randomUUID(),
          clientId,
          type: a.type,
          content: a.content,
          metadata: JSON.stringify({ leadId, originalCreatedAt: a.createdAt, originalPerformedBy: a.performedBy }),
          createdAt: new Date(a.createdAt),
        })),
      );
    }

    // Send welcome email (async, non-blocking)
    c.executionCtx?.waitUntil(
      (async () => {
        try {
          const { sendWelcomeEmail } = await import('../../../lib/email.js');
          await sendWelcomeEmail(c.env, {
            to: data.contactEmail,
            clientName: data.contactName ?? data.companyName,
            companyName: data.companyName,
            tempPassword,
            portalUrl: 'https://grandeandgordo.com/portal',
          });
        } catch (e) {
          console.error('[Welcome Email] Failed:', e);
        }
      })(),
    );

    return c.json({ clientId, userId: userResult.userId, briefId }, 201);
  } catch (err) {
    console.error('[Lead Won Webhook] Error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

function buildNotes(data: { contactName: string | null; sector: string | null; subsector: string | null; painPoint: string | null; commercialAngle: string | null; assignedTo: string | null; notes: string | null }): string {
  const parts: string[] = [];
  if (data.notes) parts.push(`[Lead Notes]\n${data.notes}`);
  if (data.sector || data.subsector) parts.push(`Sector: ${data.sector ?? '?'} | Subsector: ${data.subsector ?? '?'}`);
  if (data.painPoint) parts.push(`Pain Point: ${data.painPoint}`);
  if (data.commercialAngle) parts.push(`Angle: ${data.commercialAngle}`);
  if (data.assignedTo) parts.push(`Cerrado por: ${data.assignedTo}`);
  return parts.join('\n\n');
}

function buildObjective(data: { painPoint: string | null; commercialAngle: string | null }): string {
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
