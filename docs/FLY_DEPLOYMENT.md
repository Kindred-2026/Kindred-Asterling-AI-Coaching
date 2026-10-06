# Fly.io deployment and migration runbook

**Status (2026-09-26):** PostgreSQL staging is deployed and healthy at
<https://kindred-asterling-ai-coaching.fly.dev/>. Release v1 uses reviewed source
`29277d252f19daf489018fc0b14c1d74cab8d852`, with the explicit deployment override
`DATABASE_PROVIDER=postgres`; `fly.toml` now persists that setting. One 1 GB
shared-CPU machine runs in `yyz`. Both health endpoints return 200 and the
homepage renders. Fresh sign-in and authenticated reads later passed after the
owner registered the `fly.dev` Auth0 callback (see the evidence record below);
sign-out and two-account isolation remain open. AI was disabled for release v1.
Since then `fly.toml` sets `AI_PROVIDER = 'anthropic'` (step 6a) and the
custom-domain `APP_PUBLIC_URL` (step 8). On 2026-10-03 a later deploy with
that `APP_PUBLIC_URL` was live, and the custom domain was served by this Fly app
through Cloudflare ([public check](#public-read-only-check--2026-10-03)).
On 2026-10-05 a deploy with the domain-split settings (`docs/DOMAIN_SPLIT.md`)
was live: both hosts redirect marketing and legal pages to
`kindred-asterling-ai.xyz` ([public check](#public-read-only-check--2026-10-05)).
On 2026-10-06 the app and the marketing site served builds of `main` at
`f67ba35`, and the redirected legal pages loaded on the marketing domain
([public check](#public-read-only-check--2026-10-06)).
Payments are not enabled. This is not full staging
acceptance or a production cutover. The old server/MongoDB was not
re-inspected; the cutover gates below are still open.

The empty `fly-db` database in `kindred-staging-db-20260924` was initialized
atomically after the empty-target guard passed. Runtime catalog checks passed
and the writer role has access to all 21 app tables. No production data was
copied. [Execution evidence](POSTGRES_STAGING_EVIDENCE.md) records the synthetic
migration/restore checks and this first deployment.

On 2026-09-25 at 22:42 UTC, Fly Launch attempt `2083359` built commit
`ed5feeb` and passed Fly config validation and dependency installation, but the
frontend build stopped because `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and
`VITE_AUTH0_AUDIENCE` were not supplied. No image or app deployment resulted.
At that failed build, the app had no saved configuration, machine, or runtime
secrets. Use the CLI build-secret procedure below; the Fly Launch UI attempt did
not pass these required build values.

## Staging deployment procedure

Use the existing app `kindred-asterling-ai-coaching` and Managed Postgres cluster
`w76geop28dnrplk4`, both in Toronto (`yyz`). Do not create another app, cluster,
or MongoDB smoke database. Production still runs on the existing server/MongoDB.

1. Record the exact reviewed, post-merge source SHA from a clean checkout.
2. Use `DATABASE_PROVIDER=postgres` and the writer-role `POSTGRES_URL` in Fly's
   secret store. Never copy the production MongoDB URI into staging.
3. For a new empty staging database only, apply every
   `lib/db/migrations-postgres/NNNN_*.sql` file in filename order (currently
   `0001_rehearsal_core.sql` then `0002_drop_calendar_connections.sql`) in one
   transaction after `assertEmptyTarget` passes. Run `initializePostgresDatabase` before committing
   and verify the app writer can access every runtime table. Use schema-admin
   credentials only for this operator step. Do not rerun the schema on the
   initialized database. The already-initialized `fly-db` was created with the
   Calendar table; remove it with the one-off `drop:calendar-connections` job in
   `lib/db/migrations-postgres/README.md` (whether it has run on staging is not
   recorded here). This staging schema remains subject to full application
   acceptance and is not authorization for a production migration.
4. Required runtime names are `POSTGRES_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`,
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `SUBSCRIPTION_OWNER_IDS`, plus
   `ANTHROPIC_API_KEY` while `fly.toml` sets `AI_PROVIDER = 'anthropic'`.
   `NODE_ENV=production`, `PORT=8080`, and `APP_PUBLIC_URL` come from `fly.toml`.
   Store credentials only in Fly secrets; use standard input for imports.
5. Supply public `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and
   `VITE_AUTH0_AUDIENCE` separately to the existing Dockerfile's BuildKit mounts.
   Runtime secrets do not automatically supply build values. Recover these
   public identifiers from the authorized application configuration; never
   supply a client secret to the browser build.
6. Deploy with one machine explicitly. The default Fly deploy HA setting can
   create a spare machine and exceed the approved one-machine staging scope:

   ```sh
   flyctl deploy --app kindred-asterling-ai-coaching --config fly.toml \
     --ha=false --remote-only \
     --build-secret "VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN" \
     --build-secret "VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID" \
     --build-secret "VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE"
   ```

   Read values interactively or from the authorized provider into process memory;
   never paste literal values into shell history, source control, or evidence.
   Alternatively, run the manual **Deploy to Fly.io** GitHub Action
   (`.github/workflows/fly-deploy.yml`). It needs a `FLY_API_TOKEN` secret
   (`fly tokens create deploy`) and `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`,
   `VITE_AUTH0_AUDIENCE` variables in the `fly-staging` GitHub environment.
   Deploys started from the Fly dashboard without these build values fail at
   the frontend build step; `fly.toml` has a commented `[build.args]` block for
   that case.
6a. AI uses Claude through the Anthropic API (`AI_PROVIDER=anthropic` in
   `fly.toml`). Set the key **before** deploying, or the app refuses to start:

   ```sh
   fly secrets import --app kindred-asterling-ai-coaching --stage
   # then type ANTHROPIC_API_KEY=<your key>, press Enter, then Ctrl-D
   ```

   `ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT` in `fly.toml` choose the model and
   effort. To turn AI off again, set `AI_PROVIDER = 'disabled'`.
7. Record image digest, release, machine count, region, and the effective
   `DATABASE_PROVIDER`. Verify both health endpoints and browser rendering.
8. `fly.toml` now sets `APP_PUBLIC_URL = 'https://kindred-asterling-ai-coaching.com'`
   and `TRUST_PROXY_HOPS = '2'`. Deploy it only after the Cloudflare domain and
   Fly certificate are live ([Cloudflare setup](CLOUDFLARE_SETUP.md) steps 1–7);
   after that deploy the `fly.dev` address no longer works for signed-in use.
   Auth0 must allow callback and logout URL
   `https://kindred-asterling-ai-coaching.com/` and web origin
   `https://kindred-asterling-ai-coaching.com` (plus the `www.` forms if used).
   The `fly.dev` entries registered for release v1 apply only to a build whose
   `APP_PUBLIC_URL` is the `fly.dev` URL. Keep existing production entries. Current code returns to the origin root, not `/login/callback`.
   Verify fresh sign-in and authenticated API behavior with test identities.

Keep `auto_stop_machines='off'` and one 1 GB shared-CPU machine running while
reminders use the in-process scheduler. Autostart does not replay missed ticks.
`fly.toml` enables Anthropic AI; for an AI-disabled health smoke, deploy with
`--env AI_PROVIDER=disabled`. Payments are not enabled. This health smoke does
not pass AI, payment, or other feature acceptance. Reminder checks must use
controlled test destinations even when an existing Resend credential is reused.

### Separate AI acceptance phase

Set `AI_PROVIDER=openai`, `OPENAI_BASE_URL` to the Cloudflare AI Gateway OpenAI
provider endpoint, and a test-safe upstream key/model. Verify requests carry
`cf-aig-collect-log-payload: false` and `cf-aig-skip-cache: true`; confirm Gateway
payload logging is disabled. Metadata logs and upstream retention need separate
review. Keep application quotas, upstream budgets, and Gateway spend limits
active; do not submit real coaching histories during testing.

## Staging pass/fail acceptance

Record each result as **PASS**, **FAIL**, or **BLOCKED**, with timestamp,
operator, and a redacted evidence reference. Run these checks against the staging origin only:

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
| Calendar removal | **PASS** after verifying that `/api/calendar/*` returns 404, the app has no Calendar page or link, and no `GOOGLE_CLIENT_*`, `GOOGLE_CALENDAR_REDIRECT_URI` or `CALENDAR_*` secret is set. The integration was permanently removed on 2026-10-01; see [the Calendar sunset](releases/calendar-sunset.md) for history. | **FAIL** for any reachable Calendar route, UI entry point, or leftover Calendar secret. |
| Reminders | **PASS** after scheduling a reminder for a synthetic account, verifying expected staging delivery only to controlled test addresses, and confirming retries/duplicate job creation do not cause duplicate reminders. Test delivery destinations must be controlled test addresses only, never real users or uncontrolled recipients. Keep at least one Fly machine running with `auto_stop_machines = "off"`; record configuration and running machine status. A stopped machine misses scheduler ticks and autostart does not replay them. | **FAIL** for missing/incorrect delivery, cross-account delivery, delivery to an uncontrolled destination, duplicate jobs/notifications, or failure to maintain the required running machine. **BLOCKED** if safe staging scheduling or controlled test destinations are unavailable. |
| Voice (if retained) | If voice remains a product path, **PASS** after exercising its staging flow with synthetic input and verifying expected output and account/privacy isolation. If removed, **PASS** only with a documented sunset disposition and verification that the retired path is unavailable as intended. | **FAIL** for a retained flow that fails or exposes another account's data, or an undocumented/incomplete sunset. **BLOCKED** if retained but safe staging credentials/configuration are unavailable and no sunset disposition is documented. |
| Account export, deletion, and restore | **PASS** after exporting and reviewing synthetic-account data, deleting a synthetic account and verifying its data is removed as specified, then restoring a non-production backup and verifying account identity and ownership separation. | **FAIL** for incomplete export/deletion, cross-account data, identity/ownership changes, or failed restore. **BLOCKED** until a real non-production restore rehearsal and any required safe staging configuration are available; do not use real user data. |
| PostgreSQL and restore | Live adapter and synthetic migration/restore have passed. Rerun every applicable application acceptance check against staging PostgreSQL and rehearse a production-like snapshot before cutover. | Synthetic database evidence alone is not full staging or production migration acceptance. |
| Cost and limits | Record observed Fly app/volume resources, current usage and bill/estimate source; compare all-in recurring and usage costs with the `$50/month` target. Record configured spend alerts and AI/provider quotas and thresholds. | Missing measured source, absent spend limits/alerts, or forecast over target = FAIL for spend readiness; do not claim target met from list prices. |

Keep production traffic on Coolify/MongoDB. Do not proceed to migration or
cutover based on this staging runbook alone. Every required product path above
must be **PASS** before production cutover; **BLOCKED** is not a pass and must
be resolved or the path explicitly retired with a documented sunset disposition.

### Evidence record — 2026-09-26

| Evidence item | Record |
| --- | --- |
| Reviewed SHA and deploy timestamp | `29277d252f19daf489018fc0b14c1d74cab8d852`; release v1 completed 2026-09-26 06:01:41 UTC; runtime PostgreSQL override applied |
| Fly app name, configured region, internal port | `kindred-asterling-ai-coaching`; machine `847635cee76978`, started in `yyz`, shared CPU x1, 1024 MB, port 8080 |
| Managed Postgres cluster | `kindred-staging-db-20260924`, `w76geop28dnrplk4`, v2 ready, Basic, 20 GB provisioned, 2.95 GB used, one replica; app attachment recorded with a dedicated writer role. Live adapter and synthetic migration/restore now passed in dedicated rehearsal databases; see [execution evidence](POSTGRES_STAGING_EVIDENCE.md) |
| Image digest and Fly release ID | v1; `deployment-01M3E4SPJTZGHKRT1PXA15YA46`; digest `sha256:0aee52c4f1e8c7028647a25ac9b2e12c76e6ff2dcaf28a7c8bf264f476b1864e` |
| `/api/healthz` and `/api/healthz/db` results; DB endpoint identity (no URI) | Both 200; runtime binding confirms PostgreSQL, staging writer, `fly-db`, and the intended cluster pooler; Fly service check passing |
| Auth0 fresh sign-in, sign-out, authenticated API result (tenant name/reference only) | **PASS for sign-in and authenticated reads:** owner saved the additive Fly root callback/logout/origin entries and completed Google sign-in. `/api/auth/user`, affirmations, Today dashboard, streaks, mood trend, and medications returned 200; authentication survived reload. Unauthenticated `/api/auth/user` previously returned 401. Sign-out remains untested |
| Synthetic application persistence | **PASS for one controlled staging account:** created `STAGING TEST — persistence check` with synthetic description and one target day; POST habits returned 201. Habits, entries, and streak reads returned 200; the habit remained after reload. The labeled fixture remains in staging |
| Redacted app-log review and reference | Server listening on 8080; reminder scheduler started. One initial boot health-check failure recovered to passing. No application error observed in the inspected startup log window |
| Two synthetic account IDs/labels and separate-history result (no personal data) | Database rehearsal passed for `kindred-owner-a` / `kindred-owner-b`. Actual two-account authenticated application isolation remains **BLOCKED**: owner reports no second controlled Google account. Single-account persistence does not satisfy this gate |
| PostgreSQL integration / restore gate | **PASS, synthetic database scope only** (2026-09-26): live adapter, 20-collection migration, encrypted backup/restore, row/index/constraint comparison, ownership and sequences. [Evidence](POSTGRES_STAGING_EVIDENCE.md). Production-like snapshot and full app acceptance remain open |
| Reminder scheduler | Startup confirmed; one started machine, autostop off. Controlled reminder delivery still untested |
| Cost measurement date, source, current estimate/actual and `$50/month` comparison | Published estimate: MPG Basic $38 + v2 storage at $0.28/GB-month; latest Fly status reported 2.95 GB used (~$0.83/month). One 1 GB app machine now running; actual compute billing not inspected. Billing/invoice not verified. About $44.75/month after one 1 GB app machine runs, before network, AI, backups, and other services. |
| Spend alert and provider/model quota thresholds | Cloudflare `kindred-staging` gateway created: authentication required, logs off, cache off, retries off, 10 requests/minute, shared $1/month sliding spend limit enabled, Zero Data Retention enabled for Unified Billing. Workers AI remains on Standard billing. Spend-limit enforcement and alerts have not been exercised; the limit is eventually consistent, not a guaranteed exact charge ceiling |
| AI configuration | Fly remains `AI_PROVIDER=disabled`. Account-scoped Workers AI Read token created with owner approval and staged as `OPENAI_API_KEY` in Fly; direct synthetic API calls authenticated successfully. Existing production remains configured for Bedrock. Named gateway routing requires `CLOUDFLARE_AI_GATEWAY_ID=kindred-staging`; the app has not yet passed an AI-enabled chat check |
| Initial model probes | Same repository coaching instructions with synthetic profile, five synthetic scenarios per model, app-equivalent `store:false` and privacy headers. Workers AI GPT-OSS-120B returned HTTP 200 but three replies were truncated/unusable at its default 256 output-token limit; do not select it with current settings. Llama 3.3 70B returned four complete text replies and one expected habit tool call (0.56–2.91 seconds). This small direct-provider probe is not full application, clinical, or production acceptance |
| Funded comparison | GPT-4.1 mini is listed at $0.40/M input and $1.60/M output tokens with ZDR available. Owner approved one $10 credit purchase plus $0.50 fee; the saved card was declined, so no successful top-up is claimed. Owner is updating payment details. Funded comparison and final model selection remain pending |

### Public read-only check — 2026-10-03

Unauthenticated `curl`/`openssl` checks from 04:20 to 04:35 UTC against
`https://kindred-asterling-ai-coaching.com` and
`https://kindred-asterling-ai-coaching.fly.dev`. No sign-in, form, or AI request
was made. Gate statuses above are unchanged.

| Check | Observed result |
| --- | --- |
| Health | On both hosts `/api/healthz` returned 200 `{"status":"ok"}` and `/api/healthz/db` returned 200 `{"status":"ok","database":"connected"}`. The endpoint does not show which database it reached |
| Custom domain routing | Custom-domain responses carry `server: cloudflare` and `via: 1.1 fly.io`. Their ETags, `Last-Modified` and asset hashes match `fly.dev`, so the same Fly app serves both hosts. Whether the old server still gets any traffic was not checked |
| Deployed build | A deploy newer than release v1 is live. Static files are dated 2026-10-03 03:25:55 UTC. `/api/auth/user` with origin `https://kindred-asterling-ai-coaching.com` returned 401 with a matching `Access-Control-Allow-Origin`. With the `fly.dev` origin it returned 500 with no CORS header, which matches the `APP_PUBLIC_URL` in `fly.toml`. Served `index.html`, the six `/legal/*/` pages and `assets/index-CL37htpO.js` are byte-identical to a local `build:deployment` of `main` at `b2ce37e`; frontend source has not changed since `2a3d986`. The Fly release ID, image digest and API source SHA are not public, so **Reviewed release** stays unverified |
| Public and legal pages | `/`, `/login` and `/legal/{privacy,terms,ai-disclosure,cookies,health-disclaimer,marketing-consent}/` returned 200 on both hosts. `/legal/privacy` and `/legal/terms` first redirect (301) to the trailing-slash path. On the custom domain, Cloudflare answered non-browser requests for some other paths (`/privacy`, `/api/auth/user`, `/api/calendar/status`) with a 403 managed challenge (`cf-mitigated: challenge`) |
| Security headers | Both hosts send the CSP from `securityHeaders.ts` (`script-src 'self'`, `frame-ancestors 'none'`, Auth0 tenant in `connect-src`/`frame-src`). Both also send HSTS `max-age=31536000; includeSubDomains`, `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`. `fly.dev` sends Helmet's `Referrer-Policy: no-referrer`, but the custom domain sends `same-origin` because Cloudflare replaces the header. Cloudflare also rewrites the Google Fonts links to `/cf-fonts/` and injects an inline challenge script with no nonce, which `script-src 'self'` does not allow |
| TLS | Custom domain: Let's Encrypt `YE1` certificate for `kindred-asterling-ai-coaching.com` and `*.kindred-asterling-ai-coaching.com`, expiring 2026-12-20 (78 days). `fly.dev`: `*.fly.dev`, expiring 2026-11-19 (47 days). `www.` could not be checked from this network |
| Calendar removal | The bundle and legal pages carry the removal text. Unauthenticated `/api/calendar/status` on `fly.dev` returns 401 because authentication runs before routing, so the 404 criterion is still unverified |

### Public read-only check — 2026-10-05

Unauthenticated `curl`/`openssl` checks from 13:03 to 13:06 UTC against
`https://kindred-asterling-ai-coaching.com` and
`https://kindred-asterling-ai-coaching.fly.dev`. No sign-in, form, or AI request
was made. Gate statuses above are unchanged. Where this differs from the
2026-10-03 check, this one is current.

| Check | Observed result |
| --- | --- |
| Health | On both hosts `/api/healthz` returned 200 `{"status":"ok"}` and `/api/healthz/db` returned 200 `{"status":"ok","database":"connected"}` |
| Deployed build | A new deploy is live. Static files are dated 2026-10-05 12:37:50 UTC. Served `index.html`, `/pricing/`, `assets/index-D9p40Vic.js` and `assets/index-Bcvm6LN-.css` are byte-identical to a local `build:deployment` of `main` at `1ced84c`, built with the public Auth0 values from the served bundle and `VITE_MARKETING_SITE_URL=https://kindred-asterling-ai.xyz` from `fly.toml`. The custom domain serves the same files, except for the HTML that Cloudflare rewrites. The Fly release ID, image digest and API source SHA are not public, so **Reviewed release** stays unverified |
| Domain split | Server redirects from `MARKETING_SITE_URL` are live on both hosts. `/about`, `/science`, `/legal/*`, `/legal-documents/*` and `/llms.txt` return 301 to the same path on `https://kindred-asterling-ai.xyz`. On `fly.dev`, `/sitemap.xml` also returns 301. `/robots.txt` returns `Disallow: /`. `/`, `/login`, `/signup` and `/pricing/` return 200. The marketing domain is outside this check's network allowlist, so this check did not confirm that the redirected legal and privacy pages load there |
| Auth and CORS | On `fly.dev`, `/api/auth/user` returned 401 with a matching `Access-Control-Allow-Origin` for origin `https://kindred-asterling-ai-coaching.com`. With the `fly.dev` origin it returned 500 with no CORS header, which is unchanged from 2026-10-03. On the custom domain, Cloudflare still answers non-browser requests for `/api/auth/user`, `/api/calendar/status`, `/sitemap.xml` and `/dashboard` with a 403 managed challenge (`cf-mitigated: challenge`) |
| Security headers | Both hosts send the CSP from `securityHeaders.ts`, HSTS `max-age=31536000; includeSubDomains`, `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`. `fly.dev` sends Helmet's `Referrer-Policy: no-referrer` and `X-XSS-Protection: 0`. The custom domain sends `same-origin` and `1; mode=block`, because Cloudflare rewrites both headers. Cloudflare still rewrites the Google Fonts links to `/cf-fonts/` and injects an inline challenge script with no nonce |
| TLS | Custom domain: Let's Encrypt `YE1` certificate for `kindred-asterling-ai-coaching.com` and `*.kindred-asterling-ai-coaching.com`, expiring 2026-12-20 (76 days). `fly.dev`: `*.fly.dev`, expiring 2026-11-19 (45 days) |
| Calendar removal | Unauthenticated `/api/calendar/status` on `fly.dev` still returns 401, so the 404 criterion is still unverified |

### Public read-only check — 2026-10-06

Unauthenticated `curl`/`openssl` checks from 01:36 to 01:40 UTC against
`https://kindred-asterling-ai-coaching.com`,
`https://kindred-asterling-ai-coaching.fly.dev` and the marketing domain
`https://kindred-asterling-ai.xyz` (plus `www.`). No sign-in, form, or AI
request was made. Gate statuses above are unchanged. Where this differs from
the 2026-10-05 check, this one is current.

| Check | Observed result |
| --- | --- |
| Health | On both app hosts `/api/healthz` returned 200 `{"status":"ok"}` and `/api/healthz/db` returned 200 `{"status":"ok","database":"connected"}` |
| Deployed app build | Another deploy is live. Static files are dated 2026-10-06 00:23:27 UTC. On `fly.dev`, `index.html`, `/pricing/`, `assets/index-BYx9HQHO.js` and `assets/index-Bcvm6LN-.css` are byte-identical to a local `build:deployment` of `main` at `f67ba35`, built with the same settings as the 2026-10-05 check. The custom domain serves the same asset name. **Reviewed release** stays unverified for the reasons given on 2026-10-05 |
| Marketing site | On `kindred-asterling-ai.xyz` and `www.kindred-asterling-ai.xyz`, `/`, `/about/`, `/science/`, `/pricing/` and the six `/legal/*/` pages returned 200. `/legal-documents/privacy-policy.pdf`, `robots.txt`, `sitemap.xml` and `llms.txt` also returned 200. `/legal/privacy` returns 307 to the trailing-slash path. These pages, `assets/index-kXP--RnR.js`, the CSS and the privacy PDF are byte-identical to a local marketing build of `f67ba35` (the `VITE_APP_URL` build command in `docs/DOMAIN_SPLIT.md`). The app domain still returns 301 to these paths |
| Security headers | The app hosts are unchanged from 2026-10-05. The marketing domain sends the `_headers` CSP: the app's policy with `connect-src 'self'`, no Auth0 origin and no `frame-src`. It also sends HSTS `max-age=31536000; includeSubDomains`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` |
| TLS | Custom domain expires 2026-12-20 (75 days) and `*.fly.dev` expires 2026-11-19 (44 days). The marketing domain uses a Google Trust Services `WE1` certificate for `kindred-asterling-ai.xyz`, `www.` and `*.www.`, expiring 2027-01-03 (89 days) |
| Calendar removal | Unauthenticated `/api/calendar/status` on `fly.dev` still returns 401, so the 404 criterion is still unverified |

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

The PostgreSQL adapter passed live adapter checks and synthetic migration/restore
in the staging cluster. The initial Fly deployment selects PostgreSQL directly;
full application acceptance and production-like migration remain separate gates.
Keep MongoDB as the production runtime and rollback source until cutover passes.

## Cost and data controls

Fly Managed Postgres Basic is currently listed at $38/month, with v2 database
storage billed by usage at $0.28/GB per 30-day month. The latest status check
reports about 2.95 GB used; actual invoices are not verified. Fly lists high
availability, backups, and connection pooling as included Managed Postgres
features. Application compute, network egress, and any other retained services
are additional. The estimated app and database subtotal leaves little room
under Kindred's $50/month target, so compare actual billing before production
cutover; do not claim the target is met from published starting prices.

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

1. Keep the existing Fly app and Managed Postgres staging cluster in `yyz`.
   Runtime credentials belong in Fly secrets. Verify billing controls separately.
2. Deploy the reviewed image and verify health, Auth0 sign-in, resource use, and
   logs. Keep production traffic on the existing server.
3. Run the full acceptance matrix against PostgreSQL, including every retained
   application path. Adapter tests and synthetic restore are necessary but do
   not alone establish full application or production migration readiness.
4. Rehearse a consistent MongoDB backup, data/ownership reconciliation,
   PostgreSQL migration, encrypted backup, and restore with non-production
   data. Preserve stable Kindred user IDs and separate histories; never merge
   accounts by email.
5. Verify sign-in, account history separation, chat/AI, payments and webhook
   replay, Calendar removal (routes return 404, no Calendar secrets),
   reminders, voice, exports, deletion, and
   restore in staging. Use test-safe OpenAI-compatible credentials routed
   through Cloudflare AI Gateway for the separate AI-enabled test phase; the
   initial AI-disabled smoke is not an AI pass. Reminder deliveries must target
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
[Cloudflare AI Gateway pricing and logging](https://developers.cloudflare.com/ai-gateway/reference/pricing/),
[Cloudflare AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/),
and [Cloudflare AI Gateway custom metadata](https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/).
