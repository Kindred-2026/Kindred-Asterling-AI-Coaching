# Release and rollback

This page records Kindred's **current** Coolify release/rollback responsibilities
and how release evidence is captured. Do not guess dashboard/provider state here;
record only what an operator can see in the Coolify dashboard, GitHub Actions,
or provider dashboards.

## Responsibilities

- The repository-root **`Dockerfile`** is the only supported production
  deployment artifact (`docs/COOLIFY_DEPLOYMENT.md`); Coolify builds it from
  GitHub `main`.
- **Before promotion:** GitHub Actions validates the monorepo, the MongoDB backup /
  restore gate must have passed, and the exact commit is built and verified.
  `pnpm run release:check` (read-only) is the local pre-push report for the
  candidate.
- **Deployment:** Coolify builds the Dockerfile for the chosen Git commit. A
  push to `main` triggers a new deployment when automatic deployments are
  enabled; otherwise a manual **Redeploy** builds the latest Git commit.
- **Database:** migration/initialization is **never** part of container startup.
  A restart cannot copy, initialise, or delete data. Initialize an empty
  production database with `pnpm --filter @workspace/db run initialize` from a
  trusted environment before switching traffic.

## Record the deployed revision

After each deployment, record in the release note/report:

- the deployed **Git SHA** (the commit the Coolify build used), and
- the Coolify **image digest** shown for the successful deployment.

Keep at least two known-good application images and their configuration.

## Acceptance checklist

| Check | Proof kind | Where the evidence lives |
| ----- | ---------- | ------------------------ |
| `pnpm verify` passed | local | `.verify-evidence.json` (git-ignored) + recorded output |
| GitHub Actions green | CI | GitHub Actions URL for the pushed SHA |
| Push + merge into `main` | CI | GitHub commit/PR record |
| Coolify deployment succeeded | production | Coolify dashboard deployed revision/digest |
| `/api/healthz` and `/api/healthz/db` return HTTP 200 | production | curl/runner output |
| Auth0 sign-in/sign-out works against the production tenant | production | authorized human acceptance |
| One synthetic AI coaching message responded | production | authorized human acceptance (no real health data) |
| Stored deployed SHA + digest + health checks | production | this release note/report |

Local proof (running checks locally) and CI proof (GitHub Actions) are distinct
from production proof (Coolify + live sign-in). `pnpm run release:check` reports
each field separately and marks remote fields unverified when it cannot observe
them.

## Rollback

- **Application rollback:** select the preceding successful Coolify deployment
  (or its immutable image digest) and redeploy it, then verify both health
  checks. The container is stateless; releases and rollback depend on immutable
  image contents (no persistent volume over `/app`).
- **Database:** do **not** reverse a database migration automatically. If a
  release made an incompatible schema change, follow its reviewed down-migration
  or restore the pre-deploy backup only after stopping writes and accepting the
  documented data-loss window. Backups: 7 daily + 5 weekly restore points, all
  expiring within 35 days.
- **Graceful stop:** on replacement Coolify sends `SIGTERM`; the API stops its
  scheduler, drains the HTTP listener, and closes the MongoDB pool. Allow at
  least 30 seconds before a forced kill.

## Pending human/provider steps are honest

Nothing in this document claims an automatic, safe, or read-only action that the
underlying tool does not perform: every mutating operation above is executed
manually by an authorized operator, and `release:check` reports
"unverified" for any evidence it cannot observe locally.