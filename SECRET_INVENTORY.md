# Kindred credential and configuration inventory

**Canonical source baseline:** `8352f14` (2026-09-25; after PR #185). Inventory includes the merged PR #155 PostgreSQL startup schema validation, finalization/Snyk IaC work, PR #164 GitHub cleanup, PR #170's type-safe adapter contract, and the subsequent finalization status updates. The tracked environment templates and runtime validator are unchanged since `4e22035` (2026-09-24), so their prior value-free audit remains applicable. **Owner for tracked active entries:** Kindred owner; the historical SSH-key finding below has an unknown owner. This is a value-free inventory of names and code requirements, not an attestation that an account, vault item, production deployment, or GitHub secret is populated. Evidence: root and `auth0-deploy/` `.env.example` **names only**, `artifacts/api-server/src/lib/validateConfig.ts`, application consumers, migration scripts, frontend build validator, `.github/workflows/`, and a redacted Gitleaks scan of the tree and history dated 2026-09-23. Secret values must never enter Git or browser `VITE_*` builds.

## Current repository contract

The API uses MongoDB by default (`DATABASE_PROVIDER=mongo`, `MONGODB_URI` / `MONGODB_DATABASE`) and has an opt-in PostgreSQL runtime path (`DATABASE_PROVIDER=postgres`, `POSTGRES_URL`). PostgreSQL has not been verified against a real server or selected in a deployed app. Auth0 uses `AUTH0_DOMAIN` / `AUTH0_AUDIENCE`; the frontend builds with three public Auth0 `VITE_*` values. Helcim is conditional on `HELCIM_PAYMENTS_ENABLED=true`. AI supports Ollama and an OpenAI-compatible provider; Cloudflare AI Gateway is the target route, not a verified live integration. Bedrock runtime support has been removed. Resend is a production startup requirement. These are **code contracts**, not verified facts about a live provider account or deployment. The repository has historical Coolify, Clerk, PostgreSQL-migration and Calendar artifacts; their presence does not prove those services are currently in use. No current production secret store can be confirmed from this checkout.

In the tables, **S** = secret (including sensitive identifiers such as access-key IDs/SIDs), **P** = public, browser-exposed configuration, **N** = non-secret server/build configuration. **Dev** `local secret` means developer-controlled secret injection (actual store unverified); `local config` means shell or local development configuration (including documented `.env.dev`; actual source unverified). **Current prod** `unverified` means the code requires/consumes the name but neither injection location nor population is established; `not runtime` means a job/legacy-only name. **Target** `Fly secret` / `Fly config` / `Fly build` means proposed Fly.io encrypted runtime secret / ordinary runtime setting / public build setting; `job secret` / `job config` means isolated operator migration/deployment job, not app runtime. These target locations are proposals, not deployed resources. **Status** `verify/rotate` means check use and rotate at cutover as appropriate, not already rotated; `verify/retain` means confirm configuration during cutover; `verify/remove` means confirm no remaining consumer or stored data before revocation/removal. Repository secret removal is recorded below; provider runtime rotations/removals are not claimed complete.

### Tracked local templates and 1Password references — checked 2026-09-24

The tracked files are `.env.example`, `.env.dev.example`, `auth0-deploy/.env.example`, and `.env.1password`. A redacted, in-memory classification found no literal values for entries marked **S** in those templates: secret fields are blank, placeholders, or unresolved `op://` references. The tracked 1Password template has references for `POSTGRES_SOURCE_URL`, `OPENAI_API_KEY`, `HELCIM_API_KEY`, `HELCIM_WEBHOOK_SECRET`, `HELCIM_CUSTOMER_REFERENCE_SECRET`, `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `ELEVENLABS_API_KEY`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_OAUTH_STATE_SECRET`, and `CALENDAR_TOKEN_ENCRYPTION_KEY`, plus legacy Clerk credentials. `MONGODB_URI` and `PG_SSL_CA` are empty in that template. The Auth0 deployment example uses a placeholder for `AUTH0_CLIENT_SECRET`. These references do not prove the corresponding 1Password items exist, resolve, are current, or are injected into any environment; no vault values were read.

| Name | Kind; consumer / purpose; requirement | Dev | Current prod | Proposed target | Status |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_PROVIDER` | N; API database adapter selector; optional, defaults to `mongo`; `postgres` selects opt-in PostgreSQL adapter | local config | unverified | Fly config; keep `mongo` until real PostgreSQL checks and staging gates pass | verify/retain |
| `MONGODB_URI` | S; API MongoDB connection; required; also migration/restore scripts | local secret or disposable DB | unverified | Fly secret until PostgreSQL cutover; then job secret if needed | verify/rotate, then verify/remove |
| `MONGODB_DATABASE` | N; API DB name; required | local config or disposable DB | unverified | Fly config until PostgreSQL cutover | verify/retain, then verify/remove |
| `POSTGRES_URL` | S; PostgreSQL API adapter connection; required only when `DATABASE_PROVIDER=postgres`; use a least-privilege app role | local secret / isolated PostgreSQL only | unverified; not deployed | Fly secret only after real PostgreSQL integration and staging acceptance | verify scope/rotate; do not activate before cutover gate |
| `NODE_ENV` | N; API mode, production gates, test behavior | local config | unverified | Fly config | verify/retain |
| `PORT` | N; API bind / Vite serve port; required by API and Vite serve | local config | unverified | Fly config/platform port | verify/retain |
| `APP_PUBLIC_URL` | P; server public origin, CORS, redirects/reminders; required in production | local config | unverified | Fly config | verify/retain |
| `BASE_PATH` | P; Vite base / server path; required for Vite serve, build defaults to `/` | local config | unverified | Fly build/config | verify/retain |
| `LOG_LEVEL` | N; API logger; optional | local config | unverified | Fly config | verify/retain |
| `TRUST_PROXY_HOPS` | N; Express proxy trust; optional | local config | unverified | Fly config | verify/retain |
| `AUTH0_DOMAIN` | P; API JWT issuer / CORS; required in production | local config | unverified | Fly config | verify/retain |
| `AUTH0_AUDIENCE` | P; API JWT audience; required in production | local config | unverified | Fly config | verify/retain |
| `VITE_AUTH0_DOMAIN` | P; browser Auth0 tenant; required by frontend build validator | local config | unverified | Fly build | verify/retain |
| `VITE_AUTH0_CLIENT_ID` | P; browser Auth0 public client ID; required by frontend build validator | local config | unverified | Fly build | verify/retain |
| `VITE_AUTH0_AUDIENCE` | P; browser API audience; required by frontend build validator | local config | unverified | Fly build | verify/retain |
| `AI_PROVIDER` | N; provider switch (Ollama default, OpenAI-compatible or disabled); optional | local config | unverified | Fly config; `openai` for Gateway route after approval | verify/retain or replace |
| `AI_REQUEST_TIMEOUT_MS` | N; chat request timeout; optional | local config | unverified | Fly config | verify/retain |
| `OLLAMA_BASE_URL` | N; Ollama endpoint; required when provider is Ollama | local config | unverified | Fly config only if retained | verify/remove if replaced |
| `OLLAMA_MODEL` | N; Ollama model; required when provider is Ollama | local config | unverified | Fly config only if retained | verify/remove if replaced |
| `OPENAI_API_KEY` | S; OpenAI provider auth; required when `AI_PROVIDER=openai` | local secret | unverified | Fly secret or gateway credential if chosen | verify/rotate or remove |
| `OPENAI_BASE_URL` | N; OpenAI-compatible endpoint override; optional | local config | unverified | Fly config; Cloudflare AI Gateway endpoint after account setup | verify/retain or replace |
| `OPENAI_MODEL` | N; OpenAI model; required when `AI_PROVIDER=openai` | local config | unverified | Fly config | verify/retain |
| `HELCIM_PAYMENTS_ENABLED` | N; payments feature gate; optional, CI explicitly disables | local config | unverified | Fly config | verify/retain |
| `HELCIM_API_KEY` | S; Helcim API; required if payments enabled | local secret | unverified | Fly secret | verify/rotate |
| `HELCIM_WEBHOOK_SECRET` | S; webhook signature; required if payments enabled | local secret | unverified | Fly secret | verify/rotate |
| `HELCIM_CUSTOMER_REFERENCE_SECRET` | S; customer reference HMAC; required if payments enabled | local secret | unverified | Fly secret | verify/rotate with compatibility plan |
| `HELCIM_YEARLY_PLAN_ID` | N; Helcim yearly plan; validator requires if payments enabled, no active API consumer found | local config | unverified | Fly config only if still needed | verify/remove |
| `HELCIM_LIFETIME_PRODUCT_ID` | N; legacy example product ID; no active consumer found | local config | unverified | none unless reintroduced | verify/remove |
| `HELCIM_YEARLY_CHECKOUT_URL` | P; subscription checkout URL; required if payments enabled | local config | unverified | Fly config | verify/retain |
| `HELCIM_LIFETIME_CHECKOUT_URL` | P; subscription checkout URL; required if payments enabled | local config | unverified | Fly config | verify/retain |
| `HELCIM_LIFETIME_INVOICE_PREFIX` | N; validator requires if payments enabled, no active API consumer found | local config | unverified | Fly config only if still needed | verify/remove |
| `HELCIM_PORTAL_URL` | P; validator requires if payments enabled, no active API consumer found | local config | unverified | Fly config only if still needed | verify/remove |
| `HELCIM_EMAIL_MIGRATION_FALLBACK` | N; temporary checkout identity fallback; optional | local config | unverified | Fly config only during migration | verify/remove |
| `SUBSCRIPTION_OWNER_IDS` | N; privileged owner IDs; required in production | local config (restrict access) | unverified | Fly secret (access-control list) | verify/retain |
| `SUBSCRIPTION_OWNER_EMAILS` | N; owner/admin email allowlist; optional | local config (restrict access) | unverified | Fly secret (access-control list) | verify/retain |
| `DAILY_CHAT_LIMIT` | N; daily quota override; optional | local config | unverified | Fly config | verify/retain |
| `RESEND_API_KEY` | S; server email; required in production | local secret | unverified | Fly secret | verify/rotate |
| `RESEND_FROM_EMAIL` | P; sender address; required in production | local config | unverified | Fly config | verify/retain |
| `TWILIO_ACCOUNT_SID` | S; SMS account identifier; optional as complete SMS group | local secret | unverified | Fly secret if SMS used | verify/rotate or remove |
| `TWILIO_AUTH_TOKEN` | S; SMS auth; optional as complete SMS group | local secret | unverified | Fly secret if SMS used | verify/rotate or remove |
| `TWILIO_PHONE_NUMBER` | N; SMS sender number; optional as complete SMS group | local config | unverified | Fly config if SMS used | verify/retain or remove |
| `ELEVENLABS_API_KEY` | S; voice API; optional | local secret | unverified | Fly secret if voice used | verify/rotate or remove |
| `VITE_SOCIAL_WHATSAPP_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |
| `VITE_SOCIAL_INSTAGRAM_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |
| `VITE_SOCIAL_THREADS_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |
| `VITE_SOCIAL_FACEBOOK_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |
| `VITE_SOCIAL_X_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |
| `VITE_SOCIAL_LINKEDIN_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |
| `VITE_SOCIAL_GOOGLE_BUSINESS_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |
| `VITE_SOCIAL_PATREON_URL` | P; browser social link; optional | local config | unverified | Fly build | verify/retain |

### Minimum access scope for secrets

The owner for every entry is **Kindred owner**. The following are minimum
permissions to request when provisioning credentials; no provider-side grant
was inspected. Where a provider does not offer granular scopes, use a dedicated
project/account credential and restrict it to the listed API, database, or
environment. Confirm the real grant and rotation owner in the provider before
cutover.

| Secret | Minimum required scope | Scope status |
| --- | --- | --- |
| `MONGODB_URI` | Application database read/write on the Kindred database only; no cluster administration. Migration/restore jobs use separate source-read and target-write identities. | Proposed; verify provider grant |
| `OPENAI_API_KEY` | Inference for the selected project/model only; no organization administration, billing, or key management. | Proposed; verify provider grant |
| `HELCIM_API_KEY` | Only the checkout, customer, subscription, and portal operations exercised by the API; no account administration if Helcim supports narrower credentials. | Proposed; verify provider grant |
| `HELCIM_WEBHOOK_SECRET` | Signature verification for Kindred's configured webhook endpoint only. | Endpoint-specific shared secret; verify rotation |
| `HELCIM_CUSTOMER_REFERENCE_SECRET` | Local HMAC signing/verification for stable customer references; no provider API access. | App-only secret; verify rotation compatibility |
| `RESEND_API_KEY` | Send email from the verified Kindred sender/domain only; no account, domain, or API-key administration. | Proposed; verify provider grant |
| `TWILIO_ACCOUNT_SID` | Identify the dedicated Kindred messaging subaccount/service only; do not use a parent-account credential. | Proposed; verify provider grant |
| `TWILIO_AUTH_TOKEN` | SMS send/status operations for the Kindred messaging service only; no account administration. | Proposed; verify provider grant |
| `ELEVENLABS_API_KEY` | Voice generation for the selected project/voice only; no workspace administration. | Proposed; verify provider grant |
| `POSTGRES_SOURCE_URL` | Read-only access to the isolated migration source database. | Job-only; do not place in app runtime |
| `POSTGRES_RESTORE_URL` | Create schema and write data only in the isolated rehearsal target; no production access. | Job-only; not currently provisioned |
| `MONGODB_MESSAGE_OWNERSHIP_URI` | Read/write access only to an isolated non-production MongoDB restore used for message-owner backfill; never use production credentials. | Temporary staging/rehearsal job only; remove after validation and rollback window |
| `AUTH0_CLIENT_SECRET` | Auth0 Deploy CLI machine-to-machine scopes limited to the explicitly managed tenant resources; no user impersonation or runtime API access. | Exact Deploy CLI scopes require tenant review |
| `CLERK_SECRET_KEY` | Read-only Clerk user/identity inspection only while legacy account reconciliation is authorized. | Legacy-only; exact grant and continued need unverified |
| `CLERK_WEBHOOK_SECRET` | Verify signatures for a legacy Clerk webhook only if that endpoint is still intentionally operated. | Unmounted code; remove after migration/rollback review |
| `GOOGLE_CLIENT_SECRET` | No new scope: retired Calendar integration. Retain only for an approved token-disconnect or rollback procedure. | Retired; revoke after stored-token disposition |
| `CALENDAR_OAUTH_STATE_SECRET` | Local OAuth state signing only while the retired Calendar flow remains available. | Retired; remove after disconnect audit |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | Local decrypt/re-encrypt of stored Calendar refresh tokens for disconnect or recovery; never share with the browser. | Temporary; remove after stored-token disposition |
| `SNYK_TOKEN` | Read-only project dependency/code scanning sufficient for the CI scans; no organization administration. | Verify token type and org scope in Snyk |
| `OPENCODE_API_KEY` | Model/API access for the GitHub comment bot; its sole workflow consumer was removed by PR #164 | Removed from repository settings on 2026-09-24 after merge; no value was accessed |
| `GITHUB_TOKEN` | GitHub-managed per-job API token; permissions are bounded by each workflow's `permissions:` declaration. It is not a repository secret and needs no manual rotation. | Automatic; retain least-privilege workflow permissions |

### One-off jobs, retired integration references and development switches

The names below are present in examples or tracked consumers, but are **not evidence of active production integrations**. The standalone Clerk webhook module references its secret but is not mounted in `routes/index.ts`. Calendar API endpoints return retired/410 responses; the encryption key remains for disconnect/revocation of previously stored tokens. Migration credentials must remain isolated from the running app.

| Name | Kind; consumer / purpose; requirement | Dev | Current prod | Proposed target | Status |
| --- | --- | --- | --- | --- | --- |
| `POSTGRES_SOURCE_URL` | S; PostgreSQL source migration script; required only when running old PG-to-Mongo job | local secret | not runtime; job unverified | job secret only if job still required | verify/remove |
| `POSTGRES_RESTORE_URL` | S; rehearsal restore connection, example only / no active script consumer found | local secret | not runtime | job secret only for isolated rehearsal | verify/remove |
| `PG_SSL_CA` | N; trusted CA material for old PostgreSQL migration, optional; treat as integrity-sensitive | local restricted config | not runtime; job unverified | job config if migration needed | verify/remove |
| `MONGODB_MIGRATION_DATABASE` | N; empty target for old PG-to-Mongo script; required for that job | local config | not runtime; job unverified | job config if needed | verify/remove |
| `MONGODB_MIGRATION_REPORT_PATH` | N; old migration report path override; optional | local config | not runtime | job config if needed | verify/remove |
| `MONGODB_VALIDATION_SOURCE_DATABASE` | N; source database for `validate-mongodb-restore.ts`; required to compare a backup restore | local config | not runtime | isolated job config for Mongo backup/restore rehearsal and rollback validation; never app runtime | Kindred owner; retain through verified restore and rollback window; remove after MongoDB retirement |
| `MONGODB_VALIDATION_RESTORE_DATABASE` | N; restored target database for `validate-mongodb-restore.ts`; required to compare a backup restore | local config | not runtime | isolated job config for Mongo backup/restore rehearsal and rollback validation; never app runtime | Kindred owner; retain through verified restore and rollback window; remove after MongoDB retirement |
| `MONGODB_MESSAGE_OWNERSHIP_URI` | S; message-owner backfill script; required only for isolated restore/staging rehearsal and prohibited in production mode | local secret or isolated staging job secret | not runtime; production execution prohibited | isolated job secret with database-level access only; remove after backfill/rollback window | Kindred owner; verify scope before use, then remove |
| `MONGODB_MESSAGE_OWNERSHIP_DATABASE` | N; dedicated non-production database name for the message-owner backfill; required only for that job | local config | not runtime; production execution prohibited | isolated job config; remove after backfill/rollback window | Kindred owner; verify target name, then remove |
| `AUTH0_CLIENT_ID` | P; Auth0 Deploy CLI application ID, required for tenant deployment only | local config | not runtime; deployment job unverified | job config | verify/retain |
| `AUTH0_CLIENT_SECRET` | S; Auth0 Deploy CLI machine-to-machine credential, required for tenant deployment only | local secret | not runtime; deployment job unverified | job secret | verify/rotate |
| `CLERK_SECRET_KEY` | S; retired Clerk admin script; required only if that script is run | local secret | not runtime; unverified | no app runtime target | verify/remove after migration check |
| `CLERK_WEBHOOK_SECRET` | S; unmounted standalone Clerk webhook module requires it outside tests if imported | local secret | not runtime; unverified | no app runtime target | verify/remove after migration check |
| `CLERK_PUBLISHABLE_KEY` | P; root example only, no active consumer found | local config | not runtime | none | verify/remove |
| `VITE_CLERK_PUBLISHABLE_KEY` | P; root example only, no active browser consumer found | local config | not runtime | none | verify/remove |
| `GOOGLE_CLIENT_ID` | P; retired Calendar OAuth helper; no active connect route | local config | not runtime; unverified | none | verify/remove after disconnect audit |
| `GOOGLE_CLIENT_SECRET` | S; retired Calendar OAuth helper; no active connect route | local secret | not runtime; unverified | none | verify/remove after disconnect audit |
| `GOOGLE_CALENDAR_REDIRECT_URI` | P; retired Calendar OAuth callback configuration | local config | not runtime; unverified | none | verify/remove |
| `CALENDAR_OAUTH_STATE_SECRET` | S; retired Calendar OAuth helper state signing | local secret | not runtime; unverified | none | verify/remove after disconnect audit |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | S; decrypts saved Calendar tokens for best-effort disconnect/revocation; optional, not startup gate | local secret | unverified | Fly secret temporarily if saved tokens remain | verify/retain until reconnect/deletion plan, then remove |
| `REPLIT_DOMAINS` | P; legacy fallback for reminder link origin | platform/local config | unverified | none; use `APP_PUBLIC_URL` | verify/remove |
| `REMINDER_SCHEDULER_DISABLED` | N; disables reminder scheduler when `true`, optional | local config | unverified | Fly config if operationally needed | verify/retain |
| `KINDRED_API_ORIGIN` | P; local Vite proxy target, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_DB` | N; local disposable/external Mongo selector, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_WEB_PORT` | N; local web server port, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_API_PORT` | N; local API server port, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_DB_VERSION` | N; disposable Mongo version, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_DB_REPLSET_COUNT` | N; disposable Mongo replica-set count, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_DB_STORAGE_ENGINE` | N; disposable Mongo storage engine, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_GRACE_MS` | N; local dev shutdown grace, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_FORCE_GRACE_MS` | N; local dev forced-shutdown grace, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_GRACEFUL_POLL_MS` | N; local dev shutdown polling, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_DEBUG_LOG` | N; local diagnostic log path, optional; output may be sensitive | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_JOBS_FIXTURE` | N; local job fixture path, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_DB_FACTORY` | N; local database factory hook, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_DEV_DB_FACTORY_OUT` | N; local factory output path, optional | local config | not runtime | none (dev only) | verify/retain locally |
| `KINDRED_RELEASE_ROOT` | N; release evidence script root override, optional | local config | not runtime | job config if needed | verify/retain |

Fixture-only `FAKE_*`, `BIND_PORT`, `MARKER_FILE`, `GRANDCHILD_*`, `EXIT_CODE`, `WRAP_EXIT_AFTER_MS`, `BUILD_MARKER`, `SIBLING_MARKER`, `FAKE_STATE_DIR` and similar supervisor test process variables are not application credentials or production settings. Standard OS/test variables (`HOME`, `PATH`, `CI`, `VITEST`) and Vite-generated `BASE_URL` are supplied by their tools, not secret inventory items.

### GitHub Actions references

These are **workflow references only**; verify active credential references in GitHub. Canonical `main` at `8352f14` has no explicit `OPENCODE_API_KEY` or `GITHUB_TOKEN` reference. GitHub automatically provides the per-job `GITHUB_TOKEN` subject to workflow permissions; it is not a repository secret. No GitHub Actions `vars.*` references were found. Workflow-defined `HELCIM_PAYMENTS_ENABLED` and synthetic `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` are test configuration, not evidence of repository secrets.

| Name | Kind; consumer / purpose; requirement | Dev | Current production / Actions source | Proposed target | Owner / status |
| --- | --- | --- | --- | --- | --- |
| `SNYK_TOKEN` | S; Snyk workflow scans, required for that workflow | GitHub Actions secret reference | `secrets.SNYK_TOKEN`; verify-in-GitHub | GitHub Actions secret if scan retained | Kindred owner; verify-in-GitHub, rotate if needed |


### GitHub repository inventory — names checked 2026-09-25

A read-only GitHub metadata query returned repository-level Actions secret **names only**; no values were accessed. After checking canonical `main` and the finalization branch workflows, unused `CLERK`, `NEON_API_KEY`, and `NEON_PROJECT_ID` entries were removed on 2026-09-24. PR #164 merged on 2026-09-24, removed the OpenCode comment bot, and its sole-consumer secret `OPENCODE_API_KEY` was then deleted. A fresh names-only query on 2026-09-25 returned only `SNYK_TOKEN`; repository Actions variables were empty. PRs #183, #184, and #185 are merged; the repository baseline is now `8352f14`. Repository environment secret and variable lists were last checked on 2026-09-24; their names and current contents have not been refreshed in this audit. This is a point-in-time inventory, not proof that the retained Snyk token is correctly scoped.

| Name | Kind; observed consumer | Owner / disposition |
| --- | --- | --- |
| `SNYK_TOKEN` | S; referenced by `.github/workflows/snyk-security.yml` | Kindred owner; retain while Snyk scanning is active; rotate if exposure or ownership requires it |

GitHub lists three deployment environments: `Asterling Coach / production`, `Asterling Coaching / production`, and `Asterling Coaching / Staging`. Read-only queries of the correct repository environment endpoints returned zero environment secrets and zero environment variables for each. Their deployment records remain: 1, 43, and 21 respectively; the latest recorded SHA for the two `Asterling Coaching` environments is `99d0679bae2dceb8218214efa47eee98655e5235` (2026-07-28), and the latest for `Asterling Coach / production` is `3049c5c97babaa5ddbc01427e91000212aeb0992` (2026-07-11). Repository Actions variables are empty. The signed-in GitHub organization Actions settings pages show no organization secrets and no organization variables. These GitHub deployment records are not proof of a currently active provider deployment. Keep the records; verify each environment's external purpose before removing it.

### Redacted Git history scan — 2026-09-23

Gitleaks 8.30.1 scanned the current tree and all local Git refs/history (417
commits); the report was redacted and no secret values were printed. The 8
current-tree `generic-api-key` matches map to public Auth0 client identifiers,
test fixtures, and documentation examples. History adds old copies of those
same categories. No active application token was confirmed by code inspection.

The scan also found a structurally valid, encrypted OpenSSH private-key
container in commit `900dc255d10666e702c81adf230b1754e9d220ce` (2026-08-02),
under a historical Windows-profile filename; it was removed from the working
tree in commit `5f57aa4d92f1ce7d91809746e8c980efe0d1bfef` but remains in history.
Its public-key fingerprint was used only for comparison and is omitted
here. The key's owner, passphrase-holder, and whether it remains
authorized are unknown. No fingerprint match was found in the Kindred repo's
deploy keys or the current GitHub login's public SSH-key list. The authenticated
`gh` token lacks `admin:public_key`; registrations outside the current GitHub
profile and repository remain unknown. Treat it as potentially exposed:
identify and revoke it where registered, then
coordinate a history rewrite across affected refs. Do not claim history cleanup
complete until owner confirmation, key revocation, all-branch rewrite, and
collaborator clone instructions are complete.

## Planned target state — partially implemented in the repository, NOT deployed or verified live

The selected destination is **Fly.io app + Fly Managed Postgres in Toronto (`yyz`) + Cloudflare AI Gateway**. Read-only Fly CLI checks on 2026-09-24 confirmed the then-current staging app `kindred-asterling-staging-20260924` existed in the `personal` organization but had no image or deployment, and Managed Postgres cluster `kindred-staging-db-20260924` was ready on the Basic plan in `yyz` with no app attached. Its empty rehearsal database `kindred_rehearsal_pg_adapter_20260925` has not passed a credentialed integration or restore rehearsal; Fly billing was not inspected. These resources are in the same Fly organization. A Fly dashboard check on 2026-09-25 found the repository-linked app `kindred-asterling-ai-coaching`, with no saved app configuration, deployment, machines, or configured app secrets; a subsequent Launch build at commit `ed5feeb` failed because the required public Auth0 build identifiers were absent, before an image or app deployment was created. The repository's `fly.toml` now targets this app and its `.fly.dev` URL. The repository includes an opt-in PostgreSQL runtime selector and `POSTGRES_URL` contract, but MongoDB remains the default and Cloudflare AI Gateway credentials/configuration have not been verified. Do not substitute `POSTGRES_SOURCE_URL` or `POSTGRES_RESTORE_URL` for the runtime `POSTGRES_URL`. Before enabling PostgreSQL, validate least-privilege access, migration, restore, and rollback. Choose the Gateway's authenticated request format and credential name only after implementation; no `CLOUDFLARE_*` runtime variable is claimed present. Keep any gateway token server-side; public build variables must remain public. External provider settings, runtime secrets, migrations, and runtime secret rotations/removals remain unverified; the repository-only `OPENCODE_API_KEY` removal is verified above.

## Provider-console questions for Kindred owner

1. Which production and development accounts/projects actually supply MongoDB, Auth0, Helcim, Resend, AI, Twilio and ElevenLabs, and where are their runtime values injected today? Is Coolify still serving any production traffic?
2. Are Helcim payments and any OpenAI-compatible AI/Ollama, SMS or voice features enabled in production, and which credentials/endpoints are live?
3. Are Clerk webhook/admin access or Google Calendar stored tokens still needed for cleanup or revocation before removing credentials (especially `CALENDAR_TOKEN_ENCRYPTION_KEY`)?
4. Which Fly organization/app and Managed Postgres cluster are selected, is Toronto (`yyz`) available on both, and what is the verified migration/rollback and secret-rotation schedule?
5. Which Cloudflare AI Gateway account, authentication mode, upstream provider and server-side credential contract are intended?
6. Verify `SNYK_TOKEN` remains correctly scoped for the active Snyk workflow. `OPENCODE_API_KEY` was deleted after PR #164 removed its sole workflow consumer; GitHub listed only `SNYK_TOKEN` immediately after deletion.
