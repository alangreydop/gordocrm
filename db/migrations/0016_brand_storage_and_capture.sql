-- 0016: Canonical client R2 folders and async brand DNA capture queue

ALTER TABLE clients ADD COLUMN brand_folder TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_brand_folder
  ON clients(brand_folder);

CREATE TABLE IF NOT EXISTS brand_capture_runs (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  trigger_asset_id TEXT REFERENCES assets(id),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  source_hash TEXT,
  result_version INTEGER,
  snapshot_r2_key TEXT,
  error TEXT,
  processing_started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_brand_capture_runs_client
  ON brand_capture_runs(client_id);

CREATE INDEX IF NOT EXISTS idx_brand_capture_runs_status
  ON brand_capture_runs(status);

CREATE INDEX IF NOT EXISTS idx_brand_capture_runs_source_hash
  ON brand_capture_runs(source_hash);
