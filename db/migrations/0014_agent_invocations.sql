-- 0014: Agent invocation audit trail
-- Every Reasoning Worker call is logged for RGPD/EU AI Act compliance.
-- 2-year retention. Hashes instead of raw content to minimize PII exposure.

CREATE TABLE IF NOT EXISTS agent_invocations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  agent_name TEXT NOT NULL,              -- e.g., 'visual-production-planner'
  invocation_type TEXT NOT NULL,          -- 'plan' | 'generate' | 'qa' | 'enrich' | 'curate'
  context_hash TEXT NOT NULL,            -- SHA-256 hash of context envelope
  output_hash TEXT,                      -- SHA-256 hash of agent output (null if failed)
  confidence REAL,                      -- Agent confidence score (0-1), null if failed
  decision TEXT NOT NULL,                -- 'approved' | 'rejected' | 'hitl_review' | 'error'
  human_override TEXT,                   -- 'approved' | 'rejected' | null (set by HITL)
  human_override_by TEXT,                -- User ID who overrode, null if auto
  error_message TEXT,                    -- Error message if invocation failed
  token_count INTEGER,                  -- Approximate token count for cost tracking
  duration_ms INTEGER,                  -- Invocation duration in milliseconds
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_job_id ON agent_invocations(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_client_id ON agent_invocations(client_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_name ON agent_invocations(agent_name);
CREATE INDEX IF NOT EXISTS idx_ai_decision ON agent_invocations(decision);
CREATE INDEX IF NOT EXISTS idx_ai_created_at ON agent_invocations(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_client_created ON agent_invocations(client_id, created_at);
