-- Beta testers tick off checklist items in the app; the ticked item ids live
-- on the user row. Safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS beta_checklist text[] NOT NULL DEFAULT '{}';
