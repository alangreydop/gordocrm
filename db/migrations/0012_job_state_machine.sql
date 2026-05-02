-- 0012: Align jobs schema with the current snake_case delivery_url column.
--
-- Production already has the expanded job status CHECK constraint from an
-- earlier manual/schema repair, but it still has the legacy camelCase
-- deliveryUrl column from old migrations. Rebuilding jobs now fails because
-- child tables reference jobs. Keep this migration minimal and non-destructive.

ALTER TABLE jobs ADD COLUMN delivery_url TEXT;

