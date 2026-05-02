/**
 * Webhooks Internos del CRM
 *
 * Sistema de webhooks para notificaciones internas entre sistemas:
 * - AI Engine → CRM: job.started, job.completed, approval.pending
 * - Stripe → CRM: checkout.completed
 * - Web → CRM: brief.submitted, onboarding.completed
 */

import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import {
  buildJobOutputPrefix,
  resolveClientBrandFolder,
} from '../../../lib/client-storage.js';
import { enqueueQa } from '../../../lib/qa-queue.js';
import type { AppContext } from '../../../types/index.js';

async function notifyClient(db: any, clientId: string, userId: string | undefined, type: string, title: string, message: string, relatedJobId?: string) {
  try {
    await db.insert(schema.notifications).values({
      id: crypto.randomUUID(),
      userId: userId ?? 'system',
      type,
      title,
      message,
      read: 0,
      relatedJobId: relatedJobId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (e) {
    console.error('[Webhook] Failed to create notification:', e);
  }
}

async function logActivity(db: any, clientId: string, type: string, content: string, metadata?: Record<string, unknown>) {
  try {
    await db.insert(schema.clientActivities).values({
      id: crypto.randomUUID(),
      clientId,
      type,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: new Date(),
    });
  } catch (e) {
    console.error('[Webhook] Failed to log activity:', e);
  }
}

const orchestratorAssetSchema = z.object({
  id: z.string().optional(),
  run_id: z.string().optional(),
  type: z.string().optional(),
  asset_type: z.string().optional(),
  output_type: z.string().optional(),
  provider_url: z.string().optional(),
  url: z.string().optional(),
  r2_key: z.string().optional(),
  mime: z.string().optional(),
  mime_type: z.string().optional(),
  size: z.number().optional(),
  size_bytes: z.number().optional(),
  checksum: z.string().optional(),
  sku: z.string().optional(),
  delivery_url: z.string().nullable().optional(),
  download_url: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

type OrchestratorAsset = z.infer<typeof orchestratorAssetSchema>;

function normalizeAssetType(asset: OrchestratorAsset): 'image' | 'video' {
  const rawType = String(asset.type ?? asset.asset_type ?? asset.output_type ?? '').toLowerCase();
  return rawType.includes('video') ? 'video' : 'image';
}

function buildOrchestratorAssetMetadata(asset: OrchestratorAsset): string {
  return JSON.stringify({
    ...(asset.metadata ?? {}),
    orchestratorAssetId: asset.id ?? null,
    runId: asset.run_id ?? null,
    mime: asset.mime ?? asset.mime_type ?? null,
    checksum: asset.checksum ?? null,
    providerUrl: asset.provider_url ?? asset.url ?? null,
  });
}

function r2PublicUrl(publicOrigin: string | undefined, r2Key: string): string | null {
  if (!publicOrigin) return null;
  return `${publicOrigin.replace(/\/$/, '')}/${r2Key}`;
}

async function persistCompletedAssets(
  db: any,
  job: {
    id: string;
    clientId: string;
    client: {
      id: string;
      name: string;
      company: string | null;
      clientNumber: number | null;
      brandFolder: string | null;
      externalClientId: string | null;
    };
  },
  assets: OrchestratorAsset[] | undefined,
  publicOrigin?: string,
): Promise<string[]> {
  const newAssetIds: string[] = [];
  const brandFolder = resolveClientBrandFolder(job.client);
  const expectedPrefix = buildJobOutputPrefix(brandFolder, job.id);
  const missingR2KeyCount = (assets ?? []).filter((asset) => !asset.r2_key).length;
  if (missingR2KeyCount > 0) {
    throw new Error(`All orchestrator outputs must include r2_key. Missing on ${missingR2KeyCount} asset(s).`);
  }

  const invalidKeys = (assets ?? [])
    .map((asset) => asset.r2_key)
    .filter((r2Key): r2Key is string => !!r2Key)
    .filter((r2Key) => !r2Key.startsWith(expectedPrefix));

  if (invalidKeys.length > 0) {
    throw new Error(
      `Invalid orchestrator output R2 key. Expected prefix "${expectedPrefix}", got: ${invalidKeys.join(', ')}`,
    );
  }

  for (const asset of assets ?? []) {
    const r2Key = asset.r2_key;
    if (!r2Key) continue;

    const [existing] = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(and(eq(schema.assets.jobId, job.id), eq(schema.assets.r2Key, r2Key)))
      .limit(1);

    if (existing) continue;

    const [inserted] = await db
      .insert(schema.assets)
      .values({
        id: crypto.randomUUID(),
        jobId: job.id,
        clientId: job.clientId,
        label: asset.sku ?? asset.id ?? null,
        type: normalizeAssetType(asset),
        r2Key,
        fileSize: asset.size_bytes ?? asset.size ?? null,
        deliveryUrl: asset.delivery_url ?? asset.download_url ?? r2PublicUrl(publicOrigin, r2Key) ?? asset.provider_url ?? asset.url ?? null,
        status: 'approved',
        metadata: JSON.stringify({
          ...JSON.parse(buildOrchestratorAssetMetadata(asset)),
          bucket: 'BRANDS',
          source: 'orchestrator_output',
          brandFolder,
          expectedOutputPrefix: expectedPrefix,
          storageVersion: 'client_self_contained_v1',
        }),
        sku: asset.sku ?? null,
        category: 'output',
        clientVisible: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: schema.assets.id });

    if (inserted) newAssetIds.push(inserted.id);
  }

  return newAssetIds;
}

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

  // Length check — signatures are deterministic length, so this is safe
  if (signature.length !== signatureB64.length) return false;
  return signature === signatureB64;
}

export const webhookRoutes = new Hono<AppContext>();

// Webhook desde AI Engine — fail-closed: requires AI_ENGINE_WEBHOOK_SECRET + HMAC signature
webhookRoutes.post('/ai-engine', async (c) => {
  const secret = c.env.AI_ENGINE_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: 'AI Engine webhook secret not configured' }, 503);
  }
  const signature = c.req.header('x-webhook-signature');
  if (!signature) {
    return c.json({ error: 'Missing webhook signature' }, 401);
  }
  const timestamp = c.req.header('x-webhook-timestamp');
  if (timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    if (Math.abs(age) > 300000) {
      return c.json({ error: 'Webhook timestamp too old' }, 400);
    }
  }
  const rawBody = await c.req.text();
  const valid = await verifyWebhookSignature(rawBody, signature, secret);
  if (!valid) {
    return c.json({ error: 'Invalid webhook signature' }, 401);
  }
  const body: unknown = JSON.parse(rawBody);

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

  // Buscar job por external_job_id con clientId
  const [job] = await db
    .select({ id: schema.jobs.id, clientId: schema.jobs.clientId })
    .from(schema.jobs)
    .where(eq(schema.jobs.externalJobId, data.external_job_id))
    .limit(1);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Fetch client QA settings
  const [client] = await db
    .select({
      id: schema.clients.id,
      userId: schema.clients.userId,
      name: schema.clients.name,
      qaEnabled: schema.clients.qaEnabled,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, job.clientId))
    .limit(1);

  // Actualizar job según evento
  if (event === 'job.started') {
    await db
      .update(schema.jobs)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));

    // Notify client and log activity
    if (client?.userId) {
      await notifyClient(db, job.clientId, client.userId, 'job_started', 'Trabajo en producción', `Tu trabajo ha comenzado a procesarse.`, job.id);
    }
    await logActivity(db, job.clientId, 'job_started', 'Trabajo empezó a procesarse en el motor de producción.', { jobId: job.id, externalJobId: data.external_job_id });
  } else if (event === 'job.completed') {
    await db
      .update(schema.jobs)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));

    // Guardar outputs como assets
    const newAssetIds: string[] = [];
    if (data.outputs && data.outputs.length > 0) {
      for (const output of data.outputs) {
        // A3: Idempotency — skip if asset already exists for this job+url
        const [existing] = await db
          .select({ id: schema.assets.id })
          .from(schema.assets)
          .where(and(eq(schema.assets.jobId, job.id), eq(schema.assets.r2Key, output.url)))
          .limit(1);

        if (existing) {
          console.log(`[Webhook] Asset already exists for job ${job.id}, skipping: ${output.url}`);
          continue;
        }

        const [asset] = await db
          .insert(schema.assets)
          .values({
            jobId: job.id,
            clientId: job.clientId,
            r2Key: output.url,
            type: output.output_type,
            metadata: output.metadata ? JSON.stringify(output.metadata) : null,
            status: 'pending',
            deliveryUrl: output.url,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: schema.assets.id });

        if (asset) newAssetIds.push(asset.id);
      }
    }

    // Sprint 2: Enqueue QA for new assets if client has qa_enabled
    if (client?.qaEnabled && newAssetIds.length > 0) {
      for (const assetId of newAssetIds) {
        try {
          const result = await enqueueQa(db, {
            assetId,
            jobId: job.id,
            clientId: job.clientId,
          });
          console.log(`[Webhook] QA enqueued for asset ${assetId}: ${result.skipped ? 'skipped (exists)' : result.id}`);
        } catch (e) {
          console.error(`[Webhook] Failed to enqueue QA for asset ${assetId}:`, e);
        }
      }
    }

    // Notify client and log activity
    if (client?.userId) {
      await notifyClient(db, job.clientId, client.userId, 'job_completed', 'Trabajo completado', `Tu trabajo ha sido completado${newAssetIds.length > 0 ? ` con ${newAssetIds.length} asset${newAssetIds.length > 1 ? 's' : ''}` : ''}.`, job.id);
    }
    await logActivity(db, job.clientId, 'job_completed', `Trabajo completado${newAssetIds.length > 0 ? ` con ${newAssetIds.length} assets` : ''}.`, { jobId: job.id, assetCount: newAssetIds.length });
  } else if (event === 'job.failed') {
    await db
      .update(schema.jobs)
      .set({
        status: 'failed',
        updatedAt: new Date(),
        internalNotes: `Falló: ${data.status || 'Unknown error'}`,
      })
      .where(eq(schema.jobs.id, job.id));

    // Notify client and log activity
    if (client?.userId) {
      await notifyClient(db, job.clientId, client.userId, 'job_failed', 'Trabajo fallido', `Tu trabajo no se pudo completar. El equipo lo revisará.`, job.id);
    }
    await logActivity(db, job.clientId, 'job_failed', `Trabajo falló: ${data.status || 'Unknown error'}`, { jobId: job.id, error: data.status });
  }

  if (event === 'approval.pending') {
    // Notificar admin para QA
    // TODO: Enviar email/slack al account manager
    console.log(`[Webhook] Approval pending for job ${job.id}, approval_id: ${data.approval_id}`);
  }

  return c.json({ ok: true });
});

