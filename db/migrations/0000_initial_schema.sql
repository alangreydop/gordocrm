-- Migration: Initial CRM portal schema
-- Tables: users, clients, jobs, assets, sessions

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  name          TEXT NOT NULL,
  company       TEXT,
  stripe_customer_id TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'delivered')),
  brief_text    TEXT,
  platform      TEXT CHECK (platform IN ('instagram', 'tiktok', 'amazon_pdp', 'paid_ads')),
  type          TEXT CHECK (type IN ('image', 'video')),
  lora_model_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id),
  type          TEXT NOT NULL CHECK (type IN ('image', 'video')),
  r2_key        TEXT NOT NULL,
  qa_status     TEXT CHECK (qa_status IN ('pending', 'approved', 'rejected')),
  qa_notes      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  token         TEXT UNIQUE NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_assets_job_id ON assets(job_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
