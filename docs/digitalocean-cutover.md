# DigitalOcean App Platform and PostgreSQL cutover

**Status:** Target runbook only. The application still requires MongoDB and this
document does not attest that a DigitalOcean app, database, or Cloudflare
Gateway is provisioned. Keep the current Coolify/MongoDB deployment available
until all gates at the end of this document pass.

## Target service shape

Use a source-based Node.js 24 web service in DigitalOcean App Platform. Keep the
React/Vite UI and Express API in the existing monorepo; Express serves the
compiled UI and API from one web component. Configure a custom build command and
start command; do not introduce a new container workflow for this target.

Build command, after the App Platform builder selects Node.js 24:

```sh
corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm install --frozen-lockfile
pnpm --filter @workspace/kindred-coach run build:deployment
pnpm --filter @workspace/api-server run build
```

Start command:

```sh
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Set the web-service health check to `/api/healthz`. Keep the database readiness
check at `/api/healthz/db` in the release checklist. Confirm the deployment
platform preserves the workspace files the API resolves for static assets.
Before promoting, run a staging deploy and verify the service binds to the
platform-provided `PORT`.

`VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE` are public
build-time identifiers. Runtime credentials belong in App Platform encrypted
environment variables. Do not copy GitHub Actions secrets into the app unless an
active workflow specifically needs them.

## Database work before deployment

The current application data layer is MongoDB-specific. Do not attach the
managed PostgreSQL database to the current build and do not remove
`MONGODB_URI`. First restore the historical PostgreSQL schema as a reviewed
baseline, implement a PostgreSQL runtime adapter and a MongoDB-to-PostgreSQL
rehearsal, then validate all account-owned data and SQL constraints. The
existing PostgreSQL-to-MongoDB script is not a reverse migration tool.

The migration must preserve each internal Kindred user ID and all associated
history. Reconcile users, conversations, messages, assessments, body scans,
habits, medications, reminders, subscriptions, usage, webhook idempotency, and
audit records. Never join accounts by email. Write a value-free mapping report
with per-collection counts, unmatched owners, duplicate IDs, date/time
normalization, index/constraint checks, and backup restore results.

Use a distinct least-privilege PostgreSQL runtime user and an isolated rehearsal
target. Keep dump files encrypted and outside the repository. Rehearse from a
fresh source backup, restore the target, run the API and journey suites, and
repeat the restore before scheduling any maintenance window.

## Release and rollback gates

1. Confirm the App Platform app, deploy branch, owner, region, health check,
   build configuration, and encrypted runtime-variable store.
2. Complete the PostgreSQL runtime and migration rehearsal. Verify backup
   restore and account-history checks before staging.
3. In staging, verify Auth0 sign-in and two separate existing account
   histories; chat; Helcim payment and webhook idempotency; Calendar retirement
   or approved replacement; reminders; voice; deletion/export; and backup restore.
4. Configure Cloudflare AI Gateway with payload collection disabled in the
   dashboard and `cf-aig-collect-log-payload: false` in requests. Keep caching
   off for personalized chat. Confirm the selected upstream provider's
   retention, training, region, and spend controls. Test AI with synthetic data.
5. Deploy the exact reviewed SHA. Record health, sign-in, API/database,
   representative AI response, payment/webhook, and account-history evidence.
6. Keep encrypted MongoDB and application rollback assets through the agreed
   retention window. Retire Coolify and MongoDB only after successful
   production verification, a readable final backup, and rollback-window
   closure.

## Cost measurement

Record actual App Platform, PostgreSQL, storage, backup, egress, Cloudflare,
model inference, email, monitoring, SMS, voice, domain, and any remaining
provider charges monthly. The under-$50 target excludes payment processing but
includes all other recurring and usage charges. Configure AI quotas and spend
alerts before enabling hosted AI for users. Published starting costs and the
current estimate are in the [finalization record](FINALIZATION_RECORD.md).
