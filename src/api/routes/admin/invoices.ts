/**
 * Sistema de Facturación - API Routes
 *
 * Gestión de facturas para administración:
 * - CRUD completo de facturas
 * - Generación de número de factura automático
 * - Cálculo de importes (subtotal, IVA, IRPF, total)
 * - Envío de facturas por email
 * - Auditoría de cambios (invoice_logs)
 */

import { and, desc, eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema, type Database } from '../../../../db/index.js';
import { requireAdmin } from '../../../lib/auth.js';
import { sendEmail } from '../../../lib/email.js';
import type { AppContext } from '../../../types/index.js';

// ============================================
// Schemas
// ============================================

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().positive().default(1),
  unitPriceCents: z.number().int().min(0),
  jobId: z.string().optional(),
});

const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  dueDate: z.string().datetime().optional(),
  description: z.string().trim().optional(),
  items: z.array(invoiceItemSchema).min(1),
  paymentMethod: z.string().optional(),
  paymentNotes: z.string().optional(),
  notes: z.string().optional(),
  relatedJobIds: z.array(z.string()).optional(),
});

const updateInvoiceSchema = z.object({
  status: z.enum(['draft', 'issued', 'sent', 'paid', 'cancelled', 'overdue']).optional(),
  description: z.string().trim().optional(),
  paymentMethod: z.string().optional(),
  paymentNotes: z.string().optional(),
  notes: z.string().optional(),
  footer: z.string().optional(),
});

const addItemsSchema = z.object({
  items: z.array(invoiceItemSchema).min(1),
});

// ============================================
// Helpers
// ============================================

/**
 * Genera número de factura único: F2026-001, F2026-002, etc.
 */
async function generateInvoiceNumber(db: Database, year: number): Promise<string> {
  const prefix = 'F';

  // Buscar última factura del año
  const [lastInvoice] = await db
    .select({ invoiceNumber: schema.invoices.invoiceNumber })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.fiscalYear, year),
        gt(schema.invoices.invoiceNumber, `${prefix}${year}-`),
      ),
    )
    .orderBy(desc(schema.invoices.invoiceNumber))
    .limit(1);

  if (!lastInvoice) {
    return `${prefix}${year}-001`;
  }

  // Extraer número y incrementar
  const parts = lastInvoice.invoiceNumber.split('-');
  const lastNumber = parseInt(parts[1] ?? '0', 10);
  const newNumber = String(lastNumber + 1).padStart(3, '0');

  return `${prefix}${year}-${newNumber}`;
}

/**
 * Calcula importes de una línea de factura
 */
function calculateItemAmounts(
  quantity: number,
  unitPriceCents: number,
  taxRate: number,
  irpfRate?: number | null,
): { subtotalCents: number; taxAmountCents: number; irpfAmountCents: number; totalCents: number } {
  const subtotalCents = Math.round(quantity * unitPriceCents);
  const taxAmountCents = Math.round(subtotalCents * taxRate);
  const irpfAmountCents = irpfRate ? Math.round(subtotalCents * irpfRate) : 0;
  const totalCents = subtotalCents + taxAmountCents - irpfAmountCents;

  return { subtotalCents, taxAmountCents, irpfAmountCents, totalCents };
}

/**
 * Calcula totales de una factura
 */
function calculateInvoiceTotals(
  items: Array<{
    subtotalCents: number;
    taxAmountCents: number;
    irpfAmountCents: number | null;
    totalCents: number;
  }>,
): { subtotalCents: number; taxAmountCents: number; irpfAmountCents: number; totalCents: number } {
  return items.reduce<{ subtotalCents: number; taxAmountCents: number; irpfAmountCents: number; totalCents: number }>(
    (acc, item) => ({
      subtotalCents: acc.subtotalCents + item.subtotalCents,
      taxAmountCents: acc.taxAmountCents + item.taxAmountCents,
      irpfAmountCents: acc.irpfAmountCents + (item.irpfAmountCents ?? 0),
      totalCents: acc.totalCents + item.totalCents,
    }),
    { subtotalCents: 0, taxAmountCents: 0, irpfAmountCents: 0, totalCents: 0 },
  );
}

