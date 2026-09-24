# Fly.io deployment and migration runbook

**Status:** Fly.io is the selected hosting provider. Read-only CLI checks on
2026-09-24 verified access to the `personal` organization and found no apps or
Managed Postgres clusters. `fly platform regions` lists Toronto (`yyz`) as
available for Managed Postgres. No deployment is in place. Account-specific
capacity, pricing, billing, and payment details have not been inspected.
Keep the current Coolify and MongoDB release available through the cutover and
rollback gates.

## First-time staging runbook (operator-executed; not yet run)

All steps marked **[DASHBOARD/PROVIDER ACCESS - NOT EXECUTED]** require the
Kindred owner to use Fly, Auth0, and the configured database/provider consoles.
No app, credential, deployment, or billing action has been performed as part of
this documentation. Use a disposable non-production database and test identities
only. Never point this staging app at production data.

The first MongoDB-backed Fly smoke deployment below is only an initial
production-mode smoke against a disposable, non-production MongoDB database. It
is not migration readiness or the full target staging gate. Once a real isolated
PostgreSQL endpoint exists, configure this same staging app for PostgreSQL and
rerun the full acceptance matrix below against PostgreSQL, including a real
non-production backup restore rehearsal.

### 1. Review and prepare

1. Record the reviewed commit SHA (`git rev-parse HEAD`) and confirm the
   working tree is clean. Build and deploy that exact SHA; do not deploy a
   moving branch name.
2. **[DASHBOARD/PROVIDER ACCESS - NOT EXECUTED]** Confirm access to the Fly
   organization, Toronto (`yyz`) app region, billing controls, an isolated
   non-production MongoDB endpoint, and the authorized Auth0 tenant/application.
   Confirm the database is reachable from the Fly app and is not production.
3. Choose a globally unique Fly app name yourself; examples in commands below
   use `YOUR_UNIQUE_STAGING_APP` as a placeholder and must be replaced. Keep
   `yyz` as the region and `8080` as the internal port. From the repository root,
   create the app configuration without deploying:

   ```sh
   fly launch --no-deploy --name YOUR_UNIQUE_STAGING_APP --region yyz --dockerfile Dockerfile
   ```

   Review the generated configuration. Set `internal_port = 8080` and the
   readiness check path to `/api/healthz/db`; do not add or commit credentials.
   The API starts an in-process reminder scheduler once per minute in
   production (`artifacts/api-server/src/index.ts` and
   `artifacts/api-server/src/lib/reminderScheduler.ts`). Fly Launch may configure
   autostop; while reminders are in scope for staging and initial production,
   explicitly set `auto_stop_machines = "off"` and operate at least one running
   machine. A stopped app cannot execute reminder ticks; autostart only starts a
   machine when a request arrives and does not restore missed scheduler ticks.
   This requirement remains until reminders are moved to separately operated,
   durable work. Record the effective autostop setting and machine count/state
   from Fly configuration and status at each staging check, and include the
   continuously running machine's actual compute cost in the cost record; it
   trades scale-to-zero savings for scheduler availability.
   Preserve the root `Dockerfile` as the only image/build path. **[DASHBOARD/
   PROVIDER ACCESS - NOT EXECUTED]** Verify the resulting app's region is `yyz`
   in Fly before deploying.

### 2. Configure names (use real values from authorized provider accounts)

The required runtime names for this initial MongoDB-backed production-mode
image are `PORT`, `DATABASE_PROVIDER`, `MONGODB_URI`, `MONGODB_DATABASE`,
`APP_PUBLIC_URL`, `SUBSCRIPTION_OWNER_IDS`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `AUTH0_DOMAIN`, and `AUTH0_AUDIENCE`. Set `PORT` to `8080`
and `DATABASE_PROVIDER` to `mongo`. The `VITE_AUTH0_DOMAIN`,
`VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE` names are required public
build identifiers; they are not secret values. Use the same authorized Auth0
tenant/audience as the server configuration. Do not put their values in this
document, source control, shell command arguments, or chat.

