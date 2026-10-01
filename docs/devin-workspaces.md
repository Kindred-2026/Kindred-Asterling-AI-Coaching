# Devin workspaces

Kindred has two Devin workspace profiles.

## 1. Local development / improvements workspace

Runs on a developer machine with Devin CLI or Devin Desktop (local agent), against a local clone.

- Configuration is committed in the repo: `.devin/rules/local-workspace.md` (always-on agent rules) and `.devin/config.json` (shared permissions: pnpm/git read commands allowed; `sudo`, `fly`/`flyctl` and `.env` access denied). Personal overrides go in `.devin/config.local.json` (git-ignored by Devin CLI).
- Setup:

  ```sh
  # Node 24 (e.g. nvm install 24) then:
  corepack enable
  pnpm workspace:check
  ```

- `pnpm workspace:check` is the "does it run" test: it checks Node 24/pnpm, runs `pnpm install --frozen-lockfile`, creates `.env.dev` from `.env.dev.example` if missing, boots `pnpm dev` on a disposable MongoDB, probes the UI and `GET /api/healthz/db` through the Vite proxy, then stops the stack and requires a clean exit. It exits non-zero with the captured dev output on any failure (port conflict, build error, unhealthy DB).
- Start the Devin CLI in the repo root (`devin`); use `/handoff` to move a task to the cloud workspace.

## 2. Cloud workspace (GitHub-connected, testing and bugfixes)

Runs in Devin's cloud VM from the repository blueprint (Devin Settings > Environment > Blueprints > Kindred-2026/Kindred-Asterling-AI-Coaching). Every session boots with Node 24, pnpm and dependencies installed, the repo cloned from GitHub, and the test/dev commands available, so Devin can reproduce bugs, run `pnpm dev`/`pnpm verify`, and open PRs against `main` that GitHub CI checks.

Start sessions from the Devin web app, Slack, or `devin --cloud` in the CLI.