/**
 * Obtiene datos fiscales del emisor desde config
 */
async function getIssuerData(db: Database): Promise<{
  taxId: string;
  legalName: string;
  addressLine1: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  phone?: string;
  registrationNumber?: string;
  footer?: string;
}> {
  const configRows = await db
    .select({ key: schema.config.key, value: schema.config.value })
    .from(schema.config)
    .where(gt(schema.config.key, 'issuer_'));

  const configMap = Object.fromEntries(configRows.map((r: { key: string; value: string }) => [r.key, r.value]));

  const result: {
    taxId: string;
    legalName: string;
    addressLine1: string;
    city: string;
    postalCode: string;
    country: string;
    email: string;
    phone?: string;
    registrationNumber?: string;
    footer?: string;
  } = {
    taxId: configMap['issuer_tax_id'] || 'B00000000',
    legalName: configMap['issuer_legal_name'] || 'Grande & Gordo S.L.',
    addressLine1: configMap['issuer_address_line1'] || 'Calle Ejemplo, 123',
    city: configMap['issuer_city'] || 'A Coruña',
    postalCode: configMap['issuer_postal_code'] || '15001',
    country: configMap['issuer_country'] || 'ES',
    email: configMap['issuer_email'] || 'facturacion@grandeandgordo.com',
  };

  if (configMap['issuer_phone']) result.phone = configMap['issuer_phone'];
  if (configMap['issuer_registration_number']) result.registrationNumber = configMap['issuer_registration_number'];
  if (configMap['invoice_footer']) result.footer = configMap['invoice_footer'];

  return result;
}

/**
 * Registra un log de auditoría
 */
async function logInvoiceAction(
  db: Database,
  invoiceId: string,
  action: string,
  userId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.invoiceLogs).values({
    id: crypto.randomUUID(),
    invoiceId,
    action,
    userId: userId || null,
    details: details ? JSON.stringify(details) : null,
    createdAt: new Date(),
  });
}

// ============================================
// Routes
// ============================================

export const invoiceRoutes = new Hono<AppContext>();

invoiceRoutes.use('*', requireAdmin);

// LISTAR facturas
invoiceRoutes.get('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  const rows = await db
    .select({
      id: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
      series: schema.invoices.series,
      fiscalYear: schema.invoices.fiscalYear,
      clientId: schema.invoices.clientId,
      clientLegalName: schema.invoices.clientLegalName,
      clientTaxId: schema.invoices.clientTaxId,
      issueDate: schema.invoices.issueDate,
      dueDate: schema.invoices.dueDate,
      paidAt: schema.invoices.paidAt,
      subtotalCents: schema.invoices.subtotalCents,
      taxAmountCents: schema.invoices.taxAmountCents,
      irpfAmountCents: schema.invoices.irpfAmountCents,
      totalCents: schema.invoices.totalCents,
      status: schema.invoices.status,
      paymentMethod: schema.invoices.paymentMethod,
      isRectificative: schema.invoices.isRectificative,
      createdAt: schema.invoices.createdAt,
      updatedAt: schema.invoices.updatedAt,
    })
    .from(schema.invoices)
    .orderBy(desc(schema.invoices.createdAt));

  return c.json({ invoices: rows });
});

// OBTERNER detalle de factura
invoiceRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
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

  // Obtener logs
  const logs = await db
    .select()
    .from(schema.invoiceLogs)
    .where(eq(schema.invoiceLogs.invoiceId, id))
    .orderBy(desc(schema.invoiceLogs.createdAt));

  return c.json({ invoice, items, logs });
});

