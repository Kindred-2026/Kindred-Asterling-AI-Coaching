# Kindred foundation finalization record

**Baseline:** GitHub `main` at `49e0be1199d1ce91e951d2b0d468fb352fb13381` (2026-09-24, before this Snyk workflow follow-up).
**Purpose:** Close the foundation phase before routine maintenance and focused
feature work. This record distinguishes repository changes from provider and
production gates; a checked-in plan is not proof of a live cutover.

## Direction

- **Application hosting:** Fly.io is the selected provider. The user confirmed
  account and payment access only; no Fly app or deployment has been reported.
  Keep Coolify available until a
  replacement release and rollback window are verified.
- **Database:** Fly Managed Postgres in Toronto (`yyz`) is the target, pending
  resource verification, real-server adapter validation, and successful
  migration/restore rehearsal.
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
| Experimental Next.js `frontend/` | Removed from workspace, scripts, docs, and standalone CI; production React/Vite app retained | Verify the resulting single production build path in CI |
| Dormant Clerk dependency override | Removed from `pnpm-workspace.yaml` and `pnpm-lock.yaml` after repository-wide search found no dependency or import consumer | Clerk identity mapping, webhook, and rollback utilities remain retained behind the Auth0 reconciliation and rollback gates |
| Superseded release SOP exports | Removed the stale HTML, DOCX, and PDF that prescribed Coolify, Clerk, Ollama, and a future GitLab pipeline | README now points to the Fly runbook and release/rollback guide; Coolify's separately labeled legacy deployment record remains available while cutover gates are open |
| AWS Bedrock provider | Removed from API runtime, dependency, examples, and provider instructions | Confirm no active deployment/workflow still sets Bedrock variables before deleting them from external stores |
| Legacy AWS EKS/KEDA assets | Removed after the owner confirmed there is no AWS cluster; repository search found no active workflow or application-runtime consumer | Removed the EKS Terraform, Karpenter/KEDA/metrics-server manifests, deploy scripts, and version pins. AWS resources were not changed |
| TODO/FIXME cleanup | No unresolved TODO, FIXME, XXX, or HACK markers remain in current source; matches are UI `ListTodo` symbols and usage text | Recheck when code changes are finalized |
| OpenAI-compatible AI | Retained; Cloudflare Gateway endpoint supported; request payload logging header added | Provider account, upstream model, privacy contract, Gateway settings, and staging verification remain external gates |
| Snyk | Retained as an observable scanner. Messages now carry the stable internal Kindred `userId`; chat reads/writes, account exports, and account deletion use that owner instead of rebuilding message selectors from database-returned conversation IDs. No suppression was added. | The earlier finalization checks passed at PR SHA `238ab8ab886a3cbbe2d1dd124b804de53405b7d1`. On PR #147, Snyk Code passed but the Snyk job failed at IaC: the repository had no supported IaC files, and the org's monthly private-test limit was reached; Docker/container scanning did not run in that job. PR #148 adds a file-presence check: IaC is skipped only when no supported files exist, and `snyk iac test --report` still runs with fatal failures when files are present. At PR #148 head `690853726651652c22ef8129b0ab559c788ce988`, CI, Security Audit, Snyk, and Snyk Code all passed. Open Source and Container use `monitor`, which submits results but does not gate on findings; review their project results in Snyk before merge. Production remains blocked on ownership backfill and cutover gates below |
| MongoDB and Coolify | Retained temporarily for production and rollback | Do not retire before all cutover gates pass |
| Hosting provider decision | DigitalOcean rejected the available payment methods; user selected Fly.io and confirmed account/payment access only. Railway was evaluated but not selected because its listed app/database regions omit Canada | No Fly app or database is reported as deployed. Verify the Fly organization, Toronto app and Managed Postgres resources, billing, maintenance responsibility, and measured costs. See [Fly.io deployment runbook](FLY_DEPLOYMENT.md) and [cost baseline](COST_BASELINE.md). The DigitalOcean guides remain marked as superseded evaluations |
| PostgreSQL runtime and migration foundation | Added an opt-in `DATABASE_PROVIDER=postgres` runtime adapter and `POSTGRES_URL` contract; MongoDB remains the default. Also added a reviewed all-20-collection rehearsal schema, per-row validation, stable-ID and owner-relationship checks, bounded source snapshot reads, and rollback-by-default replay | Adapter/schema tests use local fixtures. No real PostgreSQL server, Fly app/database, production migration, restore, or staging acceptance was run. The runtime adapter must pass real PostgreSQL integration and full application path checks before it can be enabled |
| GitHub Actions OpenCode bot | Hardened: both the OpenCode action and checkout action use exact commit pins, comment-only triggers, trusted collaborator gate, job-scoped permissions, no `id-token: write` | Write grants remain for repository edits and issue/PR replies. Verify the workflow still serves an operator need and confirm `OPENCODE_API_KEY` scope in GitHub |
| GitHub Actions runtime | CI, Security Audit, and Snyk action references use immutable SHAs for the verified Node 24 releases of checkout, setup-node, pnpm setup, artifact upload, and CodeQL SARIF upload | Exact SHAs were resolved from upstream release tags and each action's `action.yml` runtime was checked; validate behavior with PR checks |
| Delegated work | OpenCode authenticated with `openai/gpt-6-luna`, passed a read-only checkout smoke test, and authored the Fly staging runbook in an isolated worktree (`8b67f0a`); its reviewed documentation change is integrated here as `335508b`. OpenCode also fixed selected PostgreSQL aliases (`0c3ce2a`, integrated as `5cb7592`) and implemented the bounded Snyk IaC workflow follow-up in isolated worktree commits `1492e01` and `347399b` (cherry-picked here as `6a148d4` and `ca6ed21`); fixture checks passed and no Snyk command was invoked. | Devin authenticated on the Free tier; this read-only audit attempt was blocked because the selected model requires Pro, and no Devin files changed. A prior same-day read-only audit had also hit the Free-tier daily quota. Neither tool received provider credentials or account access. Real PostgreSQL integration/restore remains an external gate, and `pg-mem` fixtures do not satisfy it |
| Repository secrets | Inventory rewritten without values; removed unused GitHub `CLERK`, `NEON_API_KEY`, and `NEON_PROJECT_ID` entries after verifying no consumer in either `main` or the finalization workflows; only `OPENCODE_API_KEY` and `SNYK_TOKEN` remain | Direct environment API queries found no environment-level secrets or variables; historical GitHub deployment records remain. Verify external purposes before deleting environments or rotating runtime credentials |
| Git history secret scan | Current tree and 417 commits scanned with redacted output; generic matches classified as public IDs/examples/tests; no fingerprint match in repository deploy keys | A valid encrypted SSH private key is present in reachable history; owner and active account registration are unknown. Revoke if registered and coordinate all-ref history rewrite |
| GitHub branch cleanup | Deleted the merged PR #145 branch after verifying its tip was an ancestor of canonical `main`; archived all 16 unique historical branch tips under verified GitHub tags, then deleted their stale branch names. PR #147 removed the confirmed-unused AWS EKS assets and merged at `49e0be1`. | The verified 2026-09-24 inventory contains `main`, `codex/snyk-iac-no-files` (PR #148), and `codex/remove-dead-clerk-release-docs` (PR #149, stacked on #148). The temporary post-merge `codex/remove-confirmed-unused-eks-assets` branch was deleted after verifying its Snyk workflow commits were carried into PR #148. No unique commits were lost; all 16 historical tips have dispositions in [the branch cleanup record](BRANCH_CLEANUP.md) |
| Local checkout cleanup | Original `main` is aligned to canonical `49e0be1`; former unique commit is preserved at local archive ref `archive/kindred-local-main-40c8841`. Its clean nested canonical clone was moved intact to a sibling archive after verifying no ignored or untracked files. Removed 12 clean delegated worktree directories after confirming their changes were integrated; retained their local branch refs | No unique change from the old commit was ported because its gitlink, privacy statement, and workspace placeholder were invalid or superseded. Preserved the separate Auth0 migration checkout with local changes and the invalid Copilot worktree registration; see [workspace checkout audit](WORKSPACE_CHECKOUTS.md) |
| Old branches and duplicate checkouts | Unique local checkout and branch preserved; canonical GitHub baseline selected; 16 stale remote branch names removed after exact tip archive and open-PR checks | Unique historical commits remain retrievable from archive tags; see [the branch cleanup record](BRANCH_CLEANUP.md) |

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
| Fly Managed Postgres Basic | $38.00/month plus $0.28/GB/month provisioned database storage | Not measured | Selected but not deployed; application compute, egress, and other retained services are extra; no Fly invoice was inspected |
| Cloudflare AI Gateway | $0 for core gateway features | Not measured | Upstream inference is billed by the selected model provider; logging limits and optional features apply |
| Auth0, Resend, Sentry, Helcim, SMS, voice, domain/DNS, storage, backups | Account-dependent | Not measured | Verify actual plans, usage and renewal amounts |
| **Infrastructure baseline before app compute** | **At least $38/month plus database storage** | **Not measured** | Leaves less than $12 for app compute and all other services under the $50 target; actual target is unverified |

The **under-$50/month goal is unverified**, not guaranteed by starting prices.
Before cutover, record recurring invoices, usage-based bills, AI token spend,
and backup/storage costs; configure provider spend alerts and per-user AI
quotas. Exclude payment processing from the target as approved.

Published pricing references, checked 2026-09-24: [Fly Managed Postgres](https://docs.fly.io/mpg), [Fly resource pricing](https://fly.io/docs/about/pricing/), and [Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/).

## Explicitly not claimed by this record

This repository record does not prove production provider configuration, a
database migration or restore, a provider-account secret rotation, user
acceptance, production deployment, measured monthly spend, or service
retirement. Those items require the recorded gates and evidence above.
