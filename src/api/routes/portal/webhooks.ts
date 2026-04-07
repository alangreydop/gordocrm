/**
 * Webhooks Internos del CRM
 *
 * Sistema de webhooks para notificaciones internas entre sistemas:
 * - AI Engine → CRM: job.started, job.completed, approval.pending
 * - Stripe → CRM: checkout.completed
 * - Web → CRM: brief.submitted, onboarding.completed
 */

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import type { AppContext } from '../../../types/index.js';

const webhookSignatureSchema = z.object({
  signature: z.string(),
  timestamp: z.number(),
});

// Verificar firma HMAC de webhooks entrantes
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', keyData, encoder.encode(payload));

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  // Comparar signatures en tiempo constante
  const expected = signatureB64;
  return signature === expected;
}

export const webhookRoutes = new Hono<AppContext>();

// Webhook desde AI Engine
webhookRoutes.post('/ai-engine', async (c) => {
  const body: unknown = await c.req.json();

  const webhookSchema = z.object({
    event: z.enum([
      'job.started',
      'job.completed',
      'job.failed',
      'approval.pending',
      'approval.approved',
    ]),
    data: z.object({
      external_job_id: z.string(),
      pipeline_id: z.string().optional(),
      status: z.string().optional(),
      delivery_url: z.string().optional(),
      outputs: z
        .array(
          z.object({
            node_id: z.string(),
            output_type: z.string(),
            url: z.string(),
            metadata: z.record(z.unknown()).optional(),
          }),
        )
        .optional(),
      approval_id: z.string().optional(),
      decision: z.enum(['approved', 'rejected', 'pending']).optional(),
    }),
    timestamp: z.string(),
  });

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid webhook payload' }, 400);
  }

  const { event, data } = parsed.data;
  const db = c.get('db');

  // Buscar job por external_job_id
  const [job] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.externalJobId, data.external_job_id))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Actualizar job según evento
  if (event === 'job.started') {
    await db
      .update(schema.jobs)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));
  }

  if (event === 'job.completed') {
    await db
      .update(schema.jobs)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));

    // Guardar outputs como assets
    if (data.outputs && data.outputs.length > 0) {
      for (const output of data.outputs) {
        await db.insert(schema.assets).values({
          jobId: job.id,
          r2Key: output.url,
          type: output.output_type,
          metadata: output.metadata ? JSON.stringify(output.metadata) : null,
          status: 'approved',
          deliveryUrl: output.url,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  if (event === 'job.failed') {
    await db
      .update(schema.jobs)
      .set({
        status: 'failed',
        updatedAt: new Date(),
        internalNotes: `Falló: ${data.status || 'Unknown error'}`,
      })
      .where(eq(schema.jobs.id, job.id));
  }

  if (event === 'approval.pending') {
    // Notificar admin para QA
    // TODO: Enviar email/slack al account manager
    console.log(`[Webhook] Approval pending for job ${job.id}, approval_id: ${data.approval_id}`);
  }

  return c.json({ ok: true });
});

// Webhook desde sistema de facturación (pago confirmado)
webhookRoutes.post('/invoice/paid', async (c) => {
  const body: unknown = await c.req.json();

  const invoicePaidSchema = z.object({
    invoiceId: z.string(),
    paymentMethod: z.enum(['bank_transfer', 'manual']),
    paidAt: z.string(),
  });

  const parsed = invoicePaidSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid invoice paid payload' }, 400);
  }

  const { invoiceId, paymentMethod, paidAt } = parsed.data;
  const db = c.get('db');

  try {
    // Actualizar factura a pagada
    await db
      .update(schema.invoices)
      .set({
        status: 'paid',
        paidAt: new Date(paidAt),
        paymentMethod,
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, invoiceId));

    // Obtener factura para crear jobs
    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .limit(1);

    if (invoice && invoice.relatedJobIds) {
      const jobIds = JSON.parse(invoice.relatedJobIds) as string[];

      // Trigger automático de producción para cada job
      for (const jobId of jobIds) {
        await db
          .update(schema.jobs)
          .set({
            status: 'pending',
            updatedAt: new Date(),
            internalNotes: `Producción iniciada - Factura ${invoice.invoiceNumber} pagada`,
          })
          .where(eq(schema.jobs.id, jobId));

        // Notificar AI Engine
        const aiEngineUrl =
          c.env.AI_ENGINE_WEBHOOK_URL || 'http://localhost:4000/webhooks/job-created';

        try {
          await fetch(aiEngineUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'job.created',
              data: {
                job_id: jobId,
                client_id: invoice.clientId,
                invoice_id: invoiceId,
              },
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (e) {
          console.error('[Webhook] Failed to notify AI Engine:', e);
        }
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('[Webhook] Error processing invoice paid:', error);
    return c.json({ error: 'Failed to process invoice paid' }, 500);
  }
});

// Webhook desde Web (brief submit)
webhookRoutes.post('/web/brief', async (c) => {
  const body: unknown = await c.req.json();

  const briefSchema = z.object({
    email: z.string().email(),
    tipo: z.string(),
    description: z.string(),
    company: z.string().optional(),
    name: z.string().optional(),
  });

  const parsed = briefSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid brief payload' }, 400);
  }

  const db = c.get('db');
  const { email, tipo, description, company, name } = parsed.data;

  // Buscar o crear cliente por email
  const [existingClient] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.email, email))
    .limit(1);

  let clientId = existingClient?.id;

  if (!clientId) {
    const [newClient] = await db
      .insert(schema.clients)
      .values({
        email,
        name: name || 'Cliente',
        company: company || undefined,
        subscriptionStatus: 'inactive',
        plan: undefined,
        monthlyUnitCapacity: 0,
        segment: 'lead',
        marginProfile: 'unknown',
        datasetStatus: 'pending_capture',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: schema.clients.id });

    if (newClient) {
      clientId = newClient.id;
    } else {
      return c.json({ error: 'Failed to create client' }, 500);
    }
  }

  // Crear brief submission (schema usa briefSubmissions con contentType)
  await db.insert(schema.briefSubmissions).values({
    clientId,
    email,
    contentType: tipo, // 'foto', 'video', 'ambos'
    description,
    status: 'new',
    source: 'web_form',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return c.json({ ok: true, clientId });
});

// Webhook desde Web (onboarding completado)
webhookRoutes.post('/web/onboarding', async (c) => {
  const body: unknown = await c.req.json();

  const onboardingSchema = z.object({
    clientId: z.string(),
    checklistCompleted: z.boolean(),
    sessionScheduled: z.boolean().optional(),
    sessionDate: z.string().optional(),
  });

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid onboarding payload' }, 400);
  }

  const db = c.get('db');
  const { clientId, checklistCompleted, sessionScheduled, sessionDate } = parsed.data;

  const updates: Record<string, unknown> = {
    onboardingCompletedAt: checklistCompleted ? new Date() : null,
    updatedAt: new Date(),
  };

  if (sessionScheduled && sessionDate) {
    updates.firstSessionAt = new Date(sessionDate);
  }

  await db.update(schema.clients).set(updates).where(eq(schema.clients.id, clientId));

  return c.json({ ok: true });
});

// Admin: listar webhooks recibidos
webhookRoutes.get('/received', requireAuth, async (c) => {
  // TODO: Implementar tabla de webhook_logs si es necesario
  return c.json({ logs: [] });
});
