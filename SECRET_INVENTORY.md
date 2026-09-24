# Kindred credential and configuration inventory

**Canonical source baseline:** `7c264f6` (2026-09-23); inventory reflects this finalization branch's current code. **Owner for every entry:** Kindred owner unless marked unknown. This is a value-free inventory of names and code requirements, not an attestation that an account, vault item, production deployment, or GitHub secret is populated. Evidence: root and `auth0-deploy/` `.env.example` **names only**, `artifacts/api-server/src/lib/validateConfig.ts`, application consumers, migration scripts, frontend build validator, `.github/workflows/`, and redacted Gitleaks scans of the current tree and Git history. Secret values must never enter Git or browser `VITE_*` builds.

## Current canonical-main contract

The API uses MongoDB (`MONGODB_URI` / `MONGODB_DATABASE`) and Auth0 (`AUTH0_DOMAIN` / `AUTH0_AUDIENCE`); the frontend builds with three public Auth0 `VITE_*` values. Helcim is conditional on `HELCIM_PAYMENTS_ENABLED=true`. AI supports Ollama and an OpenAI-compatible provider; Cloudflare AI Gateway is the target route, not a verified live integration. Bedrock runtime support has been removed. Resend is a production startup requirement. These are **code contracts**, not verified facts about a live provider account or deployment. The repository has historical Coolify, Clerk, PostgreSQL-migration and Calendar artifacts; their presence does not prove those services are currently in use. No current production secret store can be confirmed from this checkout.

In the tables, **S** = secret (including sensitive identifiers such as access-key IDs/SIDs), **P** = public, browser-exposed configuration, **N** = non-secret server/build configuration. **Dev** `local secret` means developer-controlled secret injection (actual store unverified); `local config` means shell or local development configuration (including documented `.env.dev`; actual source unverified). **Current prod** `unverified` means the code requires/consumes the name but neither injection location nor population is established; `not runtime` means a job/legacy-only name. **Target** `DO secret` / `DO config` / `DO build` means proposed DigitalOcean App Platform encrypted runtime secret / ordinary runtime setting / public build setting; `job secret` / `job config` means isolated operator migration/deployment job, not app runtime. These target locations are proposals, not deployed resources. **Status** `verify/rotate` means check use and rotate at cutover as appropriate, not already rotated; `verify/retain` means confirm configuration during cutover; `verify/remove` means confirm no remaining consumer or stored data before revocation/removal. All entries have owner **Kindred owner**; no rotation or removal is claimed complete.

