-- Onboarding lets users skip the optional birthday question; the skip is
-- recorded on the user row so it survives a reload. Safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_skipped_at timestamptz;
