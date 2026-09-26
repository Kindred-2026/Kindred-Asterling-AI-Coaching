# Phase 3 — Reliable development and release workflow

> **Historical document.** This specification is superseded operational guidance.
> GitLab is confirmed unused by the owner; GitHub Actions is the sole active CI path.
> Fly.io is the selected hosting target; Coolify is retained only for rollback.
> Current instructions and source of truth are in `docs/FINALIZATION_RECORD.md`
> and the current release/rollback documentation (`docs/release-rollback.md`,
> `docs/FLY_DEPLOYMENT.md`). No Fly.io deployment has been completed.

Refined September 12, 2026. Scope proposal based on the original September 1
roadmap and the founder's confirmation that the Auth0 cutover is complete.
This document authorizes no deployment, provider change, or data migration.

## Outcome

After documented first-time setup, one command starts the real Kindred product,
one command verifies it, and one command prepares an honest release report.
GitLab CI was intended to check the same production packages and contracts as local
verification. That historical requirement is superseded by the active GitHub Actions path.

## Baseline and implementation entry

- Production is React/Vite in `artifacts/kindred-coach`, Express in
  `artifacts/api-server`, Auth0 authentication, and MongoDB Atlas storage.
- This proposal's baseline used GitLab `origin` and Coolify. Those directions are
  superseded: GitHub `main` is authoritative and Fly.io is the selected target;
  Coolify remains only for rollback. Node 24 and pnpm 10.
- Preserve canonical `/today`, `/talk`, `/insights`, `/you` URLs and legacy links.
- Preserve coaching, voice, payments, medications, reminders, account security,
  security scanning, and existing monitoring. Calendar stays sunset in the UI;
  existing disconnect/revocation and retained data remain available.
- Preserve both founder accounts separately and retain rollback assets until
  retirement is explicitly approved. Phase 3 does not repeat the cutover.
- Before implementation, reconcile the completed cutover's deployed SHA and
  reviewed changes with GitLab `main`. At this scope audit, fetched `origin/main`
  was `2205b982401cd809fd0a297eb9cd378e5e0c0159`; the primary checkout was on
  another branch with unrelated edits. That is repository evidence, not a claim
  about the current production revision. Start implementation in an isolated
  checkout of the reconciled baseline; do not overwrite concurrent work.

## 3A — Start the real product

- Make root `pnpm dev` start Vite and Express together, with coordinated shutdown
  and clear failure reporting if either process fails or a port is occupied.
- Document one consistent browser URL, API proxy, Auth0 callback, environment
  loading order, and development database setup. Provide safe example values and
  actionable missing-variable errors without printing secrets.
- Use a separate development database and suitable development Auth0 application;
  require neither production credentials nor changes to production providers.
- Document which features need provider credentials. Do not bypass authentication
  or silently send real payments, emails, SMS, or reminders during automated tests.

Acceptance: from a clean checkout, following the setup guide once then running
`pnpm dev` opens the Vite product, reaches the API, and supports a development
Auth0 sign-in. Ctrl+C stops both processes. Missing configuration and occupied
ports produce clear errors without changing unrelated processes.

## 3B — One verification command

- Add `pnpm verify` covering scoped formatting checks, production types, frontend
  tests, API tests, generated-client consistency, and production builds/prerender.
- Reuse the disposable MongoDB replica-set API harness and existing daily-journey
  harness. Include the daily journey in the complete verification path; retain
  focused commands for fast iteration.
- Check OpenAPI/Orval-generated React clients and Zod schemas in temporary output
  or an isolated checkout. Detect drift without rewriting the developer's files.
- Use synthetic public Auth0 build values and mocked external services for
  automated checks. Live authentication remains a separate acceptance step.
- Keep full-workspace/experiment checks explicitly available. Exclude experimental
  packages from the normal production path only after checking shared dependencies.
- Avoid a repository-wide formatting rewrite; define the maintained formatting
  boundary and introduce any necessary baseline separately.

