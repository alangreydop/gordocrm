-- Add sku and category columns to assets table for brand-scoped folder structure
ALTER TABLE assets ADD COLUMN sku TEXT;
ALTER TABLE assets ADD COLUMN category TEXT;
