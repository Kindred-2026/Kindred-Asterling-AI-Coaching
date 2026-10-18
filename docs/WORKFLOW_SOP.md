# Kindred Asterling repository workflow SOP

**Applies to:** the `Kindred-2026/Kindred-Asterling-AI-Coaching` repository —
the app on `kindred-asterling-ai-coaching.com` and the marketing site on
`kindred-asterling-ai.xyz`. **Last reviewed:** 2026-10-17 against `main` at
`8a5d7ee`. **Word copy:** `docs/Kindred-Asterling-Workflow-SOP.docx`, generated
from this file ([section 12](#12-maintaining-this-sop)).

This is the operator procedure for taking a change from a new branch to a
verified production release. Each step says what to run, what a pass looks
like, and what it does **not** prove. The repository's runbooks and workflow
files are the source of truth; where this SOP and a runbook disagree, the
runbook wins and this SOP should be corrected.

> GitLab and Coolify are retired. The owner confirmed GitLab is unused, and
> GitHub Actions is the only CI. Coolify Cloud was cancelled and its deployment
> record removed. Older documents under `docs/releases/` and `docs/specs/`
> mention GitLab pipelines and Coolify as dated history; do not follow them for
> new work ([finalization record](FINALIZATION_RECORD.md)).

## 1. The release path at a glance

| Stage | Where it runs | How it starts | What a pass proves |
| --- | --- | --- | --- |
| Branch and commit | Your computer | You | Nothing yet |
| Local validation | Your computer, `pnpm verify` | You | **Local proof**: the exact commit passes the full local check set |
| Pull request checks | GitHub Actions: CI, Security Audit, Snyk Security | A pull request into `main`, and every push to `main` | **CI proof**: the commit builds and tests on a clean runner |
| Merge | GitHub pull request | The person merging, by hand | The change is on `main` |
| App deployment | **Deploy to DigitalOcean** workflow; App Platform builds the root `Dockerfile` | By hand (`workflow_dispatch`) | A new deployment was attempted |
| Marketing deployment | **Deploy to Cloudflare** workflow | By hand | The marketing Worker was replaced |
| Production verification | You, against the live domain | You | **Production proof**: the live app is healthy and works |

Three rules hold the whole process together:

1. **CI never deploys.** No workflow deploys on push, and `.do/app.yaml` sets
   `deploy_on_push: false`. A green check or a merge changes nothing in
   production.
2. **CI and deployment build different things.** CI compiles the frontend with
   synthetic Auth0 values (`tenant.example.invalid`) to prove it builds. The
   deployment builds the root `Dockerfile` inside App Platform with the real
   public Auth0 values. Only the deployment produces what users get.
3. **Each kind of proof is separate.** Local proof, CI proof and production
   proof are recorded separately, and `pnpm run release:check` reports any it
   cannot see as unverified ([release and rollback](release-rollback.md)).

## 2. Before you start

- Node 24 (`.node-version`, `engines.node` `24.x`) and pnpm `10.28.1`. Run
  `corepack enable` once; the repository pins the pnpm version.
- Write access to the GitHub repository. The GitHub CLI (`gh`) is optional but
  used in the examples below.
- To deploy: permission to run workflows that use the `digitalocean-production`
  GitHub environment, and access to the DigitalOcean App Platform app
  `kindred-asterling-ai-coaching` for build logs, runtime logs and rollback.
- First-time setup of a checkout: [local development](local-development.md).

## 3. Create a branch

Always branch from the latest `main`:

```sh
git switch main
git pull --ff-only
git switch -c fix/short-description
pnpm install --frozen-lockfile
```

- Name the branch for the change with a `fix/`, `feat/`, `chore/` or `legal/`
  prefix, as recent pull requests do. Agent sessions use their own prefixes
  (`claude/`, `devin/`). A branch for a Linear issue uses the name Linear
  suggests, for example
  `kindredaicoach/kin-7-create-repository-workflow-sop-in-word-format`.
- Keep one change per branch, so one pull request can be reviewed, merged and
  rolled back as a unit.
- Never commit secrets. `.env.dev`, `.env.local` and `.verify-evidence.json`
  are git-ignored; keep them that way. Public Auth0 identifiers are not
  secrets, but client secrets and API keys are.
- Re-run `pnpm install --frozen-lockfile` whenever `pnpm-lock.yaml` changes on
  `main` or on your branch.

## 4. Validate locally

Commit your work, then run the single local verification command on that
commit:

```sh
git add -A && git commit -m "Describe the change"
pnpm verify
pnpm run release:check
```

`pnpm verify` runs these components in order and stops at the first failure,
naming the component and its exit code:

| Component | What it checks |
| --- | --- |
| `format:check` | Formatting of the maintained files (`scripts/`, workspace config, generated-client entrypoints) |
| `typecheck:production` | TypeScript across libraries, apps and scripts |
| `test:dev-supervisor`, `test:verify`, `test:release-check`, `test:auth0-local`, `test:digitalocean`, `test:sop-docx` | Unit tests for the repository tooling, including the DigitalOcean app-spec script and this SOP's Word copy |
| `test:frontend` | Product UI tests (`@workspace/kindred-coach`) |
| `test:api`, `test:journey` | API and end-to-end journey tests against a disposable MongoDB |
| `generate:check` | The generated API clients match `lib/api-spec` (no file writes) |
| `build:api`, `build:frontend` | Production builds of the API and the frontend |

A full pass writes `.verify-evidence.json`, tied to the exact commit and
working-tree state. **Several of these components run only here, not in CI:**
`format:check`, `generate:check`, `test:journey` and the tooling tests. Skipping
`pnpm verify` means they are not checked at all.

`pnpm run release:check` is read-only. Read its exit code as bits:

| Bit | Meaning | What to do |
| --- | --- | --- |
| 1 | Verify evidence missing, stale or malformed | Run `pnpm verify` again on the current commit |
| 2 | Uncommitted or untracked changes | Commit or remove them, then verify again |
| 4 | Public Auth0 configuration missing or inconsistent locally | Expected if you keep no local Auth0 values; otherwise fix `.env.local` |
| 8 | Push, CI, merge, deploy or acceptance not verifiable locally | Expected before deployment; later steps cover these |
| 64 | Not a git checkout | Run it from the repository |

Before pushing, bits 1 and 2 must be clear. An exit code of 8 or 12 is normal at
this point.

Useful commands while iterating:

```sh
pnpm run format                                  # fix formatting
pnpm --filter @workspace/kindred-coach run test  # frontend tests only
pnpm --filter @workspace/db run test:api         # API tests only
pnpm run generate:check                          # generated-client drift
```

## 5. Push and open a pull request

```sh
git push -u origin fix/short-description
gh pr create --base main --fill
```

GitHub Actions runs only for pull requests into `main` and pushes to `main`.
Pushing a branch without opening a pull request runs no checks.

In the pull request description, include:

- **What and why**, in a few sentences.
- **Verification:** that `pnpm verify` passed on the pushed commit, and the
  `release:check` exit code.
- **Deployment impact:** does the change need a deploy, touch the `Dockerfile`
  or `.do/app.yaml`, add a database migration under
  `lib/db/migrations-postgres/`, or need a new secret or variable?
- **Linear issue**, if there is one (for example `KIN-7`).

## 6. GitHub Actions checks

| Workflow | Runs on | Jobs and steps | Blocks on |
| --- | --- | --- | --- |
| **CI** (`ci.yml`) | Pull requests into `main`; pushes to `main` | `typecheck`; `test-api-server`; `test-kindred-coach`; `build` (frontend `build:deployment` with synthetic Auth0 values, then the API build) | Any failing job |
| **Security Audit** (`security-audit.yml`) | Pull requests; pushes to `main`; daily at 00:00 UTC | `pnpm audit --audit-level=high` | A high or critical dependency advisory |
| **Snyk Security** (`snyk-security.yml`) | Pull requests; pushes to `main` | Snyk Code test (SARIF to Code Scanning); Snyk Open Source monitor; Snyk IaC test when IaC files exist; a `docker build` of the root `Dockerfile` with synthetic values, then Snyk Container monitor | A missing `SNYK_TOKEN`, a Snyk Code finding, an IaC finding, or a failed image build |

Open Source and Container scans use `monitor`: they report to Snyk but never
fail the check. Review those results in Snyk.

When a check fails:

1. Open the failed job's log and find the first error.
2. Reproduce it locally with the matching command: `pnpm run typecheck`,
   `pnpm --filter @workspace/db run test:api`,
   `pnpm --filter @workspace/kindred-coach run test`, the two build commands in
   the `build` job, or `pnpm audit --audit-level=high`.
3. Fix it on the branch, run `pnpm verify` again, and push. Re-run a job without
   a change only for an infrastructure failure, such as an audit-endpoint
   timeout.
4. Do not add scanner suppressions or lower audit levels in the same pull
   request as a feature. Propose them separately, with the reason.

The nightly Security Audit can fail on `main` with no code change when a new
advisory is published. Treat that as a dependency update task.

## 7. Merge gates

As of 2026-10-17, GitHub branch protection is disabled and the repository has
no rulesets, so **GitHub does not block a merge**. The gates below are
procedural: the person who merges confirms each one.

- [ ] CI, Security Audit and Snyk Security are green on the pull request's
  **latest** commit.
- [ ] The author has confirmed that `pnpm verify` passed on that commit.
- [ ] The branch is up to date with `main`. If `main` moved, merge it in, let
  the checks run again, and run `pnpm verify` again.
- [ ] Someone other than the author has reviewed the diff, when a reviewer is
  available. Otherwise the author re-reads the full diff on GitHub before
  merging.
- [ ] Deployment impact is stated. Changes to the `Dockerfile`,
  `.do/app.yaml`, migrations or secrets name the deploy steps they need
  (section 8).
- [ ] No secret values appear in the diff, logs or description.

Merge with **Create a merge commit**, which matches the repository's history,
then delete the branch.

## 8. Deploy to production

Merging does not deploy. Deploy deliberately, from `main`, after the merge.

### 8.1 Before deploying

- [ ] CI and the security workflows are green on the merge commit on `main`.
- [ ] Note the commit you expect to go live: `git fetch origin && git rev-parse origin/main`.
- [ ] Note the current active deployment in DigitalOcean (the app's
  **Activity** tab: deployment and commit). This is your rollback target.
- [ ] **New database migration?** Migrations never run at container start, and
  the app refuses to start without the schema it expects. Apply the reviewed
  migration before deploying, as `doadmin` with `-v ON_ERROR_STOP=1`, then
  re-run `.do/grant-app-role.sql`, as in the
  [DigitalOcean runbook](DIGITALOCEAN_DEPLOYMENT.md) steps 2 and 6.
- [ ] **New secret?** Add it in App Platform (**Settings → web → Environment
  Variables**, with **Encrypt** ticked) before deploying. Never put secret
  values in `.do/app.yaml`.
- [ ] **New plain setting?** Put it in `.do/app.yaml`. Each deploy applies the
  whole spec and removes plain settings that exist only in the dashboard.

### 8.2 Run the deployment

Run **Actions → Deploy to DigitalOcean → Run workflow** on `main`, or:

```sh
gh workflow run digitalocean-deploy.yml --ref main
gh run watch
```

The workflow, in the `digitalocean-production` environment:

1. Checks that `DIGITALOCEAN_ACCESS_TOKEN` and the three `VITE_AUTH0_*`
   variables are configured.
2. Prepares the app spec from `.do/app.yaml`
   (`scripts/digitalocean-app-spec.mjs`), keeping each secret's encrypted value
   from the live app.
3. Deploys. App Platform builds the root `Dockerfile` from the latest commit on
   `main`, prints the build and deploy logs, and only switches traffic once
   the health check on `/api/healthz/db` passes.
4. Runs `scripts/check-client-ip.mjs` against the new deployment, to confirm
   rate limits see real visitor IP addresses.

Only one deployment runs at a time. Always run the workflow from `main`: the
spec and scripts it applies come from the ref you choose, while the code App
Platform builds always comes from `main`.

| Failure | Meaning | Action |
| --- | --- | --- |
| `<NAME> is not configured` | A secret or variable is missing from the GitHub environment | Add it under **Settings → Environments → digitalocean-production** |
| Build fails | The `Dockerfile` build failed in App Platform | Read the printed build log; reproduce with the build commands from the CI `build` job |
| Deploy fails health check | The new container did not pass `/api/healthz/db` | Read the runtime logs; App Platform keeps serving the previous deployment |
| Client-IP check fails | `TRUST_PROXY_HOPS` is wrong for App Platform | Follow its message, change `.do/app.yaml` through a pull request, deploy again ([runbook step 4](DIGITALOCEAN_DEPLOYMENT.md#4-proxy-hops-trust_proxy_hops)) |

The dashboard's **Deploy** button also builds `main`, but it does not apply
`.do/app.yaml`. Prefer the workflow.

### 8.3 Marketing site

Marketing and legal pages on `kindred-asterling-ai.xyz` deploy separately.
When a merged change affects them, run **Actions → Deploy to Cloudflare** on
`main` (`gh workflow run cloudflare-deploy.yml --ref main`). It builds the site
with `VITE_APP_URL` pointing at the app domain and deploys it with Wrangler
([domain split](DOMAIN_SPLIT.md)).

### 8.4 Fly.io

The **Deploy to Fly.io** workflow and `fly.toml` remain only as the rollback
from the DigitalOcean cutover. `kindred-asterling-ai-coaching.fly.dev` no longer
resolves, so the Fly app may be gone. Run `fly status` before relying on it, and
never deploy to Fly as part of a normal release.

## 9. Verify production

Run these against the live domain right after the deployment finishes:

```sh
curl -sS https://kindred-asterling-ai-coaching.com/api/healthz
curl -sS https://kindred-asterling-ai-coaching.com/api/healthz/db
curl -sI https://kindred-asterling-ai-coaching.com/ | grep -i x-do-app-origin
node scripts/check-client-ip.mjs https://kindred-asterling-ai-coaching.com
```

| Check | Pass |
| --- | --- |
| `/api/healthz` | HTTP 200, `{"status":"ok"}` |
| `/api/healthz/db` | HTTP 200, `{"status":"ok","database":"connected"}`. A 503 with `"database":"unavailable"` means the app cannot reach PostgreSQL |
| Host header | `x-do-app-origin` is present, so App Platform serves the domain |
| Client IP check | Exits 0 |
| Deployed commit | The active deployment in DigitalOcean shows the commit noted in section 8.1 |
| Runtime logs | `Server listening` and `Reminder scheduler started`, with no new errors in the App Platform runtime logs or in Sentry |

Then an authorized person completes the human acceptance checks:

- Sign in and sign out with Auth0.
- Send one synthetic AI coaching message, with no real health data, and get a
  reply.
- When the change touches accounts or data access, check that a second test
  account sees only its own history.

**Record the release** in the merged pull request (a comment) or, for a notable
release, a note under `docs/releases/`: the deployed commit, the DigitalOcean
deployment, the time, the health-check output, the acceptance results, and who
ran them. Mark anything not checked as not checked.

## 10. Roll back

- **Application:** in DigitalOcean, open the app's **Activity** tab, choose the
  previous successful deployment noted in section 8.1, and roll back to it.
  Then repeat section 9. Afterwards, revert the change on `main` through a pull
  request, so the next deployment does not bring it back.
- **Database:** never reverse a migration automatically. Follow the reviewed
  down-migration, or restore the pre-deploy backup only after stopping writes
  and accepting the data-loss window ([release and rollback](release-rollback.md)).
- **Hosting:** the Fly.io rollback is described in the
  [DigitalOcean runbook](DIGITALOCEAN_DEPLOYMENT.md#rollback) and is only
  available while the Fly app exists.

## 11. One-page checklist

1. `git switch main && git pull --ff-only && git switch -c <branch>`
2. Make the change and commit it.
3. `pnpm verify` passes; `pnpm run release:check` has bits 1 and 2 clear.
4. `git push -u origin <branch>` and open a pull request into `main` with
   verification and deployment impact.
5. CI, Security Audit and Snyk Security are green on the latest commit.
6. Merge gates confirmed (section 7); merge with a merge commit.
7. Before deploying: `main` is green, rollback target noted, migrations and
   secrets handled.
8. Run **Deploy to DigitalOcean** on `main`; it finishes green.
9. `/api/healthz` and `/api/healthz/db` return 200; the deployed commit
   matches; logs and Sentry are clean.
10. Human acceptance: sign-in, sign-out, one synthetic AI message.
11. Record the release. If anything fails, roll back (section 10).

## 12. Maintaining this SOP

Edit this Markdown file, then regenerate the Word copy and commit both:

```sh
pnpm run docs:sop         # writes docs/Kindred-Asterling-Workflow-SOP.docx
pnpm run docs:sop:check   # fails if the committed .docx is out of date
```

`pnpm verify` runs the same check through `test:sop-docx`, so a stale Word
copy fails local verification.

`scripts/generate-sop-docx.mjs` has no dependencies and gives the same document
for the same Markdown. It supports the subset of Markdown used here: headings,
paragraphs, bullet, numbered and checkbox lists, tables, fenced code blocks,
block quotes, inline code, bold and links. Links to other repository documents
become their file paths in the Word copy. Check the layout after a large
change: open the `.docx` in Word or LibreOffice, or convert it to PDF with
`libreoffice --headless --convert-to pdf`.

Review this SOP whenever a workflow under `.github/workflows/`, the
`Dockerfile`, `.do/app.yaml` or the hosting provider changes.

**Sources:** `.github/workflows/` (CI, Security Audit, Snyk Security, Deploy to
DigitalOcean, Deploy to Cloudflare, Deploy to Fly.io), `Dockerfile`,
`.do/app.yaml`, `scripts/verify.mjs`, `scripts/release-check.mjs`,
[the README](../README.md), [DigitalOcean runbook](DIGITALOCEAN_DEPLOYMENT.md),
[release and rollback](release-rollback.md),
[finalization record](FINALIZATION_RECORD.md).
