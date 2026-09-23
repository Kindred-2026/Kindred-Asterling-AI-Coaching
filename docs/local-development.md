# Local development

`pnpm dev` at the repository root starts the **real product stack** together:

- the React/Vite production frontend (`artifacts/kindred-coach`) on `http://localhost:8080`, and
- the Express API (`artifacts/api-server`) on the same `/api` origin (the Vite dev
  server proxies `/api` to the API), backed by a disposable MongoDB.

The legacy Next.js experiment is **not** part of this command. Use
`pnpm dev:experiment` if you still need it.

## Prerequisites

- Node 24+ and pnpm (the repo pins `pnpm@10.28.1`; use it if you can: `corepack enable` + `pnpm i`).
- `pnpm i` at the root (installs workspace `node_modules`).
- Ports `8080` and `3000` free (change them in `.env.dev` if not).

## First-time setup: `.env.dev`

Copy the committed example and adjust:

```sh
cp .env.dev.example .env.dev
```

`.env.dev` is git-ignored; the launcher merges it with your shell environment
(**shell wins**), then applies safe defaults for what still is missing.

Minimum to run (`KINDRED_DEV_DB=disposable`): no local MongoDB needed. The
launcher provisions an in-memory replica set, injects its `MONGODB_URI`, and
tears it down when you stop `pnpm dev`.

- **Unset `VITE_AUTH0_CLIENT_ID`** and it falls back to `artifacts/kindred-coach/.env.local`
  (the Auth0 onboarding file) if you have it. Blank or unset `VITE_*` keys are
  treated as "not set" — the launcher never forwards an empty string to Vite —
  so Vite naturally falls back to the package file, while an explicit nonblank
  shell value still wins.
- **`AI_PROVIDER=disabled`** keeps the API runnable without AI infrastructure;
  switch to `openai`/`ollama` when you need live AI. Hosted endpoints should be
  used only with synthetic data unless the provider review is complete.
- Secret values (`RESEND_API_KEY`, `OPENAI_API_KEY`, calendar keys, …) belong in
  your environment or a secrets manager, **never** in `.env.dev`. The launcher
  sends only public nonblank `VITE_*` values to the browser child; anything else
  in `.env.dev` goes only to the API child, but keeping secrets out keeps them
  out of the repo and out of any logs.

### Auth0 for local development

Sign-in needs three public values, only in your control:

| Value | Where | What it must be |
| ----- | ----- | --------------- |
| `VITE_AUTH0_DOMAIN` / `AUTH0_DOMAIN` | `.env.dev` | your Auth0 tenant region, e.g. `YOUR-DEV-TENANT.us.auth0.com` (same value on both sides) |
| `VITE_AUTH0_CLIENT_ID` | `.env.dev` or the package `.env.local` | the **public** client id of your Auth0 application (never a secret) |
| `VITE_AUTH0_AUDIENCE` / `AUTH0_AUDIENCE` | `.env.dev` | an API identifier registered in your tenant **and** accepted by the backend guard — both sides must use the same audience |

The frontend uses the `<auth0-react>` provider with `redirect_uri`/logout both
at `{origin}/`, and the backend validates JWTs with issuer
`https://{AUTH0_DOMAIN}/` and the configured audience. So the frontend domain
and audience must match the backend `AUTH0_DOMAIN`/`AUTH0_AUDIENCE`.

Creating/populating that Auth0 Application is a manual step in the Auth0
Dashboard (done by a developer with tenant access; this repo never copies
credentials and never touches the provider):

- **Allowed Callback URLs**: `http://localhost:8080/` (the frontend origin; the
  provider redirects back to `{origin}/`).
- **Allowed Logout URLs**: `http://localhost:8080/`.
- **Allowed Web Origins**: `http://localhost:8080`.
- **API**: an API whose **Identifier** equals the audience chosen above and is
  trusted by the backend.

Until those values are set, `AuthProvider` renders "Sign-in is not configured"
rather than crashing — the rest of the stack keeps working.

### Database modes

`KINDRED_DEV_DB` in `.env.dev`:

| Value        | What happens                                                   |
| ------------ | -------------------------------------------------------------- |
| `disposable` | (default) in-memory MongoDB replica set, no install needed; data is lost on exit |
| `external`   | you provide `MONGODB_URI` + `MONGODB_DATABASE` pointing at your own MongoDB |

Use `external` when you want persistent local data or need an existing dataset.

## Running

```sh
pnpm dev
```

The launcher:

