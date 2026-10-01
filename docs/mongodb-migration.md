# PostgreSQL to MongoDB migration

> **Historical cutover record.** The PostgreSQL → MongoDB migration was completed
> in a prior phase. This document is retained for audit, restoration of the
> rollback tools, and future reference. The steps in it are one-time operational
> procedures, not part of normal development or release flow.

MongoDB is Kindred's runtime database. PostgreSQL is used only as the read-only
source for the one-time migration and remains untouched until the cutover has
been proven and its rollback window has closed.

## Safety gates

- Use a MongoDB replica set or Atlas cluster. Kindred relies on transactions for
  multi-document writes and account deletion.
- Take and restore-test a PostgreSQL backup before the final migration.
- Give `POSTGRES_SOURCE_URL` a read-only login. Never add it to the application
  container or Coolify runtime variables.
- Give the API MongoDB `readWrite` only on `MONGODB_DATABASE`. Use a separate
  credential with MongoDB's `read` role for reporting or manual inspection.
- Use a new, empty `MONGODB_MIGRATION_DATABASE` for every rehearsal and final
  run. The migration refuses a non-empty target and does not drop databases.
- Keep application writes stopped for the entire final export. This workflow
  deliberately uses a fresh full snapshot after the freeze; it does not merge
  a delta into the rehearsal database or pretend to provide online CDC.

## Rehearsal

From a trusted migration environment containing this repository:

```bash
export POSTGRES_SOURCE_URL='postgresql://read-only-source/...'
export MONGODB_URI='mongodb+srv://migration-writer/...'
export MONGODB_DATABASE='kindred-current-runtime'
export MONGODB_MIGRATION_DATABASE='kindred_migration_rehearsal_YYYYMMDD'
export MONGODB_MIGRATION_REPORT_PATH='./mongodb-migration-rehearsal.json'
pnpm --filter @workspace/db run migrate:from-postgres
```

The exporter opens one PostgreSQL `REPEATABLE READ READ ONLY` transaction and
streams rows in bounded batches. Its allowlist is derived from Kindred's current
runtime schema: exactly 20 product collections plus `_counters`. It refuses a
missing table or mismatched logical identity constraint. PostgreSQL primary
keys are accepted, as is the existing unique `(user_id, date)` identity
constraint on `daily_usage`. It does not copy `sessions`,
`schema_migrations`, `privacy_migration_orphans`, `mongodb_mirror_outbox`, or
other legacy/migration infrastructure. Existing logical keys remain `_id`,
including composite keys.

PostgreSQL `DATE` values are parsed and rechecked as exact `YYYY-MM-DD` strings.
This is required for Kindred's local-day queries. PostgreSQL `timestamp without
time zone` values are interpreted deterministically as UTC; timezone-aware
timestamps retain their absolute instant.

The command succeeds only after all of these checks pass:

- source and target row counts match for every table;
- an order-independent SHA-256 digest matches for every table;
- all date-only fields retain exact calendar strings and the final collection
  set is exactly 20 collections;
- user, conversation, habit, medication, and administrative references have no
  orphans;
- every runtime unique/index constraint can be created; and
- integer ID counters are advanced to the migrated maxima.

If a pre-copy validation failure created only empty allowlisted collections, the
same rehearsal target may be retried. The exporter verifies that every existing
collection is expected and contains zero documents before reusing it. Any
unexpected collection or document still forces a new target database.

Explicitly review the report entries for critical identity and customer data:
`users`, `conversations`, `messages`, `medications`, `medication_logs`,
`medication_schedule_entries`, `subscriptions`, and `processed_webhooks`. A
successful digest validates every record, not only a sample.

The JSON report is created with owner-only permissions. Retain it with the
backup/cutover record, but do not commit it because table names and counts are
operational metadata.

## Backup and restore rehearsal

First restore the PostgreSQL source backup into an isolated PostgreSQL database
and run the migration against that restore. A provider snapshot is acceptable
only after an actual restore succeeds. For a portable custom-format backup:

```bash
pg_dump --format=custom --dbname="$POSTGRES_SOURCE_URL" --file=kindred-postgres.dump
pg_restore --dbname="$POSTGRES_RESTORE_URL" --no-owner --no-privileges kindred-postgres.dump
```

Both URLs must name non-production-safe targets for the rehearsal; never restore
over the source. After the MongoDB rehearsal migration succeeds, use MongoDB
Database Tools 100.18.0 to prove the candidate can also be restored:

```bash
mongodump --uri="$MONGODB_URI" \
  --db="$MONGODB_MIGRATION_DATABASE" \
  --archive=kindred-mongodb.archive --gzip

export MONGODB_VALIDATION_SOURCE_DATABASE="$MONGODB_MIGRATION_DATABASE"
export MONGODB_VALIDATION_RESTORE_DATABASE="kindred_restore_rehearsal_YYYYMMDD"
mongorestore --uri="$MONGODB_URI" --archive=kindred-mongodb.archive --gzip \
  --nsFrom="$MONGODB_MIGRATION_DATABASE.*" \
  --nsTo="$MONGODB_VALIDATION_RESTORE_DATABASE.*"
pnpm --filter @workspace/db run validate:restore
```

The restore target must be a new empty database. The validator is read-only and
requires the same exact 20-collection set, row count, and digest on both sides.
Retain command logs and validation output with the migration report.

## Final cutover

1. Schedule a maintenance window, stop Kindred application workers, webhooks,
   reminders, and API writes, and record the freeze time.
2. Confirm both the PostgreSQL and MongoDB backup/restore rehearsals above.
3. Run the exporter after the freeze into a brand-new empty final MongoDB
   database. Do not reuse or incrementally patch the rehearsal database.
4. Keep writes frozen and review the generated report: 20 product collections,
   `_counters`, exact counts/digests, date validation, references, and indexes
   must all pass. Because the final full snapshot starts after the freeze, there
   is no un-copied incremental write window. If an online or incremental cutover
   is ever required, stop and design audited CDC rather than using this command.
5. Prove counter continuity in staging by creating one synthetic record for each
   integer-ID collection and confirming its ID is greater than the migrated
   maximum; remove only those synthetic records afterward.
6. Set the application secrets to `MONGODB_URI` and the validated final
   `MONGODB_DATABASE`. Remove PostgreSQL variables from the application runtime.
7. Deploy the MongoDB application build, then verify `/api/healthz`,
   `/api/healthz/db`, sign-in, coaching chat, journaling, medications, reminders,
   subscription status/checkout, webhook processing,
   account export, and account deletion using synthetic accounts.
8. Monitor errors and reminder/webhook delivery through the agreed observation
   window before reopening normal traffic.

## Rollback and PostgreSQL retirement

Rollback is a deployment operation: stop writes, redeploy the pre-MongoDB
release, restore its PostgreSQL runtime secret, and verify the same signed-in
flows. PostgreSQL must therefore remain private, backed up, and unchanged during
the rollback window. Writes accepted only by MongoDB after cutover require an
explicit reverse-migration decision before rolling back.

Do not delete the PostgreSQL resource, revoke its backup access, or remove its
restorable backups until the Founder approves retirement after production proof.
If the historical mirror experiment was ever installed on that PostgreSQL
database, separately verify and retire the `kindred_mongodb_mirror_change`
triggers, mirror functions, and `mongodb_mirror_outbox` only after the rollback
retention period. Their removal is a privileged, audited maintenance operation,
not part of this application migration. PostgreSQL retirement is intentionally
not automated by this repository.
