# PostgreSQL schema baseline (rehearsal only)

MongoDB remains the default API database. The code has an opt-in PostgreSQL
runtime adapter, but this schema is still applied only to isolated rehearsal
databases until real PostgreSQL integration, migration, restore and production
cutover gates pass. It covers every field and all 20 tables in `src/mongoSchema.ts`, with explicit SQL types,
indexes, uniqueness and owner relationships. It is for an **empty, dedicated**
database, never the historical PostgreSQL database or the application DB.
Kindred `users.id` remains text; Auth0 subject, Clerk ID and email are attributes,
not migration joins. Integer IDs retain their source values. Dates are exact
`YYYY-MM-DD`; timestamps are `timestamptz`; text arrays and JSONB stay typed.
Cross-owner habit/medication children are prohibited by composite foreign keys.
Messages inherit ownership through their conversation.

The old SQL baseline at `d84b262^` had different nullability and omitted
current Auth0 identity fields; this schema is isolated instead of mutating it.
Any old nullable owner with an orphaned/null user ID fails validation; no
history is reassigned. The Mongo schema does not declare a unique email
case-insensitive constraint; the rehearsal preserves its exact-case unique
index plus a lower(email) lookup index, not an email identity linkage.

`src/postgresRehearsal.ts` validates all rows before SQL inserts and uses one
transaction. The CLI reads Mongo collections in a read-only snapshot transaction
in batches of 500, caps the total at 250,000 rows and 64 MiB of serialized
source rows (fails closed above either), verifies the target is empty, creates
the schema inside the transaction, compares per-table counts, then **rolls
back by default**. It never updates Mongo. It does not print document content,
connection strings or tokens; output is table counts only. For the optional
staging-write mode, the target database name must start with
`kindred_rehearsal_`, `NODE_ENV` must be `test` or `development`, and both
`--write --non-production` must be passed. Do not run either mode against a
production source or provider system. No live CLI execution was part of this
change.

To run only the synthetic fixture (Node 24, pnpm 10.28.1):

```text
corepack pnpm --filter @workspace/db test:postgres-rehearsal
```

For the separately gated real-PostgreSQL adapter integration suite, provide an
empty, disposable database whose name begins `kindred_rehearsal_`. It refuses
to proceed unless `NODE_ENV=test` and the exact confirmation value below are
set. It also rejects a target sharing the configured runtime `POSTGRES_URL`
host, requires the target to have no user objects, and never drops or truncates
database objects. The run creates the checked-in rehearsal schema and deletes
only its UUID-scoped synthetic rows; that schema remains, so provision a fresh
rehearsal database for another run. Keep the URL out of shell history, source
control and logs. This suite covers the adapter only; it does not prove the
complete application migration, data reconciliation or backup restore.

```sh
NODE_ENV=test \
POSTGRES_INTEGRATION_CONFIRM=I_UNDERSTAND_THIS_IS_A_DISPOSABLE_REHEARSAL_DATABASE \
POSTGRES_INTEGRATION_URL='<secret-injected PostgreSQL URL>' \
corepack pnpm --filter @workspace/db test:postgres-integration
```

The live test is skipped when `POSTGRES_INTEGRATION_URL` is absent; the
database-free guard tests still run. Do not treat that skip as real-server
integration evidence.

For a separately authorized, local, non-production rehearsal, the CLI expects
server-side `MONGODB_REHEARSAL_URI`, `MONGODB_REHEARSAL_DATABASE` (named
test/dev/fixture/rehearsal, different from the configured runtime source),
`PG_REHEARSAL_URL` and
`NODE_ENV=test` or `development`. It requires no `.env` file loader. The
optional `POSTGRES_URL` is used to reject any target on the runtime database host,
even when the database name differs. When `POSTGRES_URL` is not configured, the
operator must independently verify the target host is non-production.
The default invocation is `corepack pnpm --filter @workspace/db
rehearse:mongo-to-postgres`; the explicit staging-write invocation appends
`-- --write --non-production`.

## Barriers before staging verification or production cutover

- The code includes an opt-in `DATABASE_PROVIDER=postgres` runtime selector,
  PostgreSQL query adapter, database-backed leases, sequence identities and
  database-neutral quota and legacy identity lookup. Mongo remains the default.
  `POSTGRES_URL` must point only at the reviewed Kindred database.
- Run the complete app integration suite against real PostgreSQL for conditions,
  sorting, pagination, projections, multi-row writes/deletes, targeted conflict
  handling, conditional upserts, nested transactions, counts, leases, health,
  close, quotas, webhook identity fallback, ownership, exports and deletion.
- Validate source/target row digests and exact values in addition to counts,
  integer sequence continuation, all index/constraint behavior on real
  PostgreSQL, real transaction rollback, restore/replay and incremental changes.
  The `pg-mem` fixture does **not** prove PostgreSQL rollback or restore.
- Verify Fly TLS/configuration, deployment and rollback gates before setting
  `DATABASE_PROVIDER=postgres`. Keep Snyk scanning active.
