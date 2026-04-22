-- Pipeline Configurator table
CREATE TABLE pipeline_mappings (
  id TEXT PRIMARY KEY,
  client_segment TEXT NOT NULL,
  job_type TEXT,
  platform TEXT,
  pipeline_id TEXT NOT NULL,
  qa_threshold INTEGER NOT NULL DEFAULT 85,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_pipeline_mapping_unique ON pipeline_mappings(client_segment, job_type, platform);
CREATE INDEX idx_pipeline_mapping_segment ON pipeline_mappings(client_segment);
