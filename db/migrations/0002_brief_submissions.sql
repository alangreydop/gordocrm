CREATE TABLE IF NOT EXISTS brief_submissions (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  email TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('foto', 'video', 'ambos')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'archived')),
  source TEXT NOT NULL DEFAULT 'website',
  source_page TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);

CREATE INDEX IF NOT EXISTS idx_brief_submissions_client_id
  ON brief_submissions(client_id);

CREATE INDEX IF NOT EXISTS idx_brief_submissions_email
  ON brief_submissions(email);

CREATE INDEX IF NOT EXISTS idx_brief_submissions_created_at
  ON brief_submissions(created_at);
