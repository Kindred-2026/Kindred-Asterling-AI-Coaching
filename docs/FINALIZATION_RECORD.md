# Kindred foundation finalization record

**Starting baseline:** GitHub `main` at `e91135e5d774abc700235adcef3d5ac14cbdb79d` (2026-09-24, after merge of PR #155). Current canonical source is recorded in the post-merge audit below.
**Purpose:** Close the foundation phase before routine maintenance and focused
feature work. This record distinguishes repository changes from provider and
production gates; a checked-in plan is not proof of a live cutover.

## Direction

- **Application hosting:** Fly.io is the selected provider. The repository-linked
  staging app (`kindred-asterling-ai-coaching`) is registered. On 2026-09-25,
  the Fly dashboard showed no saved app configuration, deployment, or machines.
  The checked-in `fly.toml` targets Toronto (`yyz`). Billing and payment details
  have not been inspected. Keep Coolify available until a replacement release
  and rollback window are verified.
- **Database:** Fly Managed Postgres Basic staging cluster
  `kindred-staging-db-20260924` (20 GB provisioned, one replica, v2) is
  provisioned and ready in Toronto (`yyz`). The app attachment and staged writer
  connection are configured; app startup and runtime schema rollout remain unverified. Real-server adapter validation and synthetic migration/restore
  now pass; [execution evidence](POSTGRES_STAGING_EVIDENCE.md) records the limits.
  Production-like snapshot and full application acceptance remain open.
  Preserve internal
  Kindred user IDs and each user's existing histories. Never merge accounts by
  email. Keep MongoDB until migration rehearsal, restore validation, staging,
  production verification, and rollback-retention gates pass.
- **AI:** Keep the OpenAI-compatible provider interface and route it through
  Cloudflare AI Gateway. Keep personalized conversation caching off. Send
  `cf-aig-collect-log-payload: false` and disable payload collection in Gateway
  settings. This header does not set upstream model-provider retention. Compare
  Workers AI only after coaching-quality, privacy, and cost review.
- **Edge/security:** Keep Cloudflare for DNS, TLS/proxy, application security,
  and AI Gateway. Keep Auth0, Helcim, email, reminders, and voice until each
  feature has a separately reviewed replacement decision.

## Repository disposition

| Area | Disposition | Evidence / remaining gate |
| --- | --- | --- |
| Experimental Next.js `frontend/` | No `frontend/` application, Next.js dependency, workspace package, or standalone CI path remains. Removed the unreferenced `prompts/nextjs_template.md` in PR #196; `scripts/dev-supervisor.test.mjs` intentionally keeps a regression assertion that no supervisor job targets `next`. The production React/Vite app remains under `artifacts/kindred-coach`. | Confirmed by root tree, package manifests, workflow scan, and PR #196's passing checks; the negative regression assertion is retained as a guard |
| Dormant Clerk dependency override | Removed from `pnpm-workspace.yaml` and `pnpm-lock.yaml` after repository-wide search found no dependency or import consumer | Clerk identity mapping, webhook, and rollback utilities remain retained behind the Auth0 reconciliation and rollback gates |
| Superseded release SOP exports | Removed the stale HTML, DOCX, and PDF that prescribed Coolify, Clerk, Ollama, and a future GitLab pipeline | README now points to the Fly runbook and release/rollback guide; Coolify's separately labeled legacy deployment record remains available while cutover gates are open |
| Public legal PDF downloads | Retained to preserve the existing user-facing download links | All six current PDFs are marked draft / not for distribution; the privacy and cookie PDFs also name Clerk and Contabo, and the privacy/AI PDFs describe Bedrock. Replace with legally approved copies consistent with the web pages before treating legal-document cleanup as complete |
| AWS Bedrock provider | Removed from API runtime, dependency, examples, and provider instructions; repository search found no active runtime or workflow consumer | Remaining repository references are regression/security tests, generic build externals, and historical documentation. The Coolify runtime and provider secret stores were not inspected; verify and remove any Bedrock-specific variables there before closing this gate |
| Legacy AWS EKS/KEDA assets | Removed after the owner confirmed there is no AWS cluster; repository search found no active workflow or application-runtime consumer | Removed the EKS Terraform, Karpenter/KEDA/metrics-server manifests, deploy scripts, and version pins. AWS resources were not changed |
| TODO/FIXME cleanup | No unresolved TODO, FIXME, XXX, or HACK markers remain in current source; matches are UI `ListTodo` symbols and usage text | Recheck when code changes are finalized |
| OpenAI-compatible AI | Retained; Cloudflare Gateway endpoint supported; request payload logging and personalized response caching are disabled in Gateway requests | Provider account, upstream model, payload/log-retention policy, gateway-level spend limit, model budget, and staging verification remain external gates. Gateway metadata/usage logs may still be retained |
| Snyk | Retained as an observable scanner. Messages use stable Kindred `userId` ownership; no suppression was added. | PR #149 merged at `504cdf3c3019e3550e5a074dc499961ea2540d10` with CI, Security Audit, Snyk IaC, Snyk Code, API tests, frontend tests, and build all passing. The IaC job skips only when no supported IaC files exist; when they exist, `snyk iac test --report` runs and scan failures remain fatal. Open Source and Container use `monitor`, which submits results but does not gate on findings; review their project results in Snyk. Production remains gated on ownership backfill and cutover requirements below |
| MongoDB and Coolify | Retained temporarily for production and rollback | Do not retire before all cutover gates pass |
| Hosting provider decision | DigitalOcean rejected the available payment methods; user selected Fly.io. Railway was evaluated but not selected because its listed app/database regions omit Canada. The two DigitalOcean guides, `DIGITALOCEAN_APP_PLATFORM.md` and `digitalocean-cutover.md`, were removed; Fly.io is the active runbook | Staging app and database are provisioned in Toronto, but code is not deployed and the database is unattached. Billing, maintenance responsibility, and measured costs remain unverified. See [Fly.io deployment runbook](FLY_DEPLOYMENT.md) and [cost baseline](COST_BASELINE.md) |
| PostgreSQL runtime and migration foundation | Added an opt-in `DATABASE_PROVIDER=postgres` runtime adapter and `POSTGRES_URL` contract; MongoDB remains the default. Also added a reviewed all-20-collection rehearsal schema, per-row validation, stable-ID and owner-relationship checks, bounded source snapshot reads, rollback-by-default replay, timezone-safe lease expiry (PR #154), startup schema validation (PR #155), and a separately gated real-server adapter suite (PR #176) | PR #176 CI passed. Local opt-in guard and existing adapter tests passed (9/9). The live Fly adapter and synthetic 20-collection migration/encrypted restore passed on 2026-09-26 after fixing extension preflight and catalog array decoding. See [execution evidence](POSTGRES_STAGING_EVIDENCE.md). Production-like data rehearsal, full application integration, production migration, and staging acceptance remain open |
| GitHub Actions OpenCode bot | Removed the comment-triggered bot after checking its full GitHub run history: zero successful runs and the latest 100 runs all skipped. Local OpenCode CLI delegation remains available independently. | PR #164 merged at `2bab75d`; the workflow is absent and the repository secret list confirms `OPENCODE_API_KEY` was deleted. The only remaining repository secret is `SNYK_TOKEN`. |
| GitHub Actions runtime | CI, Security Audit, and Snyk action references use immutable SHAs for the verified Node 24 releases of checkout, setup-node, pnpm setup, artifact upload, and CodeQL SARIF upload | Exact SHAs were resolved from upstream release tags and each action's `action.yml` runtime was checked; validate behavior with PR checks |
| GitLab disposition | Owner confirmed GitLab is unused. Repository audit found no active GitLab pipeline or workflow; GitHub Actions is the sole active CI path. Removed the remaining GitLab/Coolify operator SOP and corrected the formatting-boundary comment. PR #195 marked the retained Phase 3 specs superseded and pointed them to GitHub Actions/Fly.io while preserving dated GitLab evidence. | No GitLab project or Coolify connection was changed externally. Coolify remains temporarily available until the Fly cutover and rollback gates pass. |
| Delegated work | OpenCode authenticated with `openai/gpt-6-luna`, passed a read-only checkout smoke test, and authored the Fly staging runbook in an isolated worktree (`8b67f0a`); its reviewed documentation change is integrated here as `335508b`. OpenCode also fixed selected PostgreSQL aliases (`0c3ce2a`, integrated as `5cb7592`) and implemented the bounded Snyk IaC workflow follow-up in isolated worktree commits `1492e01` and `347399b` (cherry-picked here as `6a148d4` and `ca6ed21`); fixture checks passed and no Snyk command was invoked. | Devin authenticated on the Free tier; this read-only audit attempt was blocked because the selected model requires Pro, and no Devin files changed. A prior same-day read-only audit had also hit the Free-tier daily quota. Neither tool received provider credentials or account access. Real PostgreSQL integration/restore remains an external gate, and `pg-mem` fixtures do not satisfy it |
| Repository secrets | Value-free inventory; current repository Actions secret is `SNYK_TOKEN`; repository variables are empty. | Refreshed names-only query on 2026-09-25 confirms only `SNYK_TOKEN`; repository variables are empty. All four GitHub deployment environments have zero secret names and zero variable names. Fly's `secrets list` for the staging app returned no names. No secret values were accessed. |
| Git history secret scan | Redacted Gitleaks scan covered the current tree and 417 commits; generic matches mapped to public IDs/examples/tests. No matching fingerprint was found in the repo deploy key or the current GitHub login's public SSH keys | A valid encrypted SSH private key remains in reachable history; its owner and registration outside the checked GitHub profile/repo remain unknown. Revoke where registered and coordinate all-ref history rewrite before claiming this gate complete |
| GitHub branch cleanup | Deleted the merged PR #145 branch after verifying its tip was an ancestor of canonical `main`; archived all 16 unique historical branch tips under verified GitHub tags, then deleted their stale branch names. PR #147 removed the confirmed-unused AWS EKS assets and merged at `49e0be1`. PR #149 merged the finalization and Snyk work; redundant PR #148 was closed without merge after verifying its workflow changes were included. | PRs #184, #185, #187, #189, #190, #191, #192, #193, #194, #195, and #196 are merged. PRs #186 and #188 are closed without merge. The latest branch audit found only `main` after both cleanup PRs merged. See [the branch cleanup record](BRANCH_CLEANUP.md). The Fly app remains undeployed, so its expected hostname is not verified live. |
| Local checkout cleanup | The initial finalization checkout was aligned to canonical `e91135e`; its former unique commit remains at local archive ref `archive/kindred-local-main-40c8841`. | At the latest audited snapshot, the primary checkout is `main` at `1664618`; untracked `.vscode/` is preserved. The PostgreSQL rehearsal worktree is clean at `e9f41e8`, zero commits ahead and 24 behind `main`, with its content contained in `main`. The separate Auth0 migration worktree remains modified and untracked: one unique commit, 342 commits behind `main`, modified `pnpm-workspace.yaml`, and untracked `auth0-deploy/`. Preserve it until the Auth0 owner confirms whether the remote Rule/Action is live and whether the export is needed for rollback. The old merged Auth0 deploy worktree was removed after verification. See [workspace checkout audit](WORKSPACE_CHECKOUTS.md) |
| Old branches and duplicate checkouts | Unique local checkout and branch preserved; canonical GitHub baseline selected; 16 stale remote branch names removed after exact tip archive and open-PR checks | Unique historical commits remain retrievable from archive tags; see [the branch cleanup record](BRANCH_CLEANUP.md) |
| Clerk webhook and identity disposition | Runtime authentication uses Auth0; no Clerk webhook router is mounted in app.ts/routes/index.ts; the test-only identity adapter mounts only when `NODE_ENV=test` or `VITEST=true`; legacy `clerkUserId` data/schema and migration/admin inspection artifacts remain in codebase | No provider dashboard, live webhook target, or external credential store was verified in this audit; keep legacy data/recovery paths until separate account-history reconciliation, external webhook/key disposition, and rollback retention gates pass; Clerk account deletion and credential rotation are not claimed |

## Current source and staging state (2026-09-26 UTC)

Canonical source snapshot for this audit is GitHub `main` at `1664618` after
PR #198. That PR requires HTTPS for production OpenAI-compatible endpoints and
rejects redirects that could forward coaching prompts to plaintext; its CI,
Snyk, build, and test checks passed. The remote branch audit found only `main`
and no open PRs. Immediately before deployment, the operator must run
`git rev-parse HEAD` from the clean, approved post-merge checkout and deploy
that exact SHA. No staging deployment candidate is selected yet. The root
`fly.toml` is tracked and `flyctl config validate` passes with internal port
`8080`, `/api/healthz/db`, `auto_stop_machines = 'off'`, and
`min_machines_running = 1`. A read-only Fly CLI check on 2026-09-26 reports the
registered app is pending with no deployment, machines, or app runtime secrets.
The v2 Managed Postgres cluster is ready in `yyz` with one replica and 20 GB
provisioned capacity, but remains unattached to any app. Its latest status
reported 2.95 GB used. It contains the default `fly-db` database and the
isolated `kindred_rehearsal_pg_adapter_20260925` database. No successful schema
or fixture write has been verified. The expected app URL is
`https://kindred-asterling-ai-coaching.fly.dev`, but it is not
verified live until Fly assigns the hostname. Launch attempt `2083359` (commit
`ed5feeb`) failed because the three public Auth0 `VITE_*` build identifiers
were not supplied; no image or app deployment resulted. The real adapter
attempt failed authentication before schema application. No production data,
traffic, or deployment was changed. Published-price estimates and actual
billing remain unverified. See [the staging record](FLY_DEPLOYMENT.md).

## Cutover gates

1. Export MongoDB with a consistent backup and record source database, counts,
   indexes, validators, and restore identifier. Restore into an isolated target.
2. Map owners using stable internal user IDs. Reconcile users, conversations,
   messages, check-ins, habit data, subscriptions, reminders, and all other
   account-owned history; report unmatched/duplicate records without merging.
3. Validate indexes, unique constraints, foreign-key behavior, transaction
   semantics, sequences, timestamps, and rollback/read-only behavior. Repeat
   from a clean backup and record reproducible commands and results.
4. Pass staging checks for sign-in, separate account histories, chat, payments
   and webhook replay/idempotency, Calendar disposition, reminders, voice,
   exports, deletion, and backup restore.
5. Deploy the exact reviewed SHA to the selected provider and verify production health,
   mapped sign-in, database-backed API, AI response, payment/webhook, and
   account-history invariants. Keep encrypted rollback backups through the
   declared retention window.
6. Only then retire Coolify and MongoDB, after confirming the rollback window is
   closed and the final backup is readable.

## Message ownership rollout

The message ownership script is dry-run by default and accepts writes only with
both `--write` and `--non-production`, `NODE_ENV` set to `test`, `development`,
or `staging`, and an explicitly non-production database name. It validates the
entire message collection before writing: every message must resolve to exactly
one conversation, each conversation must have a valid stable Kindred `userId`,
and any existing message `userId` must already match. Updates only fill missing
owners, so repeated runs are idempotent. This work did not run the script or
connect it to production.

Roll out in this order:

1. Back up MongoDB consistently, record collection counts and a tested restore
   identifier, and retain the pre-change application artifact.
2. Restore the backup into an isolated non-production database and rehearse the
   full procedure there. Set `MONGODB_MESSAGE_OWNERSHIP_URI` and
   `MONGODB_MESSAGE_OWNERSHIP_DATABASE` to that restore, then run `pnpm --filter
   @workspace/db migrate:message-ownership` first as a dry-run.
3. Validate that scanned message counts equal the source count, every owner
   matches its conversation owner, and no orphaned or ambiguous conversation
   mapping exists. Stop on any mismatch; do not partially repair it.
4. In staging only, run the same command with `--write --non-production`, then
   rerun the dry-run and require `missingOwner: 0`, unchanged counts, and the
   expected per-owner totals. Exercise chat reads, exports, and account deletion
   with two separate test accounts.
5. Do not deploy owner-scoped reads to production until an operator-approved
   production backfill procedure has repeated the backup, dry-run, owner/count
   validation, write, and post-write validation gates. The checked-in script
   intentionally refuses production; approving or executing that separate
   production procedure is an external release gate.
6. Deploy the exact reviewed artifact only after the production data gate and
   Snyk checks pass. Keep the backup, previous artifact, and Mongo-compatible
   schema through the rollback window. The added `userId` is backward-compatible
   with the previous application, so rollback does not require removing it.

## Cost target (monthly, before payment processing)

The item-by-item cost worksheet is [here](COST_BASELINE.md). Provider invoices,
usage, and plan tiers have not yet been verified.

| Service | Published starting estimate | Actual monthly cost | Notes |
| --- | ---: | ---: | --- |
| Fly Managed Postgres Basic + app | $38.00/month plus $0.28/GB-month based on v2 storage used; latest status showed 2.95 GB used (about $0.83/month); about $5.92/month for a continuously running 1GB shared-cpu-1x app machine at current reference rate | Not measured | Illustrative subtotal $44.75 at observed storage use, before transfer, AI, backups, and retained services; actual region rate and app memory are unverified; no Fly invoice was inspected |
| Cloudflare AI Gateway | $0 for core features; gateway logs may follow Workers Logs pricing depending on first-Gateway date | Not measured | Upstream inference is billed by the selected model provider; configure a global Gateway spend limit and verify log retention/pricing |
| Auth0, Resend, Sentry, Helcim, SMS, voice, domain/DNS, storage, backups | Account-dependent | Not measured | Verify actual plans, usage and renewal amounts |
| **Illustrative Fly app + database subtotal** | **About $44.75/month** with 1GB always-on app compute and the latest reported v2 database storage use | **Not measured** | Leaves about $5.25 under the $50 target before network use, AI, other providers, and backup extras; actual region pricing and bills remain unverified |

The **under-$50/month goal is unverified**, not guaranteed by starting prices.
Before cutover, record recurring invoices, usage-based bills, AI token spend,
and backup/storage costs; configure provider spend alerts and per-user AI
quotas. Exclude payment processing from the target as approved.

Published pricing references, checked 2026-09-24: [Fly Managed Postgres](https://docs.fly.io/mpg), [Fly resource pricing](https://fly.io/docs/about/pricing/), [Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/), and [Cloudflare AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/).

## Explicitly not claimed by this record

This repository record does not prove production provider configuration, a
database migration or restore, a provider-account secret rotation, user
acceptance, production deployment, measured monthly spend, or service
retirement. Those items require the recorded gates and evidence above.
