# PostgreSQL migration rehearsal (not an application runtime)

MongoDB remains the API's only database. This isolated schema covers every
field and all 20 collections in `src/mongoSchema.ts`, with explicit SQL types,
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

For a separately authorized, local, non-production rehearsal, the CLI expects
server-side `MONGODB_REHEARSAL_URI`, `MONGODB_REHEARSAL_DATABASE` (named
test/dev/fixture/rehearsal, different from the configured runtime source),
`PG_REHEARSAL_URL` and
`NODE_ENV=test` or `development`. It requires no `.env` file loader. The
optional `DATABASE_URL` is used only to reject an identical application target.
The default invocation is `corepack pnpm --filter @workspace/db
rehearse:mongo-to-postgres`; the explicit staging-write invocation appends
`-- --write --non-production`.

## Barriers before any runtime selector or cutover

- Implement and integration-test the complete PostgreSQL query API: conditions,
  sorting, pagination, projections, multi-row writes/deletes, targeted conflict
  handling, conditional upserts, transactions, counts, leases, health and close.
- Convert direct Mongo calls in `dailyQuota.ts` (atomic quota and refund) and
  `routes/subscription.ts` (legacy webhook lookup within the transaction).
  Migration never correlates users by email.
- Validate source/target row digests and exact values in addition to counts,
  integer sequence continuation, all index/constraint behavior on real
  PostgreSQL, real transaction rollback, restore/replay and incremental changes.
  The `pg-mem` fixture does **not** prove PostgreSQL rollback or restore.
- Independently review DigitalOcean TLS/configuration, deployment and rollback
  gates before allowing `DB_BACKEND=postgres`. Keep Snyk scanning active.
