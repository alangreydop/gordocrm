-- Orchestrator Sharp Tools schema changes
-- Adds: pipeline_id to jobs, brand_graph + qa_enabled to clients, unique constraint on assets

-- A1: Pipeline Configurator — pipeline_id already in 0000 baseline, no ALTER needed

-- A3: Prevent duplicate assets from duplicate webhooks
CREATE UNIQUE INDEX idx_assets_job_r2_unique ON assets(job_id, r2_key);

-- Tool 3: Brand Graph as JSON column on clients + QA feature flag
ALTER TABLE clients ADD COLUMN brand_graph TEXT;
ALTER TABLE clients ADD COLUMN qa_enabled INTEGER DEFAULT 0;
