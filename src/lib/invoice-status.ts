/**
 * Invoice status constants and display utilities.
 * Single source of truth for all layers: DB values, Zod validation, UI labels.
 *
 * DB stores English values. UI displays Spanish labels.
 */

export const INVOICE_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  SENT: 'sent',
  PAID: 'paid',
  CANCELLED: 'cancelled',
  OVERDUE: 'overdue',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUS_VALUES = Object.values(INVOICE_STATUS) as [
  InvoiceStatus,
  ...InvoiceStatus[],
];

/** Spanish display labels for each status. Use in UI only — never store in DB. */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'borrador',
  issued: 'emitida',
  sent: 'enviada',
  paid: 'pagada',
  cancelled: 'cancelada',
  overdue: 'vencida',
};

/**
 * Transitions allowed by the business.
 * Key = current status, value = statuses Alan can move to from there.
 */
export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['sent', 'paid', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  paid: [],
  overdue: ['paid', 'cancelled'],
  cancelled: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_STATUS_TRANSITIONS[from].includes(to);
}

// ─── Client payment status ─────────────────────────────────────────────────

export const CLIENT_PAYMENT_STATUS = {
  NO_INVOICE: 'no_invoice',
  PENDING: 'pending',
  PAID: 'paid',
  OVERDUE: 'overdue',
} as const;

export type ClientPaymentStatus =
  (typeof CLIENT_PAYMENT_STATUS)[keyof typeof CLIENT_PAYMENT_STATUS];

export interface InvoiceSummary {
  status: InvoiceStatus;
  dueDate?: Date | null;
}

/**
 * Derives the client's payment status from their invoice records.
 * Rules:
 *   no_invoice — no invoices exist
 *   overdue    — any invoice is overdue (or past due date and still sent)
 *   paid       — at least one paid invoice, none outstanding
 *   pending    — invoices exist but none paid and none overdue
 */
export function computeClientPaymentStatus(invoices: InvoiceSummary[]): ClientPaymentStatus {
  if (invoices.length === 0) return CLIENT_PAYMENT_STATUS.NO_INVOICE;

  const now = new Date();
  let hasPaid = false;
  let hasOverdue = false;
  let hasOutstanding = false;

  for (const inv of invoices) {
    if (inv.status === INVOICE_STATUS.PAID) {
      hasPaid = true;
      continue;
    }
    if (inv.status === INVOICE_STATUS.CANCELLED) continue;

    // Treat sent/issued invoices past their due date as effectively overdue
    const isPastDue =
      inv.dueDate != null &&
      inv.dueDate < now &&
      (inv.status === INVOICE_STATUS.SENT || inv.status === INVOICE_STATUS.ISSUED);

    if (inv.status === INVOICE_STATUS.OVERDUE || isPastDue) {
      hasOverdue = true;
    } else {
      hasOutstanding = true;
    }
  }

  if (hasOverdue) return CLIENT_PAYMENT_STATUS.OVERDUE;
  if (hasPaid && !hasOutstanding) return CLIENT_PAYMENT_STATUS.PAID;
  return CLIENT_PAYMENT_STATUS.PENDING;
}
