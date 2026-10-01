-- The Google Calendar integration was permanently removed on 2026-10-01.
-- Stored refresh tokens can no longer be decrypted or revoked, so the table
-- and its provider index are dropped. Safe to re-run.
DROP TABLE IF EXISTS calendar_connections;
