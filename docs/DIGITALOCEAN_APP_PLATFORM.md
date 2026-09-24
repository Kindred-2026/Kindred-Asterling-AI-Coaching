# DigitalOcean App Platform deployment runbook (superseded)

**Status:** non-selected reference. DigitalOcean rejected the available
payment methods, so Railway is now the recommended candidate. No DigitalOcean
app or database was created. Do not use this runbook as the current deployment
target; see [Railway deployment candidate](RAILWAY_DEPLOYMENT.md). Coolify stays
available until the replacement and rollback gates pass.

## Deployment shape

Kindred is one production web service, not a separate Next.js frontend and API.
The canonical Vite build writes browser assets to
`artifacts/kindred-coach/dist/public`; the Express server serves those assets
and `/api/**` from the same origin. The repository root `build` script
typechecks the workspace and builds the app packages. The root `start` script
starts the Express service, which requires `PORT`, initializes its configured
database before listening, starts reminders after listen, and shuts down on
`SIGTERM`/`SIGINT`.

Create one App Platform **Node.js buildpack web service** from the canonical
GitHub repository, using `/` as the source directory so both frontend and API
files remain available at runtime. Let the Node.js buildpack run the root
`pnpm build` script, which builds the actual production packages. Set the App
Platform `build_command` to
`node artifacts/kindred-coach/scripts/validate-auth0-build.mjs`; DigitalOcean
runs this custom command after the buildpack build, so it verifies that the
three public Auth0 build variables were available to that build without
recompiling the application. Use `pnpm start` as the run command. Set HTTP port
`8080`; App Platform supplies `PORT` from that setting. Configure the HTTP
health check as `/api/healthz/db`
so a ready instance must reach its current database. The current application
runtime is MongoDB; do not point `DATABASE_URL` at PostgreSQL until the
PostgreSQL adapter is integrated and all database-backed checks pass.

Use App Platform's native Node.js buildpack; the repository's historical
Dockerfile is not the new deployment path. Use the fixed 1 GiB App Platform
plan (`apps-s-1vcpu-1gb-fixed`) for the initial cost estimate. It is fixed-size
and does not provide manual scaling; evaluate that tradeoff from staging
telemetry before choosing a larger plan.

## Configuration and secrets

Set the following as **build-time** environment variables because the Vite app
embeds these public identifiers in its browser bundle:

- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`

Set runtime configuration on the API component. At minimum, confirm
`NODE_ENV=production`, `APP_PUBLIC_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, and
the active database configuration. Keep runtime credentials encrypted in App
Platform's environment settings; never add their values to this repository,
App Spec files, build arguments, or logs. `VITE_*` values are public and must
never contain secrets.

Before the PostgreSQL runtime is ready, the current code requires
`MONGODB_URI` and `MONGODB_DATABASE`. Keep the existing production database
available while using an isolated, access-restricted staging database for
testing. After the PostgreSQL adapter is integrated, define its exact runtime
connection contract in code and update `SECRET_INVENTORY.md`; then bind the
DO database's **private** connection value to the app service. Do not create a
production database component from an unreviewed template or copy a database
connection into GitHub Actions.

Add feature credentials only when their feature is enabled: Helcim API and
webhook values for payments, Resend for required email, the selected OpenAI
compatible provider credential for AI, and any actively used SMS or voice
credentials. Keep `AI_PROVIDER`, model, and gateway URL as non-secret config.
Route the chosen OpenAI-compatible provider through the Cloudflare AI Gateway
endpoint. Keep personalized-conversation caching off. Disable payload
collection in Gateway settings and retain the existing per-request
`cf-aig-collect-log-payload: false` header; this request header does not set
upstream model-provider retention. Set rate/spend limits and per-user quotas,
then verify a synthetic coaching request in staging without sending real
health information.

## Cutover order

1. Finish the PostgreSQL adapter and integration tests for every operation
   used by the application, including quota updates, leases, webhooks,
   transactions, ownership-scoped reads, exports, deletions, and account
   cascades. `lib/db/migrations-postgres/` is currently only a rehearsal
   schema; `pg-mem` is not proof of real PostgreSQL transaction or restore
   behavior.
2. Provision a non-production managed PostgreSQL database and an isolated
   staging App Platform service. Restore a consistent MongoDB backup into the
   rehearsal source, migrate to an empty PostgreSQL target, and compare exact
   values, counts, ownership, indexes, unique constraints, and sequences.
   Repeat the rehearsal from a clean backup and verify restoring PostgreSQL.
3. Test staging sign-in and separate user histories, chat/AI, payment checkout
   and webhook replay, Calendar's retained/disconnect behavior, reminders,
   voice, export, deletion, health endpoints, and rollback. Never join or merge
   accounts by email.
4. Verify the real monthly invoices, database storage/backups, app bandwidth,
   AI inference, retained services, and provider plans. Configure DigitalOcean
   billing alerts and Cloudflare/provider spend controls. The under-$50 target
   excludes payment-processing fees and is an acceptance measurement, not a
   promise based on list prices.
5. Only after an approved staging result, deploy the exact reviewed `main`
   commit to DigitalOcean and verify `/api/healthz`, `/api/healthz/db`, a fresh
   Auth0 sign-in, authenticated API access, a synthetic AI response, payment
   webhook handling, and account-history invariants. Preserve encrypted
   rollback backups and the previous Coolify/MongoDB release through the
   declared rollback window.
6. Retire Coolify and MongoDB only after the rollback window expires and a
   retained backup has been restored successfully.

## Published starting prices

As checked 2026-09-24, the fixed 1 GiB App Platform container is listed at
$10/month and the 1 GiB Standard managed PostgreSQL plan at $15.15/month, for a
$25.15 infrastructure subtotal before AI, backups, bandwidth overages, taxes,
email, authentication, monitoring, and other active services. Cloudflare AI
Gateway core features are currently listed as free, but upstream inference is
usage-billed; persistent log limits apply, and Gateway logs can include prompts
and responses. These are published prices, not Kindred's measured invoice.

Recheck current documentation and the account bill before provisioning:
[App Platform spec](https://docs.digitalocean.com/products/app-platform/reference/app-spec/),
[Node.js monorepos](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-monorepo/),
[App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/),
[managed PostgreSQL pricing](https://www.digitalocean.com/pricing/managed-databases),
[App Platform environment variables](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/),
[AI Gateway pricing and log limits](https://developers.cloudflare.com/ai-gateway/reference/pricing/).
