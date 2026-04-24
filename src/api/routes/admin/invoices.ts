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
import { INVOICE_STATUS_VALUES } from '../../../lib/invoice-status.js';
import type { AppContext } from '../../../types/index.js';

// PDF generation and email delivery are NOT used in the Billing Pro workflow.
// Alan creates invoices in Billing Pro and records status here.
// Imports removed: sendEmail, generateInvoicePdfBytes, bytesToBase64, invoicePdfFilename.

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
  /** Free-text invoice number as printed by Billing Pro. When omitted, auto-generated (legacy). */
  invoiceNumber: z.string().trim().min(1).optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  description: z.string().trim().optional(),
  items: z.array(invoiceItemSchema).min(1),
  paymentMethod: z.string().optional(),
  paymentNotes: z.string().optional(),
  notes: z.string().optional(),
  relatedJobIds: z.array(z.string()).optional(),
  /** Link to the Billing Pro document URL if Alan wants to expose it. */
  billingProUrl: z.string().url().optional().nullable(),
});

const updateInvoiceSchema = z.object({
  status: z.enum(INVOICE_STATUS_VALUES).optional(),
  description: z.string().trim().optional(),
  paymentMethod: z.string().optional(),
  paymentNotes: z.string().optional(),
  notes: z.string().optional(),
  footer: z.string().optional(),
  billingProUrl: z.string().url().optional().nullable(),
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
  defaultPaymentMethod?: string;
  defaultPaymentNotes?: string;
}> {
  const configRows = await db
    .select({ key: schema.config.key, value: schema.config.value })
    .from(schema.config);

  const configMap = Object.fromEntries(configRows.map((r: { key: string; value: string }) => [r.key, r.value]));
  const configValue = (key: string): string => configMap[key] ?? '';
  const requiredKeys = [
    'issuer_tax_id',
    'issuer_legal_name',
    'issuer_address_line1',
    'issuer_city',
    'issuer_postal_code',
    'issuer_country',
    'issuer_email',
  ];
  const missing = requiredKeys.filter((key) => !configMap[key]);

  if (missing.length > 0) {
    throw new Error(`Faltan datos fiscales del emisor: ${missing.join(', ')}`);
  }

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
    defaultPaymentMethod?: string;
    defaultPaymentNotes?: string;
  } = {
    taxId: configValue('issuer_tax_id'),
    legalName: configValue('issuer_legal_name'),
    addressLine1: configValue('issuer_address_line1'),
    city: configValue('issuer_city'),
    postalCode: configValue('issuer_postal_code'),
    country: configValue('issuer_country'),
    email: configValue('issuer_email'),
  };

  if (configMap['issuer_phone']) result.phone = configMap['issuer_phone'];
  if (configMap['issuer_registration_number']) result.registrationNumber = configMap['issuer_registration_number'];
  if (configMap['invoice_footer']) result.footer = configMap['invoice_footer'];
  if (configMap['default_payment_method']) result.defaultPaymentMethod = configMap['default_payment_method'];
  if (configMap['default_payment_notes']) result.defaultPaymentNotes = configMap['default_payment_notes'];

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
    issueDate,
    dueDate,
    description,
    paymentMethod,
    paymentNotes,
    notes,
    relatedJobIds,
    billingProUrl,
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

  let issuer: Awaited<ReturnType<typeof getIssuerData>>;
  try {
    issuer = await getIssuerData(db);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Datos fiscales del emisor incompletos',
        hint: 'Configura los datos fiscales reales del emisor antes de crear facturas.',
      },
      500,
    );
  }

  // Use provided invoice number (Billing Pro free-text) or auto-generate as fallback
  const currentYear = new Date().getFullYear();
  const invoiceNumber =
    body.data.invoiceNumber ?? (await generateInvoiceNumber(db, currentYear));

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
  const issued = issueDate ? new Date(issueDate) : now;
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
    issueDate: issued,
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
    paymentMethod: paymentMethod || issuer.defaultPaymentMethod || null,
    paymentNotes: paymentNotes || issuer.defaultPaymentNotes || null,
    notes: notes || null,
    billingProUrl: billingProUrl || null,
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

// ENVIAR factura por email — DISABLED (Billing Pro workflow)
// Alan sends invoices from Billing Pro directly. Email delivery via gordocrm is not used.
invoiceRoutes.post('/:id/send', (c) => {
  return c.json(
    {
      error: 'Email delivery via gordocrm is disabled. Send invoices from Billing Pro.',
      hint: 'Use PATCH /:id to update status to "sent" after sending from Billing Pro.',
    },
    410,
  );
});

// GENERAR PDF de factura — DISABLED (Billing Pro workflow)
// PDFs are generated by Billing Pro. Store the Billing Pro document URL in billingProUrl instead.
invoiceRoutes.get('/:id/pdf', (c) => {
  return c.json(
    {
      error: 'PDF generation via gordocrm is disabled. Use Billing Pro to generate PDFs.',
      hint: 'Store the Billing Pro document URL in the billingProUrl field via PATCH /:id.',
    },
    410,
  );
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

// ACTUALIZAR factura (status, notes, billingProUrl, etc.)
invoiceRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const user = c.get('user');
  const payload: unknown = await c.req.json();
  const body = updateInvoiceSchema.safeParse(payload);

  if (!body.success) {
    return c.json({ error: 'Datos inválidos', details: body.error.issues }, 400);
  }

  const [invoice] = await db
    .select({ status: schema.invoices.status })
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  if (!invoice) {
    return c.json({ error: 'Factura no encontrada' }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const { status, description, paymentMethod, paymentNotes, notes, footer, billingProUrl } =
    body.data;

  if (status !== undefined) {
    updates.status = status;
    if (status === 'paid') updates.paidAt = new Date();
  }
  if (description !== undefined) updates.description = description;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
  if (paymentNotes !== undefined) updates.paymentNotes = paymentNotes;
  if (notes !== undefined) updates.notes = notes;
  if (footer !== undefined) updates.footer = footer;
  if (billingProUrl !== undefined) updates.billingProUrl = billingProUrl;

  await db.update(schema.invoices).set(updates).where(eq(schema.invoices.id, id));

  await logInvoiceAction(db, id, 'updated', user.id, { changes: Object.keys(updates) });

  const [updatedInvoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, id))
    .limit(1);

  return c.json({ invoice: updatedInvoice });
});

// Email helpers removed — send endpoint disabled (Billing Pro workflow).
// If email delivery is needed in future, restore from git history.