`AI_PROVIDER` defaults to `ollama`, which requires `OLLAMA_BASE_URL` and
`OLLAMA_MODEL`; for the initial smoke with no configured AI service, use
`AI_PROVIDER=disabled`. Do not enable payments: leave `HELCIM_PAYMENTS_ENABLED`
unset or false. For a separate AI-enabled test phase only, set
`AI_PROVIDER=openai`, `OPENAI_BASE_URL` to the Cloudflare AI Gateway OpenAI
provider endpoint (`https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/openai`),
`OPENAI_API_KEY` to a test-safe upstream key, and `OPENAI_MODEL` to the selected
bare upstream model name. The API appends `/chat/completions` to the configured base URL.
Never use real user prompts or production credentials. Verify the deployed
configuration routes through the intended Gateway and that its payload logging
setting is disabled. In the existing provider implementation,
`cf-aig-collect-log-payload: false` and `cf-aig-skip-cache: true` are sent only
when requests are routed through the gateway (that is, when `OPENAI_BASE_URL` is
configured); verify both request behavior and Gateway settings before recording
an AI pass. Configure other optional integrations only when explicitly included
in test scope, with names and conditional requirements verified in
`SECRET_INVENTORY.md` and `artifacts/api-server/src/lib/validateConfig.ts`.

**[DASHBOARD/PROVIDER ACCESS - NOT EXECUTED]** Obtain values directly from the
authorized provider consoles or existing approved secret manager. Enter runtime
secrets interactively without placing values in shell history or process
arguments. For example, in Bash, `read -rsp` suppresses terminal echo; the
command line contains names/placeholders only, then `fly secrets import` reads
the values from standard input:

```sh
read -rsp 'Non-production MONGODB_URI: ' MONGODB_URI; printf '\n'
read -rp 'Non-production MONGODB_DATABASE: ' MONGODB_DATABASE
read -rsp 'RESEND_API_KEY: ' RESEND_API_KEY; printf '\n'
read -rp 'RESEND_FROM_EMAIL: ' RESEND_FROM_EMAIL
read -rp 'SUBSCRIPTION_OWNER_IDS: ' SUBSCRIPTION_OWNER_IDS
printf 'MONGODB_URI=%s\nMONGODB_DATABASE=%s\nRESEND_API_KEY=%s\nRESEND_FROM_EMAIL=%s\nSUBSCRIPTION_OWNER_IDS=%s\n' \
  "$MONGODB_URI" "$MONGODB_DATABASE" "$RESEND_API_KEY" "$RESEND_FROM_EMAIL" "$SUBSCRIPTION_OWNER_IDS" \
  | fly secrets import --app YOUR_UNIQUE_STAGING_APP
unset MONGODB_URI MONGODB_DATABASE RESEND_API_KEY RESEND_FROM_EMAIL SUBSCRIPTION_OWNER_IDS
```

