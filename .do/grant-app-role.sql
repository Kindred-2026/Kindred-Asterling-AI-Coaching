-- Least-privilege access for the app's `kindred_app` login on DigitalOcean
-- Managed PostgreSQL (docs/DIGITALOCEAN_DEPLOYMENT.md). Run as `doadmin` in the
-- `kindred` database after loading the schema or restoring data. Safe to re-run.
-- The app can read and write rows but cannot create, alter or drop tables.
GRANT CONNECT ON DATABASE kindred TO kindred_app;
GRANT USAGE ON SCHEMA public TO kindred_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kindred_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO kindred_app;
-- Tables and sequences that later migrations create as doadmin.
ALTER DEFAULT PRIVILEGES FOR ROLE doadmin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kindred_app;
ALTER DEFAULT PRIVILEGES FOR ROLE doadmin IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO kindred_app;
