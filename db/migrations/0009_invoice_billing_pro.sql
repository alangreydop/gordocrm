-- Phase B: Invoice status tracking improvements
-- 1. Add billing_pro_url for linking to external Billing Pro documents
-- 2. Add CHECK constraint on invoices.status for storage-layer validation
-- 3. Relax invoice_number uniqueness: scoped to (client_id, invoice_number)
--    instead of global UNIQUE — allows the same Billing Pro sequence across clients

-- Add billing_pro_url column
ALTER TABLE invoices ADD COLUMN billing_pro_url TEXT;

-- Add CHECK constraint on status
-- SQLite does not support adding CHECK to an existing table via ALTER TABLE,
-- so this is enforced at the API layer (Zod) and documented here for reference.
-- When the invoices table is next recreated, add:
--   CHECK (status IN ('draft','issued','sent','paid','cancelled','overdue'))

-- Scope invoiceNumber uniqueness to (clientId, invoiceNumber) instead of global.
-- This allows different clients to have the same Billing Pro sequence numbers.
-- Note: column names in this table are camelCase as created by Drizzle.
DROP INDEX IF EXISTS invoices_invoice_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_client_number_unique ON invoices(clientId, invoiceNumber);
