# Operations tools inventory

Inventory of the MongoDB / identity tools in this repository, taken from their
**actual implementation**, plus a list of suspected unused or superseded assets
kept as future-review candidates. Nothing here is deleted.

## MongoDB tools

All commands run from a trusted environment containing this repository. All of
them require their environment variables and none of them is safe on its own —
review read/write behaviour below before use.

| Tool | Package script | Implementation | Read/WRITE behaviour |
| ---- | -------------- | -------------- | -------------------- |
| Initialize database | `pnpm --filter @workspace/db run initialize` | `lib/db/scripts/initialize-mongodb.ts` → `initializeDatabase()` in `lib/db/src` | **Writes** schema indexes to `MONGODB_DATABASE` then pings. No dry-run. Intended for an empty production database before switching traffic; not part of container startup. |
| Migrate from PostgreSQL | `pnpm --filter @workspace/db run migrate:from-postgres` | `lib/db/scripts/migrate-from-postgres.ts` | **Writes** a new target database: opens the PostgreSQL source in one `REPEATABLE READ READ ONLY` transaction, streams rows, refuses a non-empty target, builds indexes + counters, validates references, and writes a report file (`MONGODB_MIGRATION_REPORT_PATH` or a timestamped default, mode `0600`). No dry-run; requires reviewed migration/rollback evidence. |
| Validate a Mongo restore | `pnpm --filter @workspace/db run validate:restore` | `lib/db/scripts/validate-mongodb-restore.ts` | **Read-only**: compares `MONGODB_VALIDATION_SOURCE_DATABASE` vs `MONGODB_VALIDATION_RESTORE_DATABASE` with order-independent digests per expected collection; fails on any row/digest mismatch. |
| Link Auth0 identities | none (run `tsx lib/db/scripts/link-auth0-identities.ts`) | `lib/db/scripts/link-auth0-identities.ts` | **Validates by default, writes only with `--apply`.** Reads a reviewed mapping file (`--mapping`), requires `--database` to match `MONGODB_DATABASE`, checks each mapping (user exists, clerk match, no conflicting Auth0 identity) inside a transaction, then applies `auth0UserId` writes only when `--apply` is passed. Without `--apply` it is a dry run (no writes). Never run against production without separately approved identity-migration and rollback evidence. |
| Inspect Clerk instance | `pnpm --filter @workspace/scripts run clerk:admin` | `scripts/src/clerk-admin.ts` | **Read-only** network inspection of the Clerk instance via the Backend API (`GET` only, requires `CLERK_SECRET_KEY`). No local writes. |

Rule of thumb from the implementation: the only always-read-only commands are
`validate:restore` and `clerk:admin`. Everything else either writes or needs an
explicit apply flag — never describe a mutating command as safe/read-only.

Documented procedures: `docs/mongodb-migration.md` (PostgreSQL cutover) and
`docs/auth0-migration.md` (Auth0 rollout) are historical records retained for
audit and rollback reference; their one-time steps happened out-of-band and are
not part of normal operations.

## Suspected unused / superseded assets (future-review candidates)

Kept in place, not removed; these are candidates for an archive decision in a
later, scope-refreshed phase:

- **Root loose scratch files** — `patch.diff`, `plan.txt`, `pr.json`, `pnpm.yml`,
  `seo_strategy.md`, `test-db.ts`, `test_db.ts`, `test_perf.ts`, `test_plan.sh`
  are tracked but referenced nowhere (no import, script, or doc references).
- **EKS deployment assets** — `infrastructure/eks/*`, `deploy/{karpenter,keda,metrics-server-values.yaml}`,
  `scripts/{deploy-eks-autoscaling.sh,verify-eks.sh}` predate the Coolify
  production path and are unused by it (`docs/COOLIFY_DEPLOYMENT.md` names the
  root Dockerfile as the only supported production artifact).
- **`scripts/test-local.sh`** — legacy local script not referenced by any
  package script.

Do not remove any of the above as part of Phases 4–7 planning; refresh that scope
against the completed Auth0/MongoDB work first.