# PostgreSQL staging evidence — 2026-09-26 UTC

This is a synthetic rehearsal on the existing Fly staging cluster, not a
production migration, app deployment, or proof of production data completeness.
Base: `410cd7f92f493646eff6840d62138447bc7fa78e`, plus the reviewed changes
in the PR introducing this record. Node 24.19.0; PostgreSQL and client 16.15.

## Credentials and configuration

The owner confirmed rotating the exposed staging password. A fresh credential
lookup followed by a real connection succeeded. Values stayed out of tool
output, repository files and agent prompts. This records owner confirmation
and working current credentials, not an independent old-password revocation test.
The Fly app now has `POSTGRES_URL` staged; the unused `DATABASE_URL` was removed.
No machine, image or app release was created. `DATABASE_PROVIDER` remains
`mongo` until the reviewed PostgreSQL deployment configuration is ready.
The staged connection now uses the dedicated `kindred-staging-app` writer
role, and the app/cluster attachment is recorded. The schema-admin credential
is no longer the app secret. Writer login, CRUD, sequence use, and transaction
rollback passed against the synthetic restore database. `CREATE TABLE`,
`ALTER TABLE`, and `DROP TABLE` were denied with error `42501`; the role has
no superuser, role-creation, database-creation, or RLS-bypass privileges.
Fly's writer role covers data in the staging cluster; this is not per-database
isolation. Keep unrelated applications/production data out of this cluster.
The runtime `fly-db` schema is not yet rolled out and app startup is unverified.

## Failures found and fixed

1. Fly's default `pg_stat_monitor` and `pgaudit` extension objects caused the
   empty-target guard to reject a fresh database. The shared guard now accepts
   only catalog-proven members of `plpgsql`, `pg_stat_monitor`, and `pgaudit`,
   plus their internal implementation dependencies. Unknown extensions and
   unrelated objects still fail. Database-name/environment/host checks remain.
2. The startup catalog query returned PostgreSQL `name[]` columns, which the
   Node driver did not decode into the arrays required by schema validation.
   Explicit `attname::text` casts fix both local and referenced column arrays.

## Verified results

- `pnpm --filter @workspace/db run test:postgres-integration`: 2/2 passed on
  `kindred_rehearsal_pg_adapter_20260926`, with the live test enabled. Includes
  nine transactional rejection probes for custom tables, views, sequences,
  a function sharing an extension-function name, enum/domain/range/composite
  types, and a custom schema. Probes roll back before application schema setup.
  CRUD, identity sequences, conflict updates, nested rollback, daily quotas,
  leases, and close/reinitialize checks passed.
- `pnpm --filter @workspace/db run test:postgres-adapter`: 9/9 passed.
- `pnpm --filter @workspace/db run test:postgres-rehearsal`: 11/11 passed.
- `pnpm run typecheck`: passed, including script type checks.
- A disposable MongoDB replica set held the existing rehearsal fixture, with
  separate conversations/messages added for its second account. The actual
  `readMongoSnapshot` and `replayRehearsal` functions migrated all 20 collections
  into `kindred_rehearsal_migration_20260926`. Dry-run rolled back schema and
  rows; explicit write preserved 23 rows, stable IDs and both separate histories.
- PostgreSQL 16 `pg_dump --format=custom --no-owner --no-acl --schema=public`
  produced a synthetic backup encrypted with AES-256-CBC and PBKDF2 (200,000
  iterations). No plaintext dump was written to disk. The temporary encrypted
  artifact and random key are local rehearsal artifacts, not production
  rollback custody or retention evidence.
- Restore into `kindred_rehearsal_restore_20260926` used `pg_restore`
  with `--exit-on-error --single-transaction --no-owner --no-acl --no-comments`.
  The TOC excluded only creation of the already-existing provider-owned
  `public` schema. Earlier attempts stopped on schema creation/comment
  permissions; the transaction attempt rolled back. No application object was
  excluded from the successful restore.
- Restore assertions compared every row in all 20 collections (23 rows), all
  47 public indexes, and all 55 public constraints. A cross-owner message
  insert failed with foreign-key error `23503`; generated conversation IDs
  continued beyond the migrated IDs.

## Delegation and retained resources

OpenCode drafted the guard in an isolated worktree. Its initial SQL error and
out-of-scope export were rejected; Codex reduced and corrected the patch before
live validation. Devin independently reviewed a separate checkout read-only.
Its proposed uppercase `I` dependency exemption was not adopted: PostgreSQL 16
[documents internal dependency `i`](https://www.postgresql.org/docs/16/catalog-pg-depend.html),
and the observed defaults passed without broadening the exemption.

The original `kindred_rehearsal_pg_adapter_20260925` now contains the schema
from the failed startup-catalog test, with no test-user seed. The new adapter
database retains its schema after successful synthetic-row cleanup. Migration
and restore databases retain synthetic fixtures for review. These are database
objects within the existing cluster, not new paid cluster resources. Dispose
of them after their evidence/retention disposition; do not treat them as runtime
application databases. Local backup artifacts are in the operator's temporary
`kindred-pg-restore-artifacts` directory; the key is mode 0600 in that directory.

## Gates still open

A production-like source snapshot, production backup custody/retention, a
runtime schema rollout and application startup with the writer role, Auth0 staging build
and runtime settings, test-safe service credentials, full app staging acceptance,
AI Gateway and spending controls, and production cutover are not verified here.
Coolify and MongoDB remain in place. Synthetic database evidence does not pass
sign-in, payments, reminders, voice, or actual account-history acceptance.
