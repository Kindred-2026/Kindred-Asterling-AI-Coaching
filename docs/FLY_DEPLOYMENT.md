# Fly.io deployment and migration runbook

**Status:** Fly.io is the selected hosting provider. The user confirmed account
and payment access only. No Fly app, Managed Postgres cluster, or deployment has
been reported. This repository has not independently verified the account or
payment method.
Keep the current Coolify and MongoDB release available through the cutover and
rollback gates.

## Application deployment shape

Deploy one app in the Toronto region (`yyz`) and place its database in the same
region. Fly's current region list marks Toronto as available for both Apps and
Managed Postgres. Confirm the Managed Postgres cluster is provisioned in `yyz`
before binding it to the app.

Reuse the existing repository-root `Dockerfile` as-is for the first deployment;
do not introduce another image/build path. The current Dockerfile builds the
React/Vite client and Express API into one runtime image, listens on port 8080,
and runs as a non-root user. Keep the Fly `internal_port` at `8080` and set the
HTTP health check to `/api/healthz/db`. The existing image-level check only
tests `/api/healthz`; the Fly readiness check should also verify database
connectivity.

Supply the three public Auth0 build identifiers through the Fly build
configuration: `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and
`VITE_AUTH0_AUDIENCE`. They are public browser configuration, not secrets. Keep
runtime credentials in Fly's secret store; do not put values in `fly.toml`,
GitHub Actions, or chat. Build only a reviewed commit and inspect the resulting
browser bundle for the expected Auth0 domain/audience before staging checks.

The production application still uses MongoDB. Do not bind Fly Managed
Postgres as `DATABASE_URL` until the PostgreSQL runtime adapter exists and the
full API integration checks pass. Keep the current `MONGODB_URI` and
`MONGODB_DATABASE` configuration in the Fly staging app until the adapter and
migration are ready.

## Cost and data controls

Fly Managed Postgres Basic is currently listed at $38/month, plus provisioned
database storage at $0.28/GB/month. Fly lists high availability, backups, and
connection pooling as included Managed Postgres features. Application compute,
network egress, and any other retained services are additional. The database
baseline alone leaves little room under Kindred's $50/month target, so compare
actual billing before production cutover; do not claim the target is met from
published starting prices.

Fly's current Managed Postgres documentation lists security patches, version
upgrades, and customer-facing alerting as features still under development.
Before production, confirm Fly's current maintenance responsibility and put an
operator-owned patch/version review and database health alert path in place.
Do not assume these database operations are fully automated.

Managed Postgres includes `pgvector`, which leaves a future path for vector
similarity features without adding another database service. Defer vector
search until it has a product use case and coaching-quality/privacy review.

Toronto provides a Canadian region for the Fly app and database. Keep both in
`yyz` to avoid unnecessary inter-region traffic and latency. Confirm the actual
data location, backups, AI-provider processing location, and cross-border
disclosures before accepting live user data. Cloudflare AI Gateway does not
make the upstream model provider Canadian-hosted.

## Migration and cutover gates

1. Create the Fly organization/app and Managed Postgres resources in Toronto
   (`yyz`) after confirming the region and billing in the dashboard. Keep
   credentials in Fly's secret store. The user has confirmed account/payment
   access only; no resources have been reported as created.
2. Deploy the existing app image to staging from the reviewed commit. Verify
   build arguments, health check, Auth0 sign-in, database connectivity, logs,
   and resource use. Keep production traffic on Coolify.
3. Finish the PostgreSQL runtime adapter and integration checks for every
   application query and write path, including quotas, leases, subscriptions,
   webhooks, ownership-scoped reads, exports, account deletion, and reminders.
4. Rehearse a consistent MongoDB backup, data/ownership reconciliation,
   PostgreSQL migration, encrypted backup, and restore with non-production
   data. Preserve stable Kindred user IDs and separate histories; never merge
   accounts by email.
5. Verify sign-in, account history separation, chat/AI, payments and webhook
   replay, Calendar, reminders, voice, exports, deletion, and restore in
   staging. Disable caching of personalized conversations and minimize AI
   prompt/response retention.
6. Compare actual Fly invoices plus Cloudflare, model inference, Auth0, email,
   monitoring, and other retained services against the under-$50 target,
   excluding payment processing. Add spend alerts and provider/model quotas.
7. Cut over only after staging acceptance. Verify production health, fresh
   sign-in, authenticated API, synthetic AI response, webhook handling, and
   distinct account histories. Keep encrypted rollback backups and the prior
   Coolify/MongoDB release through the rollback window.
8. Retire Coolify and MongoDB only after the rollback window ends and a
   retained backup has been restored successfully.

References checked 2026-09-24: [Fly.io regions](https://fly.io/docs/reference/regions/),
[Managed Postgres and pricing](https://docs.fly.io/mpg),
[Fly.io resource pricing](https://fly.io/docs/about/pricing/),
[Fly Launch](https://fly.io/docs/flyctl/launch/), and
[Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/).
