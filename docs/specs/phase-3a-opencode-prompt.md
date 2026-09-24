# OpenCode assignment — Phase 3A: start the real Kindred product

> **Historical document.** This assignment prompt is superseded operational guidance.
> GitLab is confirmed unused by the owner; GitHub Actions is the sole active CI path.
> Current instructions and source of truth are in `docs/FINALIZATION_RECORD.md`
> and the current release/rollback documentation. No Fly.io deployment is claimed.

You are implementing Part 3A only. Complete the authorized code, tests and local
documentation; do not stop at a proposed plan. Founder/Codex will review the diff
and handle provider configuration, release integration and deployment. Do not
implement Parts 3B–3D beyond the first-run documentation necessary for 3A.

## Context and source of truth

Primary repository:
`/home/griffixchips/Documents/Default Project/Kindred-Asterling-AI-Coaching`

Read `AGENTS.md` and `docs/specs/phase-3-developer-workflow.md` before editing.
GitLab `origin` is authoritative; never push to the GitHub mirror. Production is
React/Vite (`artifacts/kindred-coach`) plus Express (`artifacts/api-server`), with
Auth0 and MongoDB. The founder reports the cutover complete. Do not reopen it or
infer current provider values from historical notes. Next.js `frontend/` is an
experiment. Use Node 24 and the repository's declared pnpm 10 version.

## First actions: preserve ongoing work

1. Record `pwd`, branch, HEAD, remotes and `git status --short` in the primary
   checkout. Fetch `origin` and inspect relevant branch history without changing
   the checkout. Read local instructions and identify the reviewed cutover base.
2. The primary checkout has concurrent Auth0, Vite and MongoDB changes. Do not
   stash, reset, clean, switch branches there, or copy its secret environment files.
   Create an isolated worktree on `codex/phase-3a-dev-workflow` from the verified
   integration base. Do not assume the primary branch, an old SHA, or main alone
   includes all completed cutover work. If the correct base cannot be established,
   report the exact conflicting refs for Codex to resolve before dependent edits.
3. Carry these two scope documents into the isolated worktree if absent, without
   copying unrelated changes. Keep all new work there. No force pushes, merges,
   deployments or production database access. No additional agents are needed.

## Deliverable

After documented one-time configuration, root `pnpm dev` starts the real Vite
frontend and Express API together. It does not start Next.js. Both child processes
must stop cleanly when the user exits or one process fails.

## Implementation requirements

- Prefer a small Node 24 process supervisor and existing package commands. Avoid
  introducing a task runner or dependency unless an existing mechanism cannot
  handle the requirement. Do not use shell-interpolated environment values.
- Separate frontend and API port settings. Proposed defaults: browser
  `http://localhost:8080`, API `http://127.0.0.1:3000`, base path `/`.
  Check the current baseline before selecting final names. Inject `PORT` separately
  into each child; set the frontend API proxy to the selected API origin.
  Validate integer ports in 1–65535 and reject conflicting ports.
- Never silently move Vite to another port; that can break Auth0 callbacks.
  Report occupied ports and leave unrelated processes alone. A port preflight
  does not replace handling an actual bind failure.
- Start/rebuild the API using the supported build path. Preserve existing API
  startup validation, MongoDB pool lifecycle and graceful shutdown. Document
  whether API edits restart automatically; do not add hot reload unless needed.
- Propagate startup/build failures to the root command with a nonzero exit code.
  SIGINT/SIGTERM must clean up only child processes owned by this invocation,
  including pnpm wrappers. Bound cleanup and handle partial startup. Never use
  global `pkill`, `killall`, or port-based process killing.
- Define environment file location and precedence explicitly. Prefer an isolated
  development configuration; inherited environment overrides should be deliberate.
  Preserve the current Vite public Auth0 configuration behavior and avoid two
  conflicting sources for issuer/audience. Missing-variable diagnostics name keys,
  not values. Do not expose server secrets through Vite.
- Do not read/copy production credentials or auto-load a production database URI.
  Use a documented dedicated development database or a locally provisioned
  disposable replica set without Docker. Make that choice explicit; do not
  silently fall back to production or claim a placeholder database is usable.
