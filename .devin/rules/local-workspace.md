---
trigger: always_on
---

# Kindred local development / improvements workspace

This rule configures the local Devin workspace (Devin CLI / Devin Desktop running on a developer machine). Use it for feature work and improvements; production fixes go through the cloud workspace (see docs/devin-workspaces.md).

- Toolchain: Node 24 (`engines.node` is `24.x`) and pnpm 10.28.1 via `corepack enable`. Install with `pnpm install --frozen-lockfile`.
- First run / health check: `pnpm workspace:check` installs, seeds `.env.dev` from `.env.dev.example` if missing, boots the stack on a disposable MongoDB, probes `http://127.0.0.1:8080/` and `/api/healthz/db`, then shuts down. Run it after setup and whenever the stack seems broken.
- Run the app: `pnpm dev` (UI on :8080, API on :3000 behind the `/api` proxy). The API is not hot-reloaded — restart `pnpm dev` after API edits.
- Before proposing a change: `pnpm verify` (format, typecheck, frontend/API/journey tests, builds). Focused: `pnpm --filter @workspace/kindred-coach run test`, `pnpm --filter @workspace/db run test:api`.
- Keep `KINDRED_DEV_DB=disposable` and `AI_PROVIDER=disabled` unless the task needs otherwise. Never put secrets in `.env.dev`; never read or write `.env`.
- Never deploy from this workspace (no `fly`/`flyctl`), never touch production data, and work on a feature branch — open a PR into `main` rather than pushing to it.
