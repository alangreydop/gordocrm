-- Migration: external_system_ids_and_onboarding
-- Date: 2026-04-06
-- Purpose: Añadir campos para integración con AI Engine y onboarding

-- Añadir campo external_job_id a jobs
ALTER TABLE jobs ADD COLUMN external_job_id TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_external_job_id ON jobs(external_job_id);

-- Añadir campos de onboarding a clients
ALTER TABLE clients ADD COLUMN onboarding_completed_at INTEGER;
ALTER TABLE clients ADD COLUMN first_session_at INTEGER;
ALTER TABLE clients ADD COLUMN external_client_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_external_client_id ON clients(external_client_id);

-- Añadir campo delivery_url a jobs (para recibir desde AI Engine)
ALTER TABLE jobs ADD COLUMN deliveryUrl TEXT;

-- Añadir campos de timestamps adicionales a jobs
ALTER TABLE jobs ADD COLUMN started_at INTEGER;
ALTER TABLE jobs ADD COLUMN completed_at INTEGER;
ALTER TABLE jobs ADD COLUMN failed_at INTEGER;
ALTER TABLE jobs ADD COLUMN failure_reason TEXT;

-- Añadir campos a assets para metadata y status
ALTER TABLE assets ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE assets ADD COLUMN metadata TEXT;
ALTER TABLE assets ADD COLUMN updated_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