// Webhook desde sistema de facturación (pago confirmado) — fail-closed: requires INVOICE_WEBHOOK_SECRET + HMAC
webhookRoutes.post('/invoice/paid', async (c) => {
  const secret = c.env.INVOICE_WEBHOOK_SECRET;
  if (!secret) {
    return c.json({ error: 'Invoice webhook secret not configured' }, 503);
  }
  const signature = c.req.header('x-webhook-signature');
  if (!signature) {
    return c.json({ error: 'Missing webhook signature' }, 401);
  }
  const ts = c.req.header('x-webhook-timestamp');
  if (ts) {
    const age = Date.now() - new Date(ts).getTime();
    if (Math.abs(age) > 300000) {
      return c.json({ error: 'Webhook timestamp too old' }, 400);
    }
  }
  const rawBody = await c.req.text();
  const valid = await verifyWebhookSignature(rawBody, signature, secret);
  if (!valid) {
    return c.json({ error: 'Invalid webhook signature' }, 401);
  }
  const body: unknown = JSON.parse(rawBody);

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
          c.env.AI_ENGINE_WEBHOOK_URL ??
          (c.env.APP_ENV === 'production' ? undefined : 'http://localhost:4000/webhooks/job-created');

        if (!aiEngineUrl) {
          console.warn('AI_ENGINE_WEBHOOK_URL is not configured; skipping AI Engine notification');
          continue;
        }

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
  return c.json({
    error: 'Web brief intake is disabled',
    message:
      'Client records are now provisioned only after lead-won, and brief updates must come from an authenticated portal session.',
  }, 410);
});

