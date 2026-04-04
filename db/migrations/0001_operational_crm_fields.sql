ALTER TABLE clients ADD COLUMN plan TEXT;
ALTER TABLE clients ADD COLUMN account_manager TEXT;
ALTER TABLE clients ADD COLUMN monthly_unit_capacity INTEGER;
ALTER TABLE clients ADD COLUMN dataset_status TEXT NOT NULL DEFAULT 'pending_capture';
ALTER TABLE clients ADD COLUMN segment TEXT;
ALTER TABLE clients ADD COLUMN margin_profile TEXT;
ALTER TABLE clients ADD COLUMN notes TEXT;
ALTER TABLE clients ADD COLUMN next_review_at INTEGER;
ALTER TABLE clients ADD COLUMN last_contacted_at INTEGER;

ALTER TABLE jobs ADD COLUMN due_at INTEGER;
ALTER TABLE jobs ADD COLUMN units_planned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN units_consumed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN ai_cost_estimated REAL;
ALTER TABLE jobs ADD COLUMN ai_cost_real REAL;
ALTER TABLE jobs ADD COLUMN gross_margin_estimated REAL;
ALTER TABLE jobs ADD COLUMN client_segment TEXT;
ALTER TABLE jobs ADD COLUMN margin_profile TEXT;
ALTER TABLE jobs ADD COLUMN asset_dominant TEXT;
ALTER TABLE jobs ADD COLUMN legal_risk TEXT;
ALTER TABLE jobs ADD COLUMN turnaround TEXT;
ALTER TABLE jobs ADD COLUMN portability_required TEXT;
ALTER TABLE jobs ADD COLUMN structural_demand TEXT;
ALTER TABLE jobs ADD COLUMN benchmark_level TEXT;
ALTER TABLE jobs ADD COLUMN stack_lane TEXT;
ALTER TABLE jobs ADD COLUMN stack_candidate_1 TEXT;
ALTER TABLE jobs ADD COLUMN stack_candidate_2 TEXT;
ALTER TABLE jobs ADD COLUMN stack_candidate_3 TEXT;
ALTER TABLE jobs ADD COLUMN stack_winner TEXT;
ALTER TABLE jobs ADD COLUMN stack_snapshot TEXT;
ALTER TABLE jobs ADD COLUMN client_goal TEXT;
ALTER TABLE jobs ADD COLUMN internal_notes TEXT;

ALTER TABLE assets ADD COLUMN label TEXT;
ALTER TABLE assets ADD COLUMN delivery_url TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_next_review_at ON clients(next_review_at);
CREATE INDEX IF NOT EXISTS idx_jobs_due_at ON jobs(due_at);
CREATE INDEX IF NOT EXISTS idx_jobs_stack_lane ON jobs(stack_lane);
