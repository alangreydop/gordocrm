-- QA Engine results table
CREATE TABLE qa_results (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  job_id TEXT NOT NULL REFERENCES jobs(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'queued',
  scores TEXT,
  overall_score INTEGER,
  auto_approved INTEGER DEFAULT 0,
  error TEXT,
  processing_started_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_qa_status ON qa_results(status);
CREATE INDEX idx_qa_job_asset ON qa_results(job_id, asset_id);
CREATE INDEX idx_qa_created_at ON qa_results(created_at);