// Webhook desde Web (onboarding completado)
webhookRoutes.post('/web/onboarding', requireAuth, async (c) => {
  const user = c.get('user');
  if (user.role !== 'client') {
    return c.json({ error: 'Client access only' }, 403);
  }

  const body: unknown = await c.req.json();

  const onboardingSchema = z.object({
    checklistCompleted: z.boolean(),
    sessionScheduled: z.boolean().optional(),
    sessionDate: z.string().optional(),
    readiness: z.object({
      materialsReady: z.boolean().optional(),
      brandReady: z.boolean().optional(),
      accessReady: z.boolean().optional(),
    }).optional(),
    priorityFocus: z.string().trim().max(200).optional(),
    openQuestions: z.string().trim().max(1200).optional(),
  });

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid onboarding payload' }, 400);
  }

  const db = c.get('db');
  const {
    checklistCompleted,
    sessionScheduled,
    sessionDate,
    readiness,
    priorityFocus,
    openQuestions,
  } = parsed.data;
  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Client record not found' }, 404);
  }

  const updates: Record<string, unknown> = {
    onboardingCompletedAt: checklistCompleted ? new Date() : null,
    updatedAt: new Date(),
  };

  if (sessionScheduled && sessionDate) {
    updates.firstSessionAt = new Date(sessionDate);
  }

  await db.update(schema.clients).set(updates).where(eq(schema.clients.id, client.id));

  const readinessSummary = [
    readiness?.materialsReady ? 'materiales listos' : 'materiales pendientes',
    readiness?.brandReady ? 'marca lista' : 'marca pendiente',
    readiness?.accessReady ? 'accesos listos' : 'accesos pendientes',
  ].join(' · ');

  const activityLines = [
    'Activacion confirmada desde portal.',
    readinessSummary,
    priorityFocus ? `Foco inicial: ${priorityFocus}` : null,
    openQuestions ? `Preguntas abiertas: ${openQuestions}` : null,
  ].filter(Boolean);

  await db.insert(schema.clientActivities).values({
    id: crypto.randomUUID(),
    clientId: client.id,
    type: 'activation.completed',
    content: activityLines.join('\n'),
    metadata: JSON.stringify({
      readiness: readiness ?? null,
      priorityFocus: priorityFocus ?? null,
      openQuestions: openQuestions ?? null,
      sessionDate: sessionScheduled ? sessionDate ?? null : null,
      source: 'portal_activation',
    }),
    createdAt: new Date(),
  });

  return c.json({ ok: true, clientId: client.id });
});