// CREAR factura
invoiceRoutes.post('/', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const payload: unknown = await c.req.json();
  const body = createInvoiceSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Datos inválidos', details: body.error.issues }, 400);
  }

  const {
    clientId,
    items,
    dueDate,
    description,
    paymentMethod,
    paymentNotes,
    notes,
    relatedJobIds,
  } = body.data;

  // Obtener datos del cliente
  const [client] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .limit(1);

  if (!client) {
    return c.json({ error: 'Cliente no encontrado' }, 404);
  }

  // Validar datos fiscales del cliente
  const missingFields: string[] = [];
  if (!client.taxId) missingFields.push('taxId (CIF/NIF)');
  if (!client.legalName) missingFields.push('legalName (Razón social)');
  if (!client.addressLine1) missingFields.push('addressLine1 (Dirección)');
  if (!client.city) missingFields.push('city (Ciudad)');
  if (!client.postalCode) missingFields.push('postalCode (Código postal)');

  if (missingFields.length > 0) {
    return c.json(
      {
        error: `El cliente no tiene completos los datos fiscales: ${missingFields.join(', ')}`,
        hint: 'Actualiza la ficha del cliente antes de crear la factura',
      },
      400,
    );
  }

  // Obtener datos del emisor
  const issuer = await getIssuerData(db);

  // Generar número de factura
  const currentYear = new Date().getFullYear();
  const invoiceNumber = await generateInvoiceNumber(db, currentYear);

  // Calcular importes de las líneas
  const itemRows = items.map((item, index) => {
    const amounts = calculateItemAmounts(item.quantity, item.unitPriceCents, 0.21);
    return {
      id: crypto.randomUUID(),
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      subtotalCents: amounts.subtotalCents,
      taxRate: 0.21,
      taxAmountCents: amounts.taxAmountCents,
      irpfRate: null,
      irpfAmountCents: 0,
      totalCents: amounts.totalCents,
      sortOrder: index,
      jobId: item.jobId || null,
      metadata: null,
      createdAt: new Date(),
    };
  });

  // Calcular totales
  const totals = calculateInvoiceTotals(itemRows);

  // Fechas
  const now = new Date();
  const due = dueDate ? new Date(dueDate) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días por defecto

  // Crear factura
  const invoiceId = crypto.randomUUID();

  await db.insert(schema.invoices).values({
    id: invoiceId,
    invoiceNumber,
    series: 'F',
    fiscalYear: currentYear,
    clientId,
    clientTaxId: client.taxId!,
    clientLegalName: client.legalName!,
    clientAddressLine1: client.addressLine1!,
    clientAddressLine2: client.addressLine2 || null,
    clientCity: client.city!,
    clientRegion: client.region || null,
    clientPostalCode: client.postalCode!,
    clientCountry: client.country || 'ES',
    clientEmail: client.email,
    issuerTaxId: issuer.taxId,
    issuerLegalName: issuer.legalName,
    issuerAddressLine1: issuer.addressLine1,
    issuerCity: issuer.city,
    issuerPostalCode: issuer.postalCode,
    issuerCountry: issuer.country,
    issuerEmail: issuer.email,
    issueDate: now,
    dueDate: due,
    paidAt: null,
    description: description || null,
    subtotalCents: totals.subtotalCents,
    taxRate: 0.21,
    taxAmountCents: totals.taxAmountCents,
    irpfRate: null,
    irpfAmountCents: null,
    totalCents: totals.totalCents,
    status: 'draft',
    paymentMethod: paymentMethod || null,
    paymentNotes: paymentNotes || null,
    notes: notes || null,
    isRectificative: false,
    relatedJobIds: relatedJobIds ? JSON.stringify(relatedJobIds) : null,
    createdAt: now,
    updatedAt: now,
  });

  // Insertar líneas
  for (const item of itemRows) {
    await db.insert(schema.invoiceItems).values({
      ...item,
      invoiceId,
    });
  }

  // Log de auditoría
  await logInvoiceAction(db, invoiceId, 'created', user.id, { invoiceNumber });

  const [createdInvoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);

  return c.json({ invoice: createdInvoice, items: itemRows }, 201);
});