1. validates configuration and checks `8080`/`3000` are free,
2. provisions the database (disposable replica set) before anything starts,
3. runs the API build (fails fast, so you don't hit a stale build),
4. starts the frontend and API as separate process groups and waits until both
   are ready (frontend port bound **and** `GET /api/healthz/db` answers),
5. prints a readiness line (`[dev] Both development servers are ready: …`)
   only once that health check succeeds.

The API runs the built server (not a watcher), so **editing API code requires
stopping `pnpm dev` and starting it again** — there is no API hot reload. The
frontend (Vite) hot-reloads on its own.

Stop with `Ctrl+C` (or `SIGTERM`) — at *any* point, including during the build
and database provisioning. The launcher signals only the processes it owns and
waits briefly, then force-stops stragglers — nothing on the machine is touched
that it did not start. An interruption cancels further startup.

The disposable database is stopped on every exit path: provisioning and shutdown
share one lifecycle, so even a replica set that finishes starting *after* the
interruption is stopped, and shutdown is never declared complete while it could
still leave a database behind. Cleanup is bounded for process groups **and**
services: if a stop cannot be verified in time, own resources are force-released
through a supported fallback and the shutdown is reported as a failure. Exit
code is `0` after a clean stop (including a database that finished starting
during the interruption), non-zero after a startup or runtime failure, and
non-zero when cleanup could not be verified.

Partial startups (frontend crash, API crash, port conflict, build failure) are
surfaced with a clear reason and the other child is cleaned up.

## Full verification: `pnpm verify`

When you are unsure whether your local change is releasable, run the full gate —
it executes the same components as GitHub Actions, in the same order, from a
sanitized child environment (no secrets or `VITE_*` build values are forwarded,
so applications resolve their own committed dev values):

```sh
pnpm verify
```

Components: `format:check`, `typecheck:production`, `test:dev-supervisor`,
`test:frontend`, `test:api`, `test:journey`, `generate:check`, `build:api`,
`build:frontend`. The run fails fast (stops at the first failing component) and
a full pass records `.verify-evidence.json` (git-ignored) keyed to your exact
commit + working-tree state.

Focused checks you can run on their own:

```sh
pnpm run format              # rewrite formatting on the maintained boundary
pnpm run format:check        # verify formatting only
pnpm run test:verify         # unit tests for the verify/format machinery
pnpm run test:release-check  # unit tests for the release gate
pnpm run generate:check      # generated-client drift check (no file writes)
pnpm run test:dev-supervisor # unit tests for this launcher
pnpm --filter @workspace/kindred-coach run test
pnpm --filter @workspace/db run test:api
pnpm --filter @workspace/db run test:journey
```

`generate:check` reproduces the committed orval invocation inside a throwaway
sandbox copy and byte-compares the generated clients with the tracked trees; it
never mutates your working tree.

## Release gate: `pnpm run release:check`

A read-only evidence report for release decisions — never runs builds, tests or
installs, never writes anything, never calls a remote. It reports the exact
candidate SHA/branch and working-tree state, whether the last `pnpm verify`
evidence matches that candidate, which required public Auth0 variables are
present and whether the web/API issuer + audience are consistent (values are
never printed), plus push / CI / merge / deploy / acceptance / rollback status.
Local proof is distinct from CI proof and production proof; anything it cannot
observe is marked unverified. See `docs/release-rollback.md`.

## Manual spot checks against the running dev stack

- API health through the Vite proxy: `curl http://localhost:8080/api/healthz/db`
- Both processes exit: `ps -ef | grep -E "kindred-coach|api-server"` after
  `Ctrl+C` shows no leftovers.

## Tests for the launcher itself

```sh
pnpm run test:dev-supervisor
```

Spawns the real CLI against fake children to prove process-group shutdown:
all owned children (and pnpm-style grandchildren) exit on SIGINT/SIGTERM and on
child/build failure, unrelated processes survive, ports become reusable, a
signal during a long build or during database provisioning leaves nothing
behind, and descendants that ignore SIGTERM are force-stopped. Database tests
swap only the `mongodb-memory-server` dependency via `KINDRED_DEV_DB_FACTORY` and
run the real provisioning control flow: a replica set that finishes starting
after SIGINT/SIGTERM is still stopped (late/absent rejections are handled, no
runtime phase follows), and a hanging database `stop()` is force-released in
bounded time with the failure reported and a non-zero exit.

## Troubleshooting

- **Port already in use** — the launcher halts before starting anything and names
  the conflicting port; stop the other process or change the port in `.env.dev`.
- **`Unable to provision the disposable development database`** — the binary
  download failed; run it again or switch to `KINDRED_DEV_DB=external`.
- **Readiness never succeeds** — the launcher reports which child (frontend/API)
  did not come up; scroll the child log above the readiness line.
- **I still get reminders in dev** — the launcher always sets
  `REMINDER_SCHEDULER_DISABLED=true` on the API child only; it is not configurable
  and is never set in production.