// Webhook desde Production Orchestrator — fail-closed: requires ORCHESTRATOR_ADMIN_KEY
webhookRoutes.post('/orchestrator', async (c) => {
  // Validate admin key — required in production
  const adminKey = c.req.header('x-admin-key');
  const expectedKey = c.env.ORCHESTRATOR_ADMIN_KEY;
  if (!expectedKey) {
    return c.json({ error: 'Orchestrator admin key not configured' }, 503);
    }
  if (!adminKey || adminKey !== expectedKey) {
    return c.json({ error: 'Unauthorized' }, 401);
    }

  const body: unknown = await c.req.json();

  const orchestratorSchema = z.object({
    event: z.string(),
    data: z.object({
      external_job_id: z.string().optional(),
      run_id: z.string().optional(),
      source: z.string().optional(),
      source_ref: z.string().optional(),
      brand_id: z.string().optional(),
      status: z.string().optional(),
      reason: z.string().optional(),
      assets: z.array(orchestratorAssetSchema).optional(),
      outputs: z.array(orchestratorAssetSchema).optional(),
    }),
    timestamp: z.string(),
  });

  const parsed = orchestratorSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid orchestrator webhook payload' }, 400);
  }

  const { event, data } = parsed.data;
  const db = c.get('db');

  // Find job by source_ref (CRM job ID) when source is 'crm'
  let job: { id: string; clientId: string } | undefined;
  if (data.source === 'crm' && data.source_ref) {
    const [found] = await db
      .select({ id: schema.jobs.id, clientId: schema.jobs.clientId })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, data.source_ref))
      .limit(1);
    job = found;
  }

  // Fallback: find by externalJobId
  if (!job && data.external_job_id) {
    const [found] = await db
      .select({ id: schema.jobs.id, clientId: schema.jobs.clientId })
      .from(schema.jobs)
      .where(eq(schema.jobs.externalJobId, data.external_job_id))
      .limit(1);
    job = found;
  }

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // Fetch client for notifications
  const [client] = await db
    .select({
      id: schema.clients.id,
      userId: schema.clients.userId,
      name: schema.clients.name,
      company: schema.clients.company,
      clientNumber: schema.clients.clientNumber,
      brandFolder: schema.clients.brandFolder,
      externalClientId: schema.clients.externalClientId,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, job.clientId))
    .limit(1);

  // Map orchestrator events to CRM status updates
  if (event === 'job.completed') {
    const completedAssets = data.assets ?? data.outputs ?? [];
    if (!client) return c.json({ error: 'Client not found' }, 404);
    let newAssetIds: string[] = [];
    try {
      newAssetIds = await persistCompletedAssets(
        db,
        { ...job, client },
        completedAssets,
        c.env.R2_PUBLIC_URL,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: 'Invalid orchestrator output storage path', details: message }, 400);
    }
    const firstDeliveryUrl = completedAssets.find((asset) =>
      asset.delivery_url ?? asset.download_url ?? asset.provider_url ?? asset.url
    );

    await db
      .update(schema.jobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        deliveryUrl: firstDeliveryUrl
          ? firstDeliveryUrl.delivery_url ?? firstDeliveryUrl.download_url ?? firstDeliveryUrl.provider_url ?? firstDeliveryUrl.url ?? null
          : undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, job.id));

    if (client?.userId) {
      await notifyClient(db, job.clientId, client.userId, 'job_completed', 'Trabajo completado', `Tu trabajo ha sido completado por el equipo de producción${newAssetIds.length > 0 ? ` con ${newAssetIds.length} assets` : ''}.`, job.id);
    }
    await logActivity(db, job.clientId, 'job_completed', `Trabajo completado por el orchestrator${newAssetIds.length > 0 ? ` con ${newAssetIds.length} assets` : ''}.`, { jobId: job.id, externalJobId: data.external_job_id, runId: data.run_id, status: data.status, assetCount: newAssetIds.length });
  } else if (event === 'job.failed') {
    await db
      .update(schema.jobs)
      .set({
        status: 'failed',
        failedAt: new Date(),
        failureReason: data.reason || data.status || 'Unknown error',
        updatedAt: new Date(),
        internalNotes: `Falló en orchestrator: ${data.reason || data.status || 'Unknown error'}`,
      })
      .where(eq(schema.jobs.id, job.id));

    if (client?.userId) {
      await notifyClient(db, job.clientId, client.userId, 'job_failed', 'Trabajo fallido', 'Tu trabajo no se pudo completar en producción. El equipo lo revisará.', job.id);
    }
    await logActivity(db, job.clientId, 'job_failed', `Trabajo fallido en orchestrator: ${data.reason || data.status || 'Unknown error'}`, { jobId: job.id, error: data.reason, runId: data.run_id, status: data.status });
  } else if (event === 'lead_forwarded') {
    // Lead forwarded to production — log activity, no job status change
    await logActivity(db, job.clientId, 'lead_forwarded', 'Lead derivado a producción desde el orchestrator.', { jobId: job.id, brandId: data.brand_id, runId: data.run_id });
  } else {
    // Generic status update — map orchestrator status to CRM status if possible
    const statusMap: Record<string, string> = {
      generated: 'completed',
      failed: 'failed',
      running: 'processing',
      awaiting_approval: 'processing',
      planned: 'processing',
      queued: 'processing',
      received: 'pending',
    };
    const mappedStatus = data.status ? statusMap[data.status] : undefined;
    if (mappedStatus) {
      await db
        .update(schema.jobs)
        .set({ status: mappedStatus as any, updatedAt: new Date() })
        .where(eq(schema.jobs.id, job.id));
    }

    await logActivity(db, job.clientId, 'orchestrator_event', `Evento de orchestrator: ${event}`, { jobId: job.id, event, status: data.status, reason: data.reason, runId: data.run_id });
  }

  return c.json({ ok: true });
});

// Admin: listar webhooks recibidos
webhookRoutes.get('/received', requireAuth, async (c) => {
  // TODO: Implementar tabla de webhook_logs si es necesario
  return c.json({ logs: [] });
});