// AÑADIR líneas a factura (solo borrador)
invoiceRoutes.post('/:id/items', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');
  const payload: unknown = await c.req.json();
  const body = addItemsSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Datos inválidos', details: body.error.issues }, 400);
  }

  // Verificar que la factura existe y está en borrador
  const [invoice] = await db
    .select({ status: schema.invoices.status })
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  if (invoice.status !== 'draft') {
    return c.json({ error: 'Solo se pueden añadir líneas a facturas en borrador' }, 400);
  }

  // Obtener líneas existentes
  const existingItems = await db
    .select()
    .from(schema.invoiceItems)
    .where(eq(schema.invoiceItems.invoiceId, id));

  const maxSortOrder =
    existingItems.length > 0 ? Math.max(...existingItems.map((i) => i.sortOrder)) : -1;

  // Añadir nuevas líneas
  const newItems = body.data.items.map((item, index) => {
    const amounts = calculateItemAmounts(item.quantity, item.unitPriceCents, 0.21);
    return {
      id: crypto.randomUUID(),
      invoiceId: id,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      subtotalCents: amounts.subtotalCents,
      taxRate: 0.21,
      taxAmountCents: amounts.taxAmountCents,
      irpfRate: null,
      irpfAmountCents: 0,
      totalCents: amounts.totalCents,
      sortOrder: maxSortOrder + 1 + index,
      jobId: item.jobId || null,
      metadata: null,
      createdAt: new Date(),
    };
  });

  for (const item of newItems) {
    await db.insert(schema.invoiceItems).values(item);
  }

  // Recalcular totales de la factura
  const allItems = [...existingItems, ...newItems];
  const totals = calculateInvoiceTotals(allItems);

  await db
    .update(schema.invoices)
    .set({
      subtotalCents: totals.subtotalCents,
      taxAmountCents: totals.taxAmountCents,
      irpfAmountCents: totals.irpfAmountCents || null,
      totalCents: totals.totalCents,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, id));

  await logInvoiceAction(db, id, 'modified', user.id, {
    action: 'added_items',
    count: newItems.length,
  });

  const [updatedInvoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  return c.json({ invoice: updatedInvoice, items: newItems });
});

// EMITIR factura (cambiar de draft a issued)
invoiceRoutes.post('/:id/issue', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  if (invoice.status !== 'draft') {
    return c.json({ error: 'Solo se pueden emitir facturas en borrador' }, 400);
  }

  // Verificar que tiene al menos una línea
  const [firstItem] = await db
    .select({ id: schema.invoiceItems.id })
    .from(schema.invoiceItems)
    .where(eq(schema.invoiceItems.invoiceId, id))
    .limit(1);

  if (!firstItem) {
    return c.json({ error: 'La factura debe tener al menos una línea' }, 400);
  }

  await db
    .update(schema.invoices)
    .set({
      status: 'issued',
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, id));

  await logInvoiceAction(db, id, 'issued', user.id);

  const [updatedInvoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  return c.json({ invoice: updatedInvoice });
});

// ENVIAR factura por email
invoiceRoutes.post('/:id/send', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');
  const env = c.env;

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  if (invoice.status === 'draft') {
    return c.json({ error: 'Debes emitir la factura antes de enviarla' }, 400);
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return c.json({ error: `No se puede enviar una factura en estado "${invoice.status}"` }, 400);
  }

  // Generar HTML de la factura para el email
  const invoiceHtml = generateInvoiceEmailHtml(invoice);

  // Enviar email
  const emailResult = await sendEmail(env, {
    to: invoice.clientEmail,
    subject: `Factura ${invoice.invoiceNumber} - ${invoice.issuerLegalName}`,
    html: invoiceHtml,
    text: generateInvoiceEmailText(invoice),
  });

  if (!emailResult.ok) {
    return c.json(
      {
        error: 'No se pudo enviar el email',
        skipped: emailResult.skipped,
      },
      500,
    );
  }

  // Actualizar estado a "sent" si estaba en "issued"
  if (invoice.status === 'issued') {
    await db
      .update(schema.invoices)
      .set({
        status: 'sent',
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, id));
  }

  await logInvoiceAction(db, id, 'emailed', user.id, {
    email: invoice.clientEmail,
    emailId: emailResult.id,
  });

  const [updatedInvoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  return c.json({ invoice: updatedInvoice, emailId: emailResult.id });
});

