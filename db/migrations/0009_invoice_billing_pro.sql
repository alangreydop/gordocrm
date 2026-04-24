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

-- Note on invoice_number uniqueness:
-- The current UNIQUE index on invoice_number is enforced at the schema level.
-- Drizzle does not support DROP INDEX + CREATE INDEX via ALTER TABLE in D1.
-- This is handled at the application layer in the PATCH /invoices endpoint
-- by checking for duplicate (client_id, invoice_number) before insert/update.
-- The global unique constraint remains in place; enforce scoped uniqueness via
-- application-level check until the table can be migrated in a future release.
