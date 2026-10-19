# Release and rollback

This page records how to capture release/rollback evidence. Production runs on
DigitalOcean App Platform with Managed PostgreSQL in Toronto (see
`docs/DIGITALOCEAN_DEPLOYMENT.md`); Fly.io and Coolify are retired. Do not guess provider state here; record only what an operator can
verify in GitHub Actions or the relevant provider dashboard.

## Responsibilities

- The repository-root **`Dockerfile`** is the supported production image
  definition. Follow
  `docs/DIGITALOCEAN_DEPLOYMENT.md` to deploy it.
- **Before a release:** GitHub Actions validates the monorepo, the MongoDB
  source backup has been restore-tested, the isolated PostgreSQL target has
  been validated, and the exact commit is built and verified.
  `pnpm run release:check` (read-only) is the local pre-push report for the
  candidate.
- **Deployment:** deploy the reviewed commit on `main` with the **Deploy to
  DigitalOcean** workflow (`docs/DIGITALOCEAN_DEPLOYMENT.md`). Do not treat a
  push or a successful CI run as proof of deployment.
- **Database:** migration/initialization is **never** part of container startup.
  A restart cannot copy, initialise, or delete data. Initialize an empty
  production database with `pnpm --filter @workspace/db run initialize` from a
  trusted environment before switching traffic. Apply each new migration to the
  live database before deploying the build that needs it (runbook step 7).

## Record the deployed revision

After each deployment, record in the release note/report:

- the deployed **Git SHA** shown by the active provider, and
- the immutable image digest or release identifier shown for that successful
  deployment, when available.

Keep at least two known-good application images and their configuration.

## Acceptance checklist

| Check | Proof kind | Where the evidence lives |
| ----- | ---------- | ------------------------ |
| `pnpm verify` passed | local | `.verify-evidence.json` (git-ignored) + recorded output |
| GitHub Actions green | CI | GitHub Actions URL for the pushed SHA |
| Push + merge into `main` | CI | GitHub commit/PR record |
| Selected provider deployment succeeded | production | Provider dashboard deployed revision/image digest |
| `/api/healthz` and `/api/healthz/db` return HTTP 200 | production | curl/runner output |
| Auth0 sign-in/sign-out works against the production tenant | production | authorized human acceptance |
| One synthetic AI coaching message responded | production | authorized human acceptance (no real health data) |
| Stored deployed SHA + digest + health checks | production | this release note/report |

Local proof (running checks locally) and CI proof (GitHub Actions) are distinct
from production proof (provider dashboard + live sign-in). `pnpm run release:check` reports
each field separately and marks remote fields unverified when it cannot observe
them.

## Rollback

- **Application rollback:** select the preceding successful App Platform
  deployment (the app's **Activity** tab → **Rollback**). Redeploy it and verify both health checks.
  The app image is stateless; releases and rollback depend on immutable image
  contents (no persistent volume over `/app`).
- **Database:** do **not** reverse a database migration automatically. If a
  release made an incompatible schema change, follow its reviewed down-migration
  or restore the pre-deploy backup only after stopping writes and accepting the
  documented data-loss window. Backups: 7 daily + 5 weekly restore points, all
  expiring within 35 days.
- **Graceful stop:** on app shutdown the API handles `SIGTERM`, stops its
  scheduler, drains the HTTP listener, and closes its active database pool.
  Allow at least 30 seconds before a forced kill.

## Pending human/provider steps are honest

Nothing in this document claims an automatic, safe, or read-only action that the
underlying tool does not perform: every mutating operation above is executed
manually by an authorized operator, and `release:check` reports
"unverified" for any evidence it cannot observe locally.