// GENERAR PDF de factura
invoiceRoutes.get('/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  // Obtener líneas para incluir en el PDF
  const items = await db
    .select()
    .from(schema.invoiceItems)
    .where(eq(schema.invoiceItems.invoiceId, id))
    .orderBy(schema.invoiceItems.sortOrder);

  const pdfBase64 = generateInvoicePdfBase64(invoice);

  return c.json({
    pdf: pdfBase64,
    invoiceNumber: invoice.invoiceNumber,
    generatedAt: new Date().toISOString(),
  });
});

// MARCAR como pagada
invoiceRoutes.post('/:id/pay', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');
  const payload: unknown = await c.req.json().catch(() => ({}));

  const paySchema = z.object({
    paymentMethod: z.string().optional(),
    paymentNotes: z.string().optional(),
  });
  const body = paySchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Datos inválidos', details: body.error.issues }, 400);
  }

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  if (invoice.status === 'paid') {
    return c.json({ error: 'La factura ya está marcada como pagada' }, 400);
  }

  if (invoice.status === 'cancelled') {
    return c.json({ error: 'No se puede pagar una factura cancelada' }, 400);
  }

  await db
    .update(schema.invoices)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paymentMethod: body.data.paymentMethod || invoice.paymentMethod,
      paymentNotes: body.data.paymentNotes || invoice.paymentNotes,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, id));

  await logInvoiceAction(db, id, 'paid', user.id);

  const [updatedInvoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  return c.json({ invoice: updatedInvoice });
});

// CANCELAR factura
invoiceRoutes.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');
  const payload: unknown = await c.req.json().catch(() => ({}));

  const cancelSchema = z.object({
    reason: z.string().optional(),
  });
  const body = cancelSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Datos inválidos', details: body.error.issues }, 400);
  }

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  if (invoice.status === 'paid') {
    return c.json(
      {
        error: 'No se puede cancelar una factura pagada. Usa una factura rectificativa.',
        hint: 'Crea una nueva factura con isRectificative=true referenciando esta',
      },
      400,
    );
  }

  if (invoice.status === 'cancelled') {
    return c.json({ error: 'La factura ya está cancelada' }, 400);
  }

  await db
    .update(schema.invoices)
    .set({
      status: 'cancelled',
      rectificativeReason: body.data.reason || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoices.id, id));

  await logInvoiceAction(db, id, 'cancelled', user.id, { reason: body.data.reason });

  const [updatedInvoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  return c.json({ invoice: updatedInvoice });
});

// ============================================
// Helpers para emails
// ============================================

function generateInvoiceEmailHtml(invoice: typeof schema.invoices.$inferSelect): string {
  const formatMoney = (cents: number) => `€${(cents / 100).toFixed(2)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; }
    .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
    .logo { font-size: 20px; font-weight: bold; color: #111827; }
    .invoice-meta { text-align: right; font-size: 14px; color: #6b7280; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .data-card { background: #f9fafb; padding: 16px; border-radius: 8px; }
    .data-label { font-size: 12px; color: #6b7280; }
    .data-value { font-size: 14px; font-weight: 500; color: #111827; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 12px 8px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px 8px; font-size: 14px; border-bottom: 1px solid #e5e7eb; }
    .totals { margin-left: auto; width: 280px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 14px; }
    .total-row.final { background: #111827; color: white; border-radius: 4px; font-weight: 600; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #6b7280; }
    .cta-button { display: inline-block; background: #111827; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">${invoice.issuerLegalName}</div>
    <div class="invoice-meta">
      <div>Factura ${invoice.invoiceNumber}</div>
      <div>Fecha: ${new Date(invoice.issueDate!).toLocaleDateString('es-ES')}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Facturar a</div>
    <div class="data-card">
      <div class="data-value">${invoice.clientLegalName}</div>
      <div class="data-label">NIF: ${invoice.clientTaxId}</div>
      <div class="data-label">${invoice.clientAddressLine1}</div>
      <div class="data-label">${invoice.clientPostalCode} ${invoice.clientCity}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Detalles de pago</div>
    <div class="data-grid">
      <div class="data-card">
        <div class="data-label">Vencimiento</div>
        <div class="data-value">${new Date(invoice.dueDate!).toLocaleDateString('es-ES')}</div>
      </div>
      <div class="data-card">
        <div class="data-label">Método de pago</div>
        <div class="data-value">${invoice.paymentMethod || 'Transferencia bancaria'}</div>
      </div>
    </div>
  </div>

  ${
    invoice.description
      ? `
  <div class="section">
    <div class="section-title">Descripción</div>
    <p>${invoice.description}</p>
  </div>
  `
      : ''
  }

  <div class="footer">
    <p>Para cualquier duda sobre esta factura, por favor contacta con nosotros en ${invoice.issuerEmail}</p>
  </div>
</body>
</html>
  `.trim();
}

