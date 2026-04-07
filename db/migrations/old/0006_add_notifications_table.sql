-- Migration: Add notifications table
-- Date: 2026-04-07
-- Description: Add in-app notifications system for client portal

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK(type IN ('job_completed', 'job_updated', 'feedback_received', 'message', 'reminder')),
  title text NOT NULL,
  message text NOT NULL,
  read integer NOT NULL DEFAULT 0,
  related_job_id text REFERENCES jobs(id),
  related_invoice_id text REFERENCES invoices(id),
  created_at integer NOT NULL,
  updated_at integer
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
