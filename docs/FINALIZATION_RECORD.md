# Kindred foundation finalization record

**Baseline:** GitHub `main` at `7c264f6e5fecdee0739075bd66d432bb9fa6ba85` (2026-09-23).
**Purpose:** Close the foundation phase before routine maintenance and focused
feature work. This record distinguishes repository changes from provider and
production gates; a checked-in plan is not proof of a live cutover.

## Direction

- **Application hosting:** DigitalOcean App Platform is the target for the
  production React/Vite app and Express API. Coolify remains available for
  rollback until the DO release and rollback window are verified.
- **Database:** DigitalOcean managed PostgreSQL is the target. Preserve internal
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
| AWS Bedrock provider | Removed from API runtime, dependency, examples, and provider instructions | Confirm no active deployment/workflow still sets Bedrock variables before deleting them from external stores |
| Legacy AWS EKS/KEDA assets | No current GitHub workflow or application-runtime consumer found; docs identify them as pre-Coolify tooling | Preserve until the owner confirms no AWS cluster or rollback deployment depends on them; remove the manifests/scripts after that check |
| TODO/FIXME cleanup | No unresolved TODO, FIXME, XXX, or HACK markers remain in current source; matches are UI `ListTodo` symbols and usage text | Recheck when code changes are finalized |
| OpenAI-compatible AI | Retained; Cloudflare Gateway endpoint supported; request payload logging header added | Provider account, upstream model, privacy contract, Gateway settings, and staging verification remain external gates |
| Snyk | Retained as a required observable scanner; remediation adds literal-ID validation and regression coverage | Snyk must pass on the final integration SHA; no finding suppression is allowed |
| MongoDB and Coolify | Retained temporarily for production and rollback | Do not retire before all cutover gates pass |
| GitHub Actions OpenCode bot | Hardened: exact action commit pin, comment-only triggers, trusted collaborator gate, job-scoped permissions, no `id-token: write` | Verify the workflow still serves an operator need and confirm `OPENCODE_API_KEY` scope in GitHub |
| Repository secrets | Inventory rewritten without values; GitHub secret names and environment metadata recorded | Verify production/workflow consumers in provider UI. Remove only confirmed-unused names; rotate any confirmed exposed active credential |
| Git history secret scan | Current tree and 417 commits scanned with redacted output; generic matches classified as public IDs/examples/tests; no fingerprint match in repository deploy keys | A valid encrypted SSH private key is present in reachable history; owner and active account registration are unknown. Revoke if registered and coordinate all-ref history rewrite |
| GitHub branch cleanup | 18 remote refs inspected; no pull requests are currently open | 16 branches have unique commits and one merged branch is only two days old. Preserve all until change review/owner disposition; details in [branch cleanup record](BRANCH_CLEANUP.md) |
| Local checkout cleanup | Original checkout is 237 commits behind canonical `main` with one unmerged unique commit; other owner worktrees were preserved | Review/port the unique commit and resolve invalid registration only with owner approval; see [workspace checkout audit](WORKSPACE_CHECKOUTS.md) |
| Old branches and duplicate checkouts | Unique local checkout and branch preserved; canonical GitHub baseline selected | Archive or delete stale remotes only after ancestry/equivalent-change checks |

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
5. Deploy the exact reviewed SHA to DigitalOcean and verify production health,
   mapped sign-in, database-backed API, AI response, payment/webhook, and
   account-history invariants. Keep encrypted rollback backups through the
   declared retention window.
6. Only then retire Coolify and MongoDB, after confirming the rollback window is
   closed and the final backup is readable.

## Cost target (monthly, before payment processing)

| Service | Published starting estimate | Actual monthly cost | Notes |
| --- | ---: | ---: | --- |
| DigitalOcean App Platform, 1 GiB fixed container | $10.00 | Not measured | Published baseline; bandwidth overage and extra components may add cost |
| DigitalOcean managed PostgreSQL, 1 GiB | $15.15 | Not measured | Storage/backup/extra-node choice can change the bill |
| Cloudflare AI Gateway | $0 for core gateway features | Not measured | Upstream inference is billed by the selected model provider; logging limits and optional features apply |
| Auth0, Resend, Sentry, Helcim, SMS, voice, domain/DNS, storage, backups | Account-dependent | Not measured | Verify actual plans, usage and renewal amounts |
| **Infrastructure subtotal for the two DO baseline items** | **$25.15** | **Not measured** | Leaves at most $24.85 under a $50 target for every other included service and usage |

The **under-$50/month goal is unverified**, not guaranteed by starting prices.
Before cutover, record recurring invoices, usage-based bills, AI token spend,
and backup/storage costs; configure provider spend alerts and per-user AI
quotas. Exclude payment processing from the target as approved.

Published pricing references, checked 2026-09-23: [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/details/pricing/), [DigitalOcean managed databases](https://www.digitalocean.com/pricing/managed-databases), and [Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/).

## Explicitly not claimed by this record

This repository record does not prove production provider configuration, a
database migration or restore, a provider-account secret rotation, user
acceptance, production deployment, measured monthly spend, or service
retirement. Those items require the recorded gates and evidence above.