- Preserve real authentication. Document the development Auth0 SPA's callback,
  logout and origin requirements; provider creation/configuration is a human
  handoff, not permission to change the production tenant or hardcode its IDs.
- Account for reminder scheduling at API startup. Normal local development must
  not send background messages by accident. If needed, add a development-launcher
  scheduler opt-out, defaulted off by this launcher only, without changing normal
  production scheduling. Automated tests use mocks and disposable data. No live
  payments, email/SMS deliveries, AI requests or voice calls during validation.
- Retain an explicit `pnpm dev:experiment` (or similarly clear documented command)
  for Next.js; do not move/delete the experiment or alter its implementation.
- Document prerequisites, installation, configuration, startup URL, ports, proxy,
  signal handling, unavailable optional integrations and troubleshooting. Be clear
  that one-command startup follows first-time setup, not that credentials appear
  automatically.

## Allowed changes

- Root `package.json`: development scripts and a narrowly justified development
  dependency only. Do not implement `verify` or `release:check` in this part.
- New `scripts/dev.mjs` and narrowly named supervisor helpers/tests; a focused test
  script if needed to run those tests.
- `artifacts/kindred-coach/package.json` and `vite.config.ts`: local launch/proxy
  wiring only; preserve existing production build and auth fixes.
- `artifacts/api-server/package.json`: local launch wiring only. Preserve existing
  build/start semantics; avoid changing `build.mjs` unless a concrete need appears.
- API `src/index.ts`, `src/lib/reminderScheduler.ts` and focused tests only when
  necessary for a development-only scheduler guard or verified shutdown defect.
- A new `docs/local-development.md`, a secret-free development environment example,
  and narrow `.gitignore` entries for the new development configuration.
- `pnpm-lock.yaml` only if a justified dependency change requires regeneration.

Read any files needed for understanding. If an essential fix exceeds these edit
boundaries, describe the exact expansion to Codex rather than changing it silently.

## Prohibited changes

No Docker/container/Kubernetes/EKS work; no CI edits (Part 3C); no auth-flow rewrite,
schema/data migration, identity linking, provider settings, billing/entitlement
changes, UI redesign, monitoring/security removal, or broad dependency cleanup.
Preserve canonical and legacy routes, both founder accounts, Calendar sunset and
revocation support, medications, reminders, payments, coaching and voice.
Do not modify actual `.env*` files, print credentials, or make remote state changes.

## Tests and acceptance evidence

Use meaningful process-level tests with fake children that do not call providers:

1. Correct frontend/API child commands and distinct ports; no Next process.
2. Environment precedence, missing config, invalid ports, duplicate/occupied ports.
3. API build/start failure and frontend failure: nonzero parent exit and cleanup.
4. SIGINT/SIGTERM and partial startup: all owned children exit, unrelated processes
   remain alive, and ports can be reused. Test the actual wrapper/process tree.
5. Development scheduler suppression and unchanged production behavior if changed.

Run the new focused tests, frontend tests/typecheck, API harness, affected script
typechecks, production frontend/API builds with synthetic public Auth0 identifiers,
and `git diff --check`. Existing standard commands include:

```sh
pnpm --filter @workspace/kindred-coach run typecheck
pnpm --filter @workspace/kindred-coach run test
pnpm --filter @workspace/db run test:api
pnpm --filter @workspace/api-server run build
```

Use the frontend build command present in the verified base (including its config
guard where applicable). Never point `test:api` at production. Existing database
and connection-pool changes must not be overwritten to make tests pass.

Rehearse documented startup from a clean checkout with development-only config:
Vite loads, the API health request works through `/api`, and Ctrl+C cleans up both.
Where development credentials are available, have the user complete a real Auth0
sign-in and verify return to `/today`. Otherwise record that human acceptance as
pending; do not fake authentication or report it passed. Automated work may still
be completed and delivered for review while that specific check is pending.

## Return to Codex

Provide: baseline SHA, worktree/branch, changed files, concise behavior/risk summary,
exact commands and results, startup instructions, environment-key names only,
and remaining human checks. Supply the reviewable diff. State explicitly whether
work is uncommitted or locally committed. Do not push, merge or deploy. Stop after
3A; Codex will review it and provide the separate 3B assignment.