Set the non-secret runtime configuration (`NODE_ENV`, `PORT`,
`DATABASE_PROVIDER`, `APP_PUBLIC_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, and
`AI_PROVIDER`) using Fly app configuration, with `NODE_ENV=production`,
`PORT=8080`, `DATABASE_PROVIDER=mongo`, and `AI_PROVIDER=disabled`. Add the
staging origin to the Auth0 application's allowed callback, logout, and web
origin lists as required by the actual tenant configuration.

### 3. Build and deploy reviewed image

**[DASHBOARD/PROVIDER ACCESS - NOT EXECUTED]** Supply the three public Auth0
build identifiers through the Fly build configuration or an approved
interactive configuration workflow; do not put their values in command
arguments or this runbook. Confirm Fly builds from the reviewed SHA and the
existing root Dockerfile. Deploy the app and record the resulting image digest
and release identifier from Fly. Inspect the built browser bundle in the
authorized environment to confirm the intended Auth0 domain/audience without
copying identifiers or other values into this document. If the deployed SHA,
region, port, or image cannot be confirmed, stop and mark deployment FAIL.

### 4. Staging pass/fail acceptance

Record each result as **PASS**, **FAIL**, or **BLOCKED**, with timestamp,
operator, and a redacted evidence reference. **[DASHBOARD/PROVIDER ACCESS - NOT
EXECUTED]** Run these checks against the staging origin only:

| Check | PASS criteria | FAIL / BLOCKED |
| --- | --- | --- |
| Reviewed release | Deployed release resolves to the reviewed SHA; image digest/release ID recorded. | Any mismatch or unverifiable identity = FAIL. |
| Region and listener | Fly reports `yyz`; configuration and running service use port `8080`. | Other region, port mismatch, or unverifiable setting = FAIL. |
| Basic health | `curl --fail --show-error https://<staging-host>/api/healthz` returns success and expected healthy response. | Non-success, unhealthy response, or timeout = FAIL. |
| Database health | `curl --fail --show-error https://<staging-host>/api/healthz/db` returns success; confirm it reflects a successful connection to the isolated non-production database. | Failed DB probe or inability to establish endpoint identity/connectivity = FAIL. |
| Auth0 | Complete a fresh test-user sign-in and sign-out; confirm authenticated API access uses the intended staging Auth0 tenant/audience. | Redirect/token/API failure or wrong tenant/audience = FAIL. |
| Logs | Review app startup and request logs for errors, crashes, repeated DB failures, and accidental sensitive-data logging. Save a redacted excerpt/reference. | Crash, unexplained errors, secrets/credentials or sensitive user data in logs = FAIL. |
| User-history separation | Use two distinct synthetic staging accounts; create one uniquely identifiable test history per account, then verify each account sees only its own history, including after sign-out/sign-in. Do not use real user data. | Cross-account visibility, merged identities, or inability to verify ownership = FAIL. |
| AI chat and privacy controls | The initial smoke must use `AI_PROVIDER=disabled` and does not exercise AI. For the separate AI-enabled phase, configure `AI_PROVIDER=openai`, `OPENAI_BASE_URL` to `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/openai`, `OPENAI_API_KEY` to a test-safe upstream key, and `OPENAI_MODEL` to the selected bare upstream model name. **PASS** only after a successful synthetic chat response is verified through that Gateway, payload logging is disabled in Gateway settings, and request headers `cf-aig-collect-log-payload: false` and `cf-aig-skip-cache: true` are verified. The provider sends these headers only when routed through the configured Gateway. | **FAIL** for the wrong route, failed chat, enabled payload logging, or missing/unverifiable headers/settings. **BLOCKED** until test-safe credentials and Gateway configuration are available. Never use real user prompts. |
| Helcim checkout and webhook replay | **PASS** only after completing checkout in the Helcim developer test account and verifying signed webhook validation, idempotent handling of duplicate delivery, and rejection/no duplicate effect on replay. The developer test account must be requested from Helcim. | **FAIL** for any live charge, invalid/missing signature accepted, duplicate side effect, or unverifiable replay behavior. **BLOCKED** until the developer test account and safe credentials/configuration are available; payments remain disabled. Never use live processing. |
| Calendar retirement | **PASS** after verifying the retirement notice, authenticated `410 calendar_retired` behavior for retired connect/upcoming routes, and retained user-initiated disconnect behavior, as recorded in [the Calendar sunset](releases/calendar-sunset.md). OAuth connection creation paths are retired and must not be used to create a test connection. Disconnect acceptance requires a synthetic, non-production account with an already-stored test connection/token. | **FAIL** for absent notice/410 behavior, broken disconnect, or an undocumented disposition change. If no synthetic non-production stored connection is available, mark **BLOCKED**; do not use production tokens. If product disposition changes, update the record and acceptance criteria before treating Calendar as active. |
| Reminders | **PASS** after scheduling a reminder for a synthetic account, verifying expected staging delivery only to controlled test addresses, and confirming retries/duplicate job creation do not cause duplicate reminders. Test delivery destinations must be controlled test addresses only, never real users or uncontrolled recipients. Keep at least one Fly machine running with `auto_stop_machines = "off"`; record configuration and running machine status. A stopped machine misses scheduler ticks and autostart does not replay them. | **FAIL** for missing/incorrect delivery, cross-account delivery, delivery to an uncontrolled destination, duplicate jobs/notifications, or failure to maintain the required running machine. **BLOCKED** if safe staging scheduling or controlled test destinations are unavailable. |
| Voice (if retained) | If voice remains a product path, **PASS** after exercising its staging flow with synthetic input and verifying expected output and account/privacy isolation. If removed, **PASS** only with a documented sunset disposition and verification that the retired path is unavailable as intended. | **FAIL** for a retained flow that fails or exposes another account's data, or an undocumented/incomplete sunset. **BLOCKED** if retained but safe staging credentials/configuration are unavailable and no sunset disposition is documented. |
| Account export, deletion, and restore | **PASS** after exporting and reviewing synthetic-account data, deleting a synthetic account and verifying its data is removed as specified, then restoring a non-production backup and verifying account identity and ownership separation. | **FAIL** for incomplete export/deletion, cross-account data, identity/ownership changes, or failed restore. **BLOCKED** until a real non-production restore rehearsal and any required safe staging configuration are available; do not use real user data. |
| PostgreSQL and restore | The initial MongoDB smoke is not migration readiness. Once a real isolated non-production PostgreSQL endpoint exists, set this same staging app to `DATABASE_PROVIDER=postgres`, then rerun every applicable acceptance check in this matrix and complete a real non-production backup restore rehearsal before marking the full target staging gate PASS. | Until that endpoint exists, PostgreSQL integration, full target staging acceptance, and restore remain **BLOCKED**. `pg-mem` does not establish equivalence and cannot pass this gate. |
| Cost and limits | Record observed Fly app/volume resources, current usage and bill/estimate source; compare all-in recurring and usage costs with the `$50/month` target. Record configured spend alerts and AI/provider quotas and thresholds. | Missing measured source, absent spend limits/alerts, or forecast over target = FAIL for spend readiness; do not claim target met from list prices. |

Keep production traffic on Coolify/MongoDB. Do not proceed to migration or
cutover based on this staging runbook alone. Every required product path above
must be **PASS** before production cutover; **BLOCKED** is not a pass and must
be resolved or the path explicitly retired with a documented sunset disposition.

### Evidence record (fill in only after the operator runs staging)

| Evidence item | Record |
| --- | --- |
| Reviewed SHA and deploy timestamp | Not run |
| Fly app name, verified region, internal port | Not run |
| Image digest and Fly release ID | Not run |
| `/api/healthz` and `/api/healthz/db` results; DB endpoint identity (no URI) | Not run |
| Auth0 fresh sign-in, sign-out, authenticated API result (tenant name/reference only) | Not run |
| Redacted app-log review and reference | Not run |
| Two synthetic account IDs/labels and separate-history result (no personal data) | Not run |
| PostgreSQL integration / restore gate | BLOCKED: real non-production PostgreSQL endpoint does not exist/has not been verified |
| Reminder scheduler | Not run; record `auto_stop_machines = "off"`, running machine count/status, and cost |
| Cost measurement date, source, current estimate/actual and `$50/month` comparison | Not run |
| Spend alert and provider/model quota thresholds | Not run |

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

The API now has an **opt-in PostgreSQL runtime adapter on this finalization
branch**. MongoDB remains the default (`DATABASE_PROVIDER=mongo`), and no Fly
staging app or real PostgreSQL integration has been verified. Do not select
`DATABASE_PROVIDER=postgres` or provision production credentials until the
adapter passes real PostgreSQL integration/restore checks and staging acceptance.
When that gate is reached, set `DATABASE_PROVIDER=postgres` and store
`POSTGRES_URL` as a server-only Fly secret. Keep MongoDB as the active runtime
and rollback source until cutover is verified.

The MongoDB-backed first smoke is not the target staging acceptance or migration
readiness gate. When an isolated real PostgreSQL endpoint is available, update
the same Fly staging app to `DATABASE_PROVIDER=postgres` and `POSTGRES_URL`, then
rerun the full acceptance matrix and real restore rehearsal before considering
the target gate complete. Keep at least one machine running with
`auto_stop_machines = "off"` while the in-process once-per-minute reminder
scheduler is in scope; include that always-on compute in observed cost. Fly
autostart does not recover scheduler ticks missed while stopped.

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
3. The first MongoDB-backed production-mode smoke uses only a disposable
   non-production MongoDB database and does not establish migration readiness.
   Once a real isolated non-production PostgreSQL endpoint exists, configure
   this same staging app to use PostgreSQL and rerun the full acceptance matrix,
   including the real restore rehearsal. Validate the branch's opt-in runtime
   adapter against real PostgreSQL, including every application query and write path, quotas, leases,
   subscriptions, webhooks, ownership-scoped reads, exports, account deletion,
   and reminders. The `pg-mem` tests are not a substitute for this gate.
4. Rehearse a consistent MongoDB backup, data/ownership reconciliation,
   PostgreSQL migration, encrypted backup, and restore with non-production
   data. Preserve stable Kindred user IDs and separate histories; never merge
   accounts by email.
5. Verify sign-in, account history separation, chat/AI, payments and webhook
   replay, Calendar retirement notice/410 and retained disconnect behavior
   (unless its disposition changes), reminders, voice, exports, deletion, and
   restore in staging. Use test-safe OpenAI-compatible credentials routed
   through Cloudflare AI Gateway for the separate AI-enabled test phase; the
   initial AI-disabled smoke is not an AI pass. Calendar disconnect acceptance
   requires a synthetic non-production stored connection; otherwise mark it
   BLOCKED and do not use production tokens. Reminder deliveries must target
   controlled test addresses only. Payments stay BLOCKED until a Helcim
   developer test account requested from Helcim is available. Never use live
   processing. Disable
   caching of personalized conversations and minimize AI prompt/response
   retention.
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
[Fly Launch](https://fly.io/docs/flyctl/launch/),
[Fly app configuration](https://fly.io/docs/reference/configuration/),
[Fly autostop/autostart](https://fly.io/docs/launch/autostop-autostart/),
[Helcim developer test accounts](https://devdocs.helcim.com/docs/developer-testing),
[Cloudflare AI Gateway OpenAI-compatible API](https://developers.cloudflare.com/ai-gateway/usage/providers/openai/),
[Cloudflare AI Gateway payload logging](https://developers.cloudflare.com/ai-gateway/observability/logging/), and
[Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/).
