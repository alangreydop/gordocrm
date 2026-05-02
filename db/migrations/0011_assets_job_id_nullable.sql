-- Brand assets are job-independent. Allow job_id to be NULL.
-- SQLite doesn't support ALTER COLUMN, so we recreate the table.

-- Step 1: Create new table with nullable job_id
CREATE TABLE assets_new (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  r2_key TEXT NOT NULL,
  qa_status TEXT CHECK (qa_status IN ('pending', 'approved', 'rejected')),
  qa_notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  label TEXT,
  delivery_url TEXT,
  status TEXT DEFAULT 'pending',
  metadata TEXT,
  updated_at INTEGER,
  description TEXT,
  tags TEXT,
  embedding TEXT,
  dominant_colors TEXT,
  visual_style TEXT,
  emotional_tone TEXT,
  client_visible INTEGER DEFAULT 1,
  client_id TEXT REFERENCES clients(id),
  file_size INTEGER,
  sku TEXT,
  category TEXT
);

-- Step 2: Copy data
INSERT INTO assets_new (
  id, job_id, type, r2_key, qa_status, qa_notes, created_at,
  label, delivery_url, status, metadata, updated_at,
  description, tags, embedding, dominant_colors, visual_style, emotional_tone,
  client_visible, client_id, file_size, sku, category
) SELECT
  id, job_id, type, r2_key, NULL, NULL, created_at,
  label, delivery_url, status, metadata, updated_at,
  description, tags, embedding, dominant_colors, visual_style, emotional_tone,
  client_visible, client_id, file_size, sku, category
FROM assets;

-- Step 3: Drop old table
DROP TABLE assets;

-- Step 4: Rename
ALTER TABLE assets_new RENAME TO assets;

-- Step 5: Recreate indexes
CREATE INDEX idx_assets_job_id ON assets(job_id);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_client_visible ON assets(client_visible);
CREATE INDEX idx_assets_created_at ON assets(created_at);
CREATE INDEX idx_assets_job_r2 ON assets(job_id, r2_key);
CREATE UNIQUE INDEX idx_assets_job_r2_unique ON assets(job_id, r2_key);
