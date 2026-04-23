/**
 * Facturas - Portal Cliente API Routes
 *
 * - Listar facturas del cliente
 * - Ver detalle de factura
 * - Descargar PDF
 * - Marcar como pagada (con subida de justificante)
 */

import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAuth } from '../../../lib/auth.js';
import { bytesToBase64, generateInvoicePdfBytes, invoicePdfFilename } from '../../../lib/invoice-pdf.js';
import type { AppContext } from '../../../types/index.js';

export const invoiceRoutes = new Hono<AppContext>();

invoiceRoutes.use('*', requireAuth);

// DESCARGAR PDF de factura del cliente
invoiceRoutes.get('/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');

  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Cliente no encontrado' }, 404);
  }

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.clientId, client.id)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  const items = await db
    .select()
    .from(schema.invoiceItems)
    .where(eq(schema.invoiceItems.invoiceId, id))
    .orderBy(schema.invoiceItems.sortOrder);

  const pdfBytes = await generateInvoicePdfBytes(invoice, items);
  const filename = invoicePdfFilename(invoice.invoiceNumber);

  if (c.req.query('download') === '1') {
    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return c.json({
    pdf: bytesToBase64(pdfBytes),
    mimeType: 'application/pdf',
    invoiceNumber: invoice.invoiceNumber,
    filename,
    generatedAt: new Date().toISOString(),
  });
});

// LISTAR facturas del cliente
invoiceRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  // Buscar cliente asociado al usuario
  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Cliente no encontrado' }, 404);
  }

  const invoices = await db
    .select({
      id: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
      series: schema.invoices.series,
      fiscalYear: schema.invoices.fiscalYear,
      issueDate: schema.invoices.issueDate,
      dueDate: schema.invoices.dueDate,
      paidAt: schema.invoices.paidAt,
      subtotalCents: schema.invoices.subtotalCents,
      taxAmountCents: schema.invoices.taxAmountCents,
      irpfAmountCents: schema.invoices.irpfAmountCents,
      totalCents: schema.invoices.totalCents,
      status: schema.invoices.status,
      paymentMethod: schema.invoices.paymentMethod,
      paymentNotes: schema.invoices.paymentNotes,
      description: schema.invoices.description,
      createdAt: schema.invoices.createdAt,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.clientId, client.id))
    .orderBy(desc(schema.invoices.createdAt));

  return c.json({ invoices });
});

// OBTENER detalle de factura
invoiceRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');

  // Buscar cliente asociado
  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Cliente no encontrado' }, 404);
  }

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.clientId, client.id)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  // Obtener líneas
  const items = await db
    .select()
    .from(schema.invoiceItems)
    .where(eq(schema.invoiceItems.invoiceId, id))
    .orderBy(schema.invoiceItems.sortOrder);

  return c.json({ invoice, items });
});

// SUBIR justificante de pago
invoiceRoutes.post('/:id/payment-proof', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');

  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.userId, user.id))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Cliente no encontrado' }, 404);
  }

  const [invoice] = await db
    .select({ status: schema.invoices.status })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.clientId, client.id)))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  if (invoice.status === 'paid') {
    return c.json({ error: 'Esta factura ya está pagada' }, 400);
  }

  const body: unknown = await c.req.json();
  const proofSchema = z.object({
    paymentDate: z.string().optional(),
    notes: z.string().nullable().optional(),
    proofUrl: z.string().url().nullable().optional(), // URL del justificante en R2
  });

  const parsed = proofSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Datos inválidos', details: parsed.error.issues }, 400);
  }

  // Actualizar factura con nota de pago pendiente de verificación
  await db
    .update(schema.invoices)
    .set({
      paymentNotes: parsed.data.notes || 'Justificante subido - pendiente de verificación',
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, id));

  // Registrar en logs
  await db.insert(schema.invoiceLogs).values({
    id: crypto.randomUUID(),
    invoiceId: id,
    action: 'payment_proof_uploaded',
    userId: user.id,
    details: JSON.stringify({
      paymentDate: parsed.data.paymentDate,
      proofUrl: parsed.data.proofUrl,
    }),
    createdAt: new Date(),
  });

  // Notificar al admin (opcional)
  // TODO: Enviar email al admin

  return c.json({ ok: true, message: 'Justificante enviado. Verificaremos el pago pronto.' });
});
