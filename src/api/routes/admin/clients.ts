/**
 * Admin clients routes — fiscal data management.
 *
 * PATCH /:id/fiscal — update fiscal block for a client
 * GET  /:id/fiscal  — read fiscal block for a client
 * GET  /:id/payment-status — derive clientPaymentStatus from invoices
 */

import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { schema } from '../../../../db/index.js';
import { requireAdmin } from '../../../lib/auth.js';
import { validateTaxId, detectTaxIdType } from '../../../lib/fiscal-validation.js';
import {
  computeClientPaymentStatus,
  type InvoiceSummary,
  INVOICE_STATUS,
} from '../../../lib/invoice-status.js';
import type { AppContext } from '../../../types/index.js';

const optionalNullableString = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v === 'string') {
      const t = v.trim();
      return t === '' ? null : t;
    }
    return v;
  },
  z.union([z.string(), z.null()]).optional(),
);

const updateFiscalSchema = z.object({
  taxId: optionalNullableString,
  taxIdType: z.enum(['NIF', 'NIE', 'CIF']).optional().nullable(),
  legalName: optionalNullableString,
  addressLine1: optionalNullableString,
  addressLine2: optionalNullableString,
  city: optionalNullableString,
  region: optionalNullableString,
  postalCode: optionalNullableString,
  country: z.string().trim().toUpperCase().default('ES').optional(),
});

export const adminClientRoutes = new Hono<AppContext>();

// ── GET /:id/fiscal ──────────────────────────────────────────────────────────
adminClientRoutes.get('/:id/fiscal', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const [client] = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      email: schema.clients.email,
      taxId: schema.clients.taxId,
      taxIdType: schema.clients.taxIdType,
      legalName: schema.clients.legalName,
      addressLine1: schema.clients.addressLine1,
      addressLine2: schema.clients.addressLine2,
      city: schema.clients.city,
      region: schema.clients.region,
      postalCode: schema.clients.postalCode,
      country: schema.clients.country,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  if (!client) return c.json({ error: 'Client not found' }, 404);

  return c.json({ client });
});

// ── PATCH /:id/fiscal ────────────────────────────────────────────────────────
adminClientRoutes.patch('/:id/fiscal', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const body = await c.req.json();
  const parsed = updateFiscalSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;

  // Validate taxId format if provided
  if (data.taxId) {
    const result = validateTaxId(data.taxId);
    if (!result.valid) {
      return c.json(
        { error: 'Formato de NIF/NIE/CIF inválido', field: 'taxId' },
        400,
      );
    }
    // Auto-detect type if not explicitly set
    data.taxId = result.normalized;
    if (!data.taxIdType) {
      data.taxIdType = result.type;
    }
  }

  // Check client exists
  const [existing] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  if (!existing) return c.json({ error: 'Client not found' }, 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.taxId !== undefined) updates.taxId = data.taxId;
  if (data.taxIdType !== undefined) updates.taxIdType = data.taxIdType;
  if (data.legalName !== undefined) updates.legalName = data.legalName;
  if (data.addressLine1 !== undefined) updates.addressLine1 = data.addressLine1;
  if (data.addressLine2 !== undefined) updates.addressLine2 = data.addressLine2;
  if (data.city !== undefined) updates.city = data.city;
  if (data.region !== undefined) updates.region = data.region;
  if (data.postalCode !== undefined) updates.postalCode = data.postalCode;
  if (data.country !== undefined) updates.country = data.country;

  await db.update(schema.clients).set(updates).where(eq(schema.clients.id, id));

  const [updated] = await db
    .select({
      id: schema.clients.id,
      taxId: schema.clients.taxId,
      taxIdType: schema.clients.taxIdType,
      legalName: schema.clients.legalName,
      addressLine1: schema.clients.addressLine1,
      addressLine2: schema.clients.addressLine2,
      city: schema.clients.city,
      region: schema.clients.region,
      postalCode: schema.clients.postalCode,
      country: schema.clients.country,
    })
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  return c.json({ client: updated });
});

// ── GET /:id/payment-status ──────────────────────────────────────────────────
adminClientRoutes.get('/:id/payment-status', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');

  const [client] = await db
    .select({ id: schema.clients.id })
    .from(schema.clients)
    .where(eq(schema.clients.id, id))
    .limit(1);

  if (!client) return c.json({ error: 'Client not found' }, 404);

  const invoices = await db
    .select({
      status: schema.invoices.status,
      dueDate: schema.invoices.dueDate,
    })
    .from(schema.invoices)
    .where(eq(schema.invoices.clientId, id))
    .orderBy(desc(schema.invoices.createdAt));

  const summaries: InvoiceSummary[] = invoices.map((inv) => ({
    status: inv.status as (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS],
    dueDate: inv.dueDate,
  }));

  const paymentStatus = computeClientPaymentStatus(summaries);

  return c.json({ clientId: id, paymentStatus, invoiceCount: invoices.length });
});
