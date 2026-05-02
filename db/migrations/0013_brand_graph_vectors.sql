-- 0013: Brand Graph vectors table
-- Stores vector representations of client brand identities
-- Each row is a single vector (e.g., a color palette entry, a style reference, etc.)

CREATE TABLE IF NOT EXISTS brand_graph_vectors (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  vector_type TEXT NOT NULL, -- 'color' | 'style' | 'composition' | 'typography' | 'lighting' | 'mood' | 'reference_image'
  label TEXT NOT NULL,        -- Human-readable label (e.g., "Primary brand red", "Cinematic lighting")
  value TEXT NOT NULL,        -- JSON: the vector data or reference (hex color, description, embedding array)
  confidence REAL NOT NULL DEFAULT 1.0, -- 0-1: how confident we are in this vector
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'ai_generated' | 'asset_derived'
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_bgv_client_id ON brand_graph_vectors(client_id);
CREATE INDEX IF NOT EXISTS idx_bgv_client_type ON brand_graph_vectors(client_id, vector_type);
CREATE INDEX IF NOT EXISTS idx_bgv_confidence ON brand_graph_vectors(client_id, confidence);

-- Brand Graph coverage tracking
CREATE TABLE IF NOT EXISTS brand_graph_coverage (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  dimension TEXT NOT NULL,     -- 'color' | 'typography' | 'composition' | 'lighting' | 'style'
  coverage_score REAL NOT NULL DEFAULT 0.0, -- 0-1: how well this dimension is covered
  last_assessed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(client_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_bgc_client_id ON brand_graph_coverage(client_id);