Acceptance: verification passes from a clean checkout without production secrets,
fails on a relevant type/test/contract/build error, and leaves tracked files
unchanged. A generated-client mismatch is detected. No production DB or real
provider delivery is used by the automated suite.

## 3C — Align CI and release checks

- The original proposal called for GitLab jobs to use the same verification
  components and pinned toolchain. This is superseded by GitHub Actions.
  Reuse caching and remove duplicate work where safe; parallel jobs are acceptable.
- Preserve SAST, dependency scanning, secret detection and other existing security
  tooling. Avoid unnecessary branch/MR duplicate pipelines without suppressing
  required release checks. Never mark skipped checks as passed.
- Keep the experiment out of production build/test jobs; changes to shared code,
  lockfiles, API contracts, auth, DB libraries, or verification scripts still run
  all affected checks. Do not hide shared-code failures behind path filters.
- Add `pnpm release:check` as a read-only report: exact SHA and branch, worktree
  changes, verification evidence, required public build/runtime variable names,
  frontend/API issuer consistency, and the remaining deployment checklist.
- Distinguish local validation, push, CI, merge, deployment, and production proof.
  Offline or unavailable remote evidence must be reported as unverified.
- The original proposal called for documenting the Coolify release/rollback
  process. That is superseded by the Fly.io runbook and release/rollback guide.
  Record the deployed revision. The command must not push, merge, deploy, restart services,
  modify provider settings, print secret values, or apply migrations.
- Report CI quota/runner problems as infrastructure blockers. No billing changes,
  new paid runners, or weakened required checks are part of implementation.

Acceptance: the production CI path runs the same checks as local verification;
an experiment-only change does not require an experimental build in production
jobs. Release output clearly identifies the candidate and missing evidence, and
does not claim that passing local checks proves a live deployment.

## 3D — Documentation and bounded repository cleanup

- Publish architecture, first-run, command-reference, troubleshooting, verification,
  and release documentation for the Auth0/MongoDB product.
- Document MongoDB initialization, restore validation and identity-mapping tools,
  including read/write behavior, explicit target guards and dry-run defaults.
  Keep historical migration identifiers and rollback tools unchanged. Do not
  introduce another migration framework merely to standardize filenames.
- Inventory unused UI dependencies and old infrastructure assets. Only remove a
  demonstrably unused dependency in a small follow-up with import, build and
  relevant UI evidence. Broad dependency cleanup is not an acceptance requirement.

Acceptance: another developer can follow the documentation without choosing the
wrong frontend, database or auth provider. Command names match package scripts;
historical operational documents are clearly labeled rather than silently erased.

## Explicitly outside Phase 3

- New product features, redesign, pricing, AI budgets or cost-control features
  (the original Phase 4 topic).
- Another authentication/database cutover, production account mapping, data cleanup,
  Clerk/provider retirement, credential rotation or Calendar credential deletion.
- Dockerfile/container work, Kubernetes/EKS changes or archival, hosting migration,
  new infrastructure, or Cloudflare/DNS changes.
- Replacing monitoring/security services or changing GitLab protection policies.
- Automatic deployment, real charges, or unsolicited test messages to users.

## Delivery order and completion evidence

Implement 3A, then 3B, then 3C, with 3D documentation maintained alongside each.
Keep each change reviewable and preserve unrelated work. Do not spawn additional
agents or delegate work merely because the original roadmap named OpenCode.

For each change, report focused tests and omitted checks. Before completion run
frontend tests/typecheck, the disposable API harness, applicable journey and
generated-client checks, production builds and `git diff --check`. Record a clean
checkout onboarding rehearsal and actual GitLab CI evidence for the exact SHA.
Deployment is a separate authorized action, not required to claim developer
workflow implementation is complete.

Scope-document validation: repository scripts and GitLab main were read; no
application or provider behavior was changed and no runtime tests were run for
this documentation-only proposal.
