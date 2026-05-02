-- 0015: HITL (Human-in-the-Loop) reviews
-- Tracks pending approvals, overrides, and timeout state.
-- Alan is sole reviewer in Phase 1. Jobs wait in queue if Alan is unavailable.

CREATE TABLE IF NOT EXISTS hitl_reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  client_id TEXT NOT NULL REFERENCES clients(id),
  invocation_id TEXT REFERENCES agent_invocations(id),  -- Links to the agent invocation that triggered HITL
  review_type TEXT NOT NULL,                              -- 'plan_approval' | 'qa_override' | 'brand_graph_override'
  status TEXT NOT NULL DEFAULT 'pending',                -- 'pending' | 'approved' | 'rejected' | 'timed_out'
  context_summary TEXT NOT NULL,                         -- JSON: summary of what the reviewer sees (plan JSON, QA scores, etc.)
  reviewer_id TEXT,                                      -- User ID of the reviewer (null until actioned)
  reviewer_action TEXT,                                   -- 'approved' | 'rejected' | 'override_brand_graph' | null
  reviewer_note TEXT,                                    -- Optional note from reviewer
  confidence_score REAL,                                 -- Agent confidence that triggered HITL (±0.05 band)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reviewed_at INTEGER,                                  -- When the reviewer acted
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_hitl_job_id ON hitl_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_hitl_client_id ON hitl_reviews(client_id);
CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_reviews(status);
CREATE INDEX IF NOT EXISTS idx_hitl_created_at ON hitl_reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_hitl_pending ON hitl_reviews(status, created_at);