| Name | Kind; consumer / purpose; requirement | Dev | Current prod | Proposed target | Status |
| --- | --- | --- | --- | --- | --- |
| `MONGODB_URI` | S; API MongoDB connection; required; also migration/restore scripts | local secret or disposable DB | unverified | DO secret until PostgreSQL cutover; then job secret if needed | verify/rotate, then verify/remove |
| `MONGODB_DATABASE` | N; API DB name; required | local config or disposable DB | unverified | DO config until PostgreSQL cutover | verify/retain, then verify/remove |
| `NODE_ENV` | N; API mode, production gates, test behavior | local config | unverified | DO config | verify/retain |
| `PORT` | N; API bind / Vite serve port; required by API and Vite serve | local config | unverified | DO config/platform port | verify/retain |
| `APP_PUBLIC_URL` | P; server public origin, CORS, redirects/reminders; required in production | local config | unverified | DO config | verify/retain |
| `BASE_PATH` | P; Vite base / server path; required for Vite serve, build defaults to `/` | local config | unverified | DO build/config | verify/retain |
| `LOG_LEVEL` | N; API logger; optional | local config | unverified | DO config | verify/retain |
| `TRUST_PROXY_HOPS` | N; Express proxy trust; optional | local config | unverified | DO config | verify/retain |
| `AUTH0_DOMAIN` | P; API JWT issuer / CORS; required in production | local config | unverified | DO config | verify/retain |
| `AUTH0_AUDIENCE` | P; API JWT audience; required in production | local config | unverified | DO config | verify/retain |
| `VITE_AUTH0_DOMAIN` | P; browser Auth0 tenant; required by frontend build validator | local config | unverified | DO build | verify/retain |
| `VITE_AUTH0_CLIENT_ID` | P; browser Auth0 public client ID; required by frontend build validator | local config | unverified | DO build | verify/retain |
| `VITE_AUTH0_AUDIENCE` | P; browser API audience; required by frontend build validator | local config | unverified | DO build | verify/retain |
| `AI_PROVIDER` | N; provider switch (Ollama default, OpenAI-compatible or disabled); optional | local config | unverified | DO config; `openai` for Gateway route after approval | verify/retain or replace |
| `AI_REQUEST_TIMEOUT_MS` | N; chat request timeout; optional | local config | unverified | DO config | verify/retain |
| `OLLAMA_BASE_URL` | N; Ollama endpoint; required when provider is Ollama | local config | unverified | DO config only if retained | verify/remove if replaced |
| `OLLAMA_MODEL` | N; Ollama model; required when provider is Ollama | local config | unverified | DO config only if retained | verify/remove if replaced |
| `OPENAI_API_KEY` | S; OpenAI provider auth; required when `AI_PROVIDER=openai` | local secret | unverified | DO secret or gateway credential if chosen | verify/rotate or remove |
| `OPENAI_BASE_URL` | N; OpenAI-compatible endpoint override; optional | local config | unverified | DO config; Cloudflare AI Gateway endpoint after account setup | verify/retain or replace |
| `OPENAI_MODEL` | N; OpenAI model; required when `AI_PROVIDER=openai` | local config | unverified | DO config | verify/retain |
| `AWS_SESSION_TOKEN` | S; optional temporary AWS credential | local secret | unverified | DO secret only if needed | verify/rotate or remove |
| `HELCIM_PAYMENTS_ENABLED` | N; payments feature gate; optional, CI explicitly disables | local config | unverified | DO config | verify/retain |
| `HELCIM_API_KEY` | S; Helcim API; required if payments enabled | local secret | unverified | DO secret | verify/rotate |
| `HELCIM_WEBHOOK_SECRET` | S; webhook signature; required if payments enabled | local secret | unverified | DO secret | verify/rotate |
| `HELCIM_CUSTOMER_REFERENCE_SECRET` | S; customer reference HMAC; required if payments enabled | local secret | unverified | DO secret | verify/rotate with compatibility plan |
| `HELCIM_YEARLY_PLAN_ID` | N; Helcim yearly plan; validator requires if payments enabled, no active API consumer found | local config | unverified | DO config only if still needed | verify/remove |
| `HELCIM_LIFETIME_PRODUCT_ID` | N; legacy example product ID; no active consumer found | local config | unverified | none unless reintroduced | verify/remove |
| `HELCIM_YEARLY_CHECKOUT_URL` | P; subscription checkout URL; required if payments enabled | local config | unverified | DO config | verify/retain |
| `HELCIM_LIFETIME_CHECKOUT_URL` | P; subscription checkout URL; required if payments enabled | local config | unverified | DO config | verify/retain |
| `HELCIM_LIFETIME_INVOICE_PREFIX` | N; validator requires if payments enabled, no active API consumer found | local config | unverified | DO config only if still needed | verify/remove |
| `HELCIM_PORTAL_URL` | P; validator requires if payments enabled, no active API consumer found | local config | unverified | DO config only if still needed | verify/remove |
| `HELCIM_EMAIL_MIGRATION_FALLBACK` | N; temporary checkout identity fallback; optional | local config | unverified | DO config only during migration | verify/remove |
| `SUBSCRIPTION_OWNER_IDS` | N; privileged owner IDs; required in production | local config (restrict access) | unverified | DO secret (access-control list) | verify/retain |
| `SUBSCRIPTION_OWNER_EMAILS` | N; owner/admin email allowlist; optional | local config (restrict access) | unverified | DO secret (access-control list) | verify/retain |
| `DAILY_CHAT_LIMIT` | N; daily quota override; optional | local config | unverified | DO config | verify/retain |
| `RESEND_API_KEY` | S; server email; required in production | local secret | unverified | DO secret | verify/rotate |
| `RESEND_FROM_EMAIL` | P; sender address; required in production | local config | unverified | DO config | verify/retain |
| `TWILIO_ACCOUNT_SID` | S; SMS account identifier; optional as complete SMS group | local secret | unverified | DO secret if SMS used | verify/rotate or remove |
| `TWILIO_AUTH_TOKEN` | S; SMS auth; optional as complete SMS group | local secret | unverified | DO secret if SMS used | verify/rotate or remove |
| `TWILIO_PHONE_NUMBER` | N; SMS sender number; optional as complete SMS group | local config | unverified | DO config if SMS used | verify/retain or remove |
| `ELEVENLABS_API_KEY` | S; voice API; optional | local secret | unverified | DO secret if voice used | verify/rotate or remove |
| `VITE_SOCIAL_WHATSAPP_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |
| `VITE_SOCIAL_INSTAGRAM_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |
| `VITE_SOCIAL_THREADS_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |
| `VITE_SOCIAL_FACEBOOK_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |
| `VITE_SOCIAL_X_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |
| `VITE_SOCIAL_LINKEDIN_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |
| `VITE_SOCIAL_GOOGLE_BUSINESS_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |
| `VITE_SOCIAL_PATREON_URL` | P; browser social link; optional | local config | unverified | DO build | verify/retain |

### One-off jobs, retired integration references and development switches

The names below are present in examples or tracked consumers, but are **not evidence of active production integrations**. The standalone Clerk webhook module references its secret but is not mounted in `routes/index.ts`. Calendar API endpoints return retired/410 responses; the encryption key remains for disconnect/revocation of previously stored tokens. Migration credentials must remain isolated from the running app.

| Name | Kind; consumer / purpose; requirement | Dev | Current prod | Proposed target | Status |
| --- | --- | --- | --- | --- | --- |
| `POSTGRES_SOURCE_URL` | S; PostgreSQL source migration script; required only when running old PG-to-Mongo job | local secret | not runtime; job unverified | job secret only if job still required | verify/remove |
| `POSTGRES_RESTORE_URL` | S; rehearsal restore connection, example only / no active script consumer found | local secret | not runtime | job secret only for isolated rehearsal | verify/remove |
| `PG_SSL_CA` | N; trusted CA material for old PostgreSQL migration, optional; treat as integrity-sensitive | local restricted config | not runtime; job unverified | job config if migration needed | verify/remove |
| `MONGODB_MIGRATION_DATABASE` | N; empty target for old PG-to-Mongo script; required for that job | local config | not runtime; job unverified | job config if needed | verify/remove |
| `MONGODB_MIGRATION_REPORT_PATH` | N; old migration report path override; optional | local config | not runtime | job config if needed | verify/remove |
| `MONGODB_VALIDATION_SOURCE_DATABASE` | N; Mongo restore drill source; required for restore validator | local config | not runtime | job config if drill needed | verify/remove |
| `MONGODB_VALIDATION_RESTORE_DATABASE` | N; Mongo restore drill target; required for restore validator | local config | not runtime | job config if drill needed | verify/remove |
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
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | S; decrypts saved Calendar tokens for best-effort disconnect/revocation; optional, not startup gate | local secret | unverified | DO secret temporarily if saved tokens remain | verify/retain until reconnect/deletion plan, then remove |
| `REPLIT_DOMAINS` | P; legacy fallback for reminder link origin | platform/local config | unverified | none; use `APP_PUBLIC_URL` | verify/remove |
| `REMINDER_SCHEDULER_DISABLED` | N; disables reminder scheduler when `true`, optional | local config | unverified | DO config if operationally needed | verify/retain |
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

These are **workflow references only**; all are **verify-in-GitHub** for presence, access and rotation. No GitHub Actions `vars.*` references were found. Workflow-defined `HELCIM_PAYMENTS_ENABLED` and synthetic `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` are test configuration, not evidence of repository secrets.

| Name | Kind; consumer / purpose; requirement | Dev | Current production / Actions source | Proposed target | Owner / status |
| --- | --- | --- | --- | --- | --- |
| `SNYK_TOKEN` | S; Snyk workflow scans, required for that workflow | GitHub Actions secret reference | `secrets.SNYK_TOKEN`; verify-in-GitHub | GitHub Actions secret if scan retained | Kindred owner; verify-in-GitHub, rotate if needed |
| `OPENCODE_API_KEY` | S; OpenCode workflow auth, required for that workflow | GitHub Actions secret reference | `secrets.OPENCODE_API_KEY`; verify-in-GitHub | GitHub Actions secret while the comment-triggered workflow is used | Kindred owner; limited to trusted-member comments; verify-in-GitHub, rotate if needed |
| `GITHUB_TOKEN` | S; OpenCode workflow GitHub API access | GitHub-managed workflow token | `secrets.GITHUB_TOKEN`; verify-in-GitHub (GitHub-provided) | GitHub-managed token | Kindred owner; verify-in-GitHub, no manual secret rotation assumed |


### GitHub repository inventory — names checked 2026-09-23

A read-only GitHub metadata query returned these repository-level Actions secret **names only**; no values were accessed. The repository also has the `NEON_PROJECT_ID` Actions variable. This is a point-in-time inventory, not proof that each item is consumed or correctly scoped.

| Name | Kind; observed consumer | Owner / disposition |
| --- | --- | --- |
| `CLERK` | S; no current workflow reference found; local Clerk inspection/migration tools remain | Kindred owner; verify any external deployment or identity-recovery use, then remove if unused |
| `NEON_API_KEY` | S; no current tracked workflow reference found | Kindred owner; verify deploy integrations and project ownership, then remove if unused |
| `OPENCODE_API_KEY` | S; referenced by pinned `.github/workflows/opencode.yml` action | Kindred owner; retain only while workflow is used; action pin and comment permissions hardened; verify secret scope |
| `SNYK_TOKEN` | S; referenced by `.github/workflows/snyk-security.yml` | Kindred owner; retain while Snyk scanning is active; rotate if exposure or ownership requires it |
| `NEON_PROJECT_ID` | N; repository Actions variable; no current tracked workflow reference found | Kindred owner; verify deploy integrations and project ownership, then remove if unused |

GitHub lists the deployment environments `Asterling Coach / production`, `Asterling Coaching / production`, and `Asterling Coaching / Staging`. Read-only environment-secret queries returned zero entries for all three at audit time. Recheck before cutover; do not assume this remains current.

### Redacted Git history scan — 2026-09-23

Gitleaks 8.30.1 scanned the current tree and all local Git refs/history (417
commits); the report was redacted and no secret values were printed. The 8
current-tree `generic-api-key` matches map to public Auth0 client identifiers,
test fixtures, and documentation examples. History adds old copies of those
same categories. No active application token was confirmed by code inspection.

The scan also found a structurally valid, encrypted OpenSSH private-key
container in commit `900dc255d10666e702c81adf230b1754e9d220ce` (2026-08-02),
under a historical Windows-profile filename; it is absent from the current
tree. A public-key fingerprint is recorded in the owner-facing review request,
not as a credential value. Its owner, passphrase-holder, and whether it remains
authorized are unknown. Treat it as potentially exposed: identify and revoke it
where registered, then coordinate a history rewrite across affected refs. Do
not claim history cleanup complete until owner confirmation, key revocation,
all-branch rewrite, and collaborator clone instructions are complete.

## Planned target state — NOT implemented or verified by this checkout

The desired destination is **DigitalOcean App Platform + managed PostgreSQL + Cloudflare AI Gateway**. Current code has a MongoDB runtime and no PostgreSQL runtime connection variable or verified Cloudflare gateway credential contract. Do not substitute `POSTGRES_SOURCE_URL` or `POSTGRES_RESTORE_URL` for a new production database URL. Define and validate the new runtime database name/connection contract, grant least-privilege access, migrate and verify data/rollback before retiring MongoDB credentials. Choose the gateway's authenticated request format and credential name only after implementation; no `CLOUDFLARE_*` runtime variable is claimed present. Keep any gateway token server-side; public build variables must remain public. DigitalOcean configuration, managed database ownership, provider-account population, webhook endpoints, GitHub secrets, and any migrations/rotations/removals all require external verification; none are recorded here as complete.

## Provider-console questions for Kindred owner

1. Which production and development accounts/projects actually supply MongoDB, Auth0, Helcim, Resend, AI, Twilio and ElevenLabs, and where are their runtime values injected today? Is Coolify still serving any production traffic?
2. Are Helcim payments and any OpenAI-compatible AI/Ollama, SMS or voice features enabled in production, and which credentials/endpoints are live?
3. Are Clerk webhook/admin access or Google Calendar stored tokens still needed for cleanup or revocation before removing credentials (especially `CALENDAR_TOKEN_ENCRYPTION_KEY`)?
4. Which DigitalOcean app and managed PostgreSQL instance are the approved target, and what is the verified migration/rollback and secret-rotation schedule?
5. Which Cloudflare AI Gateway account, authentication mode, upstream provider and server-side credential contract are intended?
6. In GitHub Actions, are `SNYK_TOKEN` and `OPENCODE_API_KEY` configured and scoped correctly, and does the OpenCode workflow rely on GitHub's supplied `GITHUB_TOKEN`?
