# Kindred Asterling AI Coaching

Monorepo for the Kindred Asterling AI Coaching product.

**Current application stack:** React/Vite + Express + Auth0 + MongoDB.
**Finalization target:** DigitalOcean App Platform + managed PostgreSQL +
Cloudflare AI Gateway. See [the finalization record](docs/FINALIZATION_RECORD.md)
and [the DigitalOcean cutover guide](docs/digitalocean-cutover.md). Production
hosting and database remain on the current providers until their migration gates
are verified.

- Product UI: `artifacts/kindred-coach` (React/Vite, `@workspace/kindred-coach`)
- API server: `artifacts/api-server` (Express, `@workspace/api-server`)
- Database: MongoDB (replica set — multi-document writes require transactions)
- Authentication: Auth0 (see [docs/auth0-migration.md](docs/auth0-migration.md))

## Quick start

Prerequisites: Node 24+ and pnpm (the repo pins `pnpm@10.28.1` —
`corepack enable`). Install once at the root:

```sh
pnpm i
cp .env.dev.example .env.dev   # then adjust, see docs/local-development.md
pnpm dev                       # product UI on :8080, API on :3000, disposable MongoDB
```

`pnpm dev` starts the real product stack with a disposable in-memory MongoDB
(`KINDRED_DEV_DB=disposable`), builds the API, and reports readiness when
`GET /api/healthz/db` answers through the Vite proxy. The API is **not**
hot-reloaded — restart `pnpm dev` after editing API code.

## Verification

Use one local verification command before review. It runs the maintained local
checks from a sanitised child environment (no secrets or `VITE_*` values are
forwarded, and nothing outside the repository is touched):

```sh
pnpm verify
```

Components: `format:check`, `typecheck:production`, `test:dev-supervisor`,
`test:frontend`, `test:api`, `test:journey`, `generate:check`, `build:api`,
`build:frontend`. A full pass writes `.verify-evidence.json` (git-ignored) so the
release gate below can tell that a passing run belongs to the exact candidate.

Focused commands:

```sh
pnpm run format                 # write formatting on the maintained boundary
pnpm run format:check           # verify formatting only
pnpm run test:verify            # unit tests for the verify/format machinery
pnpm run test:release-check     # unit tests for the release gate
pnpm run test:dev-supervisor    # unit tests for the dev launcher
pnpm run generate:check         # generated-client drift check (no file writes)
pnpm --filter @workspace/kindred-coach run test
pnpm --filter @workspace/db run test:api
pnpm --filter @workspace/db run test:journey
```

The `generate:check` step reproduces the committed orval invocation inside a
throwaway sandbox copy and byte-compares the generated clients against the
tracked trees — it never modifies your working tree.

## Release gate

Before making release decisions, run the read-only evidence reporter:

```sh
pnpm run release:check
```

It reports the exact candidate SHA/branch and working-tree state, whether the
last `pnpm verify` evidence belongs to that candidate, whether required public
Auth0 configuration is present and the web/API issuer + audience are consistent
(no values are printed), and the status of push / CI / merge / deploy /
acceptance / rollback. Missing remote evidence is reported as unverified, never
as passed. Local verification is local proof only — it never proves a deployed
release. See [docs/release-rollback.md](docs/release-rollback.md).

## Documentation

- [docs/local-development.md](docs/local-development.md) — first-run setup, env
  precedence, database modes, troubleshooting
- [docs/release-rollback.md](docs/release-rollback.md) — Coolify release and
  rollback responsibilities, evidence, acceptance
- [docs/COOLIFY_DEPLOYMENT.md](docs/COOLIFY_DEPLOYMENT.md) — production
  deployment on Coolify
- [docs/operations-tools.md](docs/operations-tools.md) — MongoDB / identity tool
  inventory and the archive review list
- [docs/mongodb-migration.md](docs/mongodb-migration.md) — completed PostgreSQL
  cutover record and rollback tools
- [docs/auth0-migration.md](docs/auth0-migration.md) — Auth0 rollout record