function generateInvoiceEmailText(invoice: typeof schema.invoices.$inferSelect): string {
  return `
Factura ${invoice.invoiceNumber} - ${invoice.issuerLegalName}

Fecha: ${new Date(invoice.issueDate!).toLocaleDateString('es-ES')}
Vencimiento: ${new Date(invoice.dueDate!).toLocaleDateString('es-ES')}

Facturar a:
${invoice.clientLegalName}
NIF: ${invoice.clientTaxId}
${invoice.clientAddressLine1}
${invoice.clientPostalCode} ${invoice.clientCity}

Total: €${(invoice.totalCents! / 100).toFixed(2)}

Para cualquier duda, contacta en ${invoice.issuerEmail}
  `.trim();
}

/**
 * Genera PDF de factura (base64 para descarga)
 */
function generateInvoicePdfBase64(invoice: typeof schema.invoices.$inferSelect): string {
  // En producción, usar una librería como @react-pdf/renderer o pdfmake
  // Por ahora, retornamos un placeholder que el frontend puede convertir
  // La implementación real requiere bundling de librerías PDF

  const svgContent = `
    <svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="1000" fill="white"/>
      <text x="50" y="50" font-family="Arial" font-size="24" fill="#111827">${invoice.issuerLegalName}</text>
      <text x="50" y="80" font-family="Arial" font-size="14" fill="#6b7280">NIF: ${invoice.issuerTaxId}</text>
      <text x="50" y="120" font-family="Arial" font-size="18" fill="#111827">FACTURA ${invoice.invoiceNumber}</text>
      <text x="50" y="150" font-family="Arial" font-size="14" fill="#6b7280">Fecha: ${new Date(invoice.issueDate!).toLocaleDateString('es-ES')}</text>
      <text x="50" y="190" font-family="Arial" font-size="16" fill="#111827">Facturar a:</text>
      <text x="50" y="210" font-family="Arial" font-size="14" fill="#111827">${invoice.clientLegalName}</text>
      <text x="50" y="230" font-family="Arial" font-size="14" fill="#6b7280">NIF: ${invoice.clientTaxId}</text>
      <text x="50" y="250" font-family="Arial" font-size="14" fill="#6b7280">${invoice.clientAddressLine1}</text>
      <text x="50" y="270" font-family="Arial" font-size="14" fill="#6b7280">${invoice.clientPostalCode} ${invoice.clientCity}</text>
      <text x="50" y="320" font-family="Arial" font-size="18" fill="#111827">Total: €${(invoice.totalCents! / 100).toFixed(2)}</text>
      <text x="50" y="360" font-family="Arial" font-size="14" fill="#6b7280">Vencimiento: ${new Date(invoice.dueDate!).toLocaleDateString('es-ES')}</text>
      <text x="50" y="380" font-family="Arial" font-size="14" fill="#6b7280">Método de pago: ${invoice.paymentMethod || 'Transferencia bancaria'}</text>
      ${invoice.description ? `<text x="50" y="420" font-family="Arial" font-size="14" fill="#111827">${invoice.description}</text>` : ''}
    </svg>
  `;

  return btoa(svgContent);
}
