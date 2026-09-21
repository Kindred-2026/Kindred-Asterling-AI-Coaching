# Auth0 production cutover preparation

Prepared September 8, 2026 from GitLab `origin/main` at
`2205b982401cd809fd0a297eb9cd378e5e0c0159`, which includes Phase 2D.
This is a review package, not evidence of a completed cutover.

## Current release state

- Phase 2D MR !120 is merged. Its source pipeline passed all seven jobs.
- The preceding live Coolify inspection found the production application
  `kindred-asterling-ai-2026` running commit
  `9980553b0a316fe5dbe60f6daf5c421d8c5e217f`, deployment
  `9htx38z7sjmrv9xkjuxjljkv`. Both health endpoints returned success.
- Coolify points to GitLab `main`, commit `HEAD`; no deployment of the merge was
  queued or running. Merging and deploying are separate operations here.
- That inspection found no `AUTH0_*` or `VITE_AUTH0_*` hosting variables.
  Provider-side production URLs and customer migration are not verified.
- Re-read deployment history and GitLab main immediately before promotion.
  Do not deploy additional unreviewed commits that arrive after this preparation.

## Proposed configuration for the selected tenant

The existing locally tested tenant is `dev-rio3w0hvdl6hccn6.us.auth0.com` and
SPA client ID is `HhxYDycwHK6A71CofaymdURN9zEgvaFS`. These are public identifiers,
not secrets. The tenant name alone does not establish production readiness.
The founder confirmed use of this existing tenant during the setup walkthrough.
The hosting values below now use the verified custom domain in both frontend
and API. Login and account-security checks through that domain remain required.

| Coolify variable | Proposed value for the existing tenant | Build | Runtime |
| --- | --- | --- | --- |
| `VITE_AUTH0_DOMAIN` | `auth.kindred-asterling-ai-coaching.com` | Yes | No |
| `VITE_AUTH0_CLIENT_ID` | `HhxYDycwHK6A71CofaymdURN9zEgvaFS` | Yes | No |
| `VITE_AUTH0_AUDIENCE` | `https://kindred-asterling-ai-coaching.com/api` | Yes | No |
| `AUTH0_DOMAIN` | `auth.kindred-asterling-ai-coaching.com` | No | Yes |
| `AUTH0_AUDIENCE` | `https://kindred-asterling-ai-coaching.com/api` | No | Yes |

Keep `APP_PUBLIC_URL=https://kindred-asterling-ai-coaching.com` and existing
database, AI, payments, reminder, medication, security and token-revocation
settings. Preserve Clerk credentials and mappings for rollback. Do not copy a
SPA client secret or management token into hosting or any `VITE_*` value.

In Auth0, select the approved SPA under Applications → Applications → Settings.
Review existing URL lists before editing; do not overwrite unrelated entries.
The application code uses the origin root as its callback and logout destination:

| Setting | Required production entry |
| --- | --- |
| Allowed Callback URLs | `https://kindred-asterling-ai-coaching.com/` |
| Allowed Logout URLs | `https://kindred-asterling-ai-coaching.com/` |
| Allowed Web Origins | `https://kindred-asterling-ai-coaching.com` |

Use exact URLs. Deep links such as `/today` return through application state;
they are not separate OAuth callbacks. Keep local development on a separate SPA
application before production promotion, rather than retaining localhost URLs
on the production client. Confirm production social connections use approved
production credentials; don't infer this from one successful local login.
These URL rules follow [Auth0 application settings](https://auth0.com/docs/get-started/applications/application-settings).

Verify RS256 and the exact API audience, refresh-token rotation, and the existing
My Account user grant/MRRT scopes documented in [auth0-migration.md](../auth0-migration.md).
Verify sender configuration, password reset, supported social providers, and MFA
with a designated test identity. Do not weaken security policies or create
duplicate grants to make a test pass.

## Prepared build changes

The root Dockerfile now accepts all three public Auth0 values through build
arguments or Coolify's existing Build Secrets mode. The deployment build rejects
missing/blank values before Vite runs. The build context excludes nested `.env*`
files so a developer's local tenant configuration cannot enter the image.
CI uses explicit synthetic identifiers; its artifacts are not production assets.

Prefer ordinary build arguments for these public values. If using secret mounts,
request a fresh uncached build when values change: secret contents do not affect
the build cache. Never change the global secret mode merely to pass these public
identifiers. See [Docker build secrets](https://docs.docker.com/build/building/secrets/)
and [cache invalidation](https://docs.docker.com/build/cache/invalidation/).

## Existing-account rehearsal: required before traffic switches

No customer inventory, export, import, or production mapping was performed by
this preparation. Use the existing migration command; do not link by email.

1. Authorize and take a consistent backup, then restore-test it in an isolated
   MongoDB replica set. Keep the report and customer data in private storage.
2. Inventory the existing Kindred IDs and Clerk subjects, authentication methods,
   paid/beta/owner accounts, social connections, and MFA status. Account for every
   affected user, including those without email. Record aggregate totals here,
   not personal records. A zero-user result must come from a verified inventory.
3. Approve a provider-specific import/re-enrollment plan. Verify ownership of each
   new Auth0 subject and prepare a private mapping of `userId`, `clerkUserId`,
   and `auth0UserId`. Do not guess that a password, Google login, or MFA factor
   transfers because a local sign-in succeeded.
4. Inject the isolated restore's URI/database into a trusted local terminal.
   From the repository root, run the default dry run:

   ```sh
   pnpm --filter @workspace/db exec tsx ./scripts/link-auth0-identities.ts --mapping /private/path/reviewed.json --database kindred_rehearsal
   ```

5. Review the mapping and dry-run results; then run the same command with
   `--apply` against that isolated restore. Rehearse database initialization to
   validate the unique partial `auth0UserId` index. Never point the disposable
   API test harness at production.
6. Verify unchanged internal user IDs, Clerk mappings, coaching history, journal,
   habits, medications, reminders, payment/customer references, and subscriptions.
   Confirm owner and beta access still resolve to the correct internal users;
   do not replace `SUBSCRIPTION_OWNER_IDS` with newly generated Auth0 subjects.
7. Reconcile all legacy accounts against the reviewed mapping. Require zero
   unexplained omissions/conflicts, or an explicitly approved staged plan with
   tested continued access for every unmigrated account. The current release has
   no dual-provider fallback; partial mapping alone is not a safe staged rollout.
8. Plan a bounded write freeze for final inventory/mapping and traffic switch so
   new Clerk signups cannot fall between inventory and cutover. Keep public
   marketing available and explicitly account for payment webhooks/reminder work
   during the freeze. Do not change ingress/provider settings as part of rehearsal.

The mapping command defaults to no writes, checks the target database name and
existing ownership, and applies updates transactionally. It preserves `users.id`
and `clerkUserId`. Production mapping needs explicit approval of the reviewed
mapping, target database, backup, reconciliation, and write-freeze procedure.

## Release acceptance and promotion sequence

| Gate | Evidence required | State at preparation |
| --- | --- | --- |
| Code | Frontend tests, workspace typecheck, API tests, build and whitespace checks | See validation below |
| Production tenant | Approved tenant/client, URLs, connections and grants read back after configuration | Pending |
| Customer continuity | Restore test, complete identity mapping and rehearsal, owner/beta/paid access | Pending |
| Authentication | Login → protected API → refresh → logout; session gone after logout | Local login/API previously passed; production and complete logout/account-security checks pending |
| My Account | Password reset/change, enrollment, step-up and factor removal with test identity | Pending |
| Phase 2D humans | 200% native zoom, screen reader, five representative testers | Zoom confirmed by user; screen reader and five testers pending |
| Container | Exact release image built using reviewed production public identifiers | Pending |
| Rollback | Retained old image/configuration and tested provider/data compatibility | Pending |

After these gates and the production mapping approval:

1. Read back the approved Auth0 settings and save the five Coolify variables.
   Preserve unrelated settings. Prevent an automatic deployment during preparation;
   verify current behavior rather than adding a duplicate webhook.
2. Record the final reviewed Git SHA, successful CI pipeline, immutable rollback
   image/digest, and a private copy of its runtime configuration. Merge the reviewed
   cutover preparation only when ready; recheck whether merge already queued a build.
3. Complete the approved write freeze, final identity reconciliation and production
   mapping. Do not run imports or migration commands from application startup.
4. Deploy the exact reviewed commit once through the existing Coolify resource.
   Ensure frontend and runtime use the same tenant/audience. Record deployment ID,
   Git SHA, image digest, start/end time and outcome from Coolify.
5. Verify both health endpoints, then the actual production browser flows below.
   The runtime requires Auth0 variables even though unauthenticated health routes
   themselves do not use Auth0. A build or health result cannot prove sign-in.
6. Remove the approved write freeze only after the initial continuity checks.
   Recheck webhook delivery and scheduled work; retain the old image and Clerk.

Production verification uses synthetic content and an approved mapped identity:

- `/today`, `/talk`, `/insights`, `/you` and legacy `/app/*` deep links, refresh,
  signed-out return destination, and rejected unauthenticated API requests.
- Morning check-in → scan → habit → evening progression and persisted history.
- Existing coaching history, one coaching/voice test, medication and reminder
  reads; any test delivery goes only to an explicitly approved test recipient.
- Correct owner/beta/paid entitlement and billing portal; use a separately approved
  payment test, never an unapproved real charge. Verify Helcim webhook delivery.
- Calendar remains absent from navigation/Today/new connections; retain existing
  disconnect/revocation. Do not revoke a real connection for a smoke test.
- Keyboard focus/navigation and 200% zoom; record the human screen-reader and
  P1–P5 results in [phase-2d-acceptance.md](phase-2d-acceptance.md).

## Rollback and retirement

Rollback triggers include startup failure, persistent auth errors, missing history,
incorrect entitlements, or payment/reminder regressions. Stop promotion and retain
diagnostics without tokens or customer content. Restore the preceding immutable
Coolify image and its matching Clerk runtime configuration; do not rebuild current
`main` and call it rollback. Verify health, Clerk sign-in, existing-account history,
entitlements, webhooks and reminders after restoration.

Do not automatically remove Auth0 mappings or restore the entire database: writes
after cutover would be lost. Legacy mappings allow previously linked users to
return to Clerk, but users created only in Auth0 after launch have no Clerk subject.
Before promotion, rehearse how those accounts retain access during rollback, or
approve a bounded signup freeze for the rollback window. A signup freeze is a
separate operational change, not implemented by this branch. Keep cross-provider
profile/password changes and paused/retried webhook deliveries in the rollback review.

Keep Clerk credentials, users, provider configuration, Google OAuth credentials,
Calendar records and token-revocation capability. No provider retirement, database
cleanup or credential rotation belongs in this release. Close the rollback window
only after production continuity and the remaining human checks are accepted.

## Validation of this preparation

Passed locally on Node 24.19.0 / pnpm 10.34.5:

- `pnpm --filter @workspace/kindred-coach run test`: 195 tests in 23 files,
  including six deployment-configuration checks.
- `pnpm run typecheck`: full workspace, including the production frontend/API,
  database scripts, libraries, scripts and experimental frontend.
- `pnpm --filter @workspace/db run test:api`: 298 tests in 37 files, using the
  disposable MongoDB replica-set harness. No production database was accessed.
- `pnpm --filter @workspace/kindred-coach run build:deployment`: Vite build and
  public prerender passed with synthetic public Auth0 identifiers.
- `pnpm --filter @workspace/api-server run build`: passed.
- `git diff --check`: passed.

Not performed: container build/boot (local Docker socket denied access), remote
CI for this preparation, production provider configuration, customer inventory or
restore rehearsal, identity import/mapping, live account-security tests, new human
acceptance sessions, deployment or production flow verification. The existing
migration tests use synthetic records; they do not prove customer migration.

No production settings, customer records, imports, messages, charges or deployments
were changed by preparation. No Clerk or Calendar credentials/data were removed.

## Provider setup progress — September 11, 2026

This section records later operational work separately from the original local
preparation above.

- Founder reported confirming the production callback/logout/origin entries,
  RS256 API audience/offline access, and refresh rotation with seven-day maximum
  and one-day idle lifetimes. These confirmations are not a full production login test.
- Preparation commit `6d9960b2d5fbb0bf190389d5a10a1a26c0dfe7cc` was pushed to
  `origin/codex/auth0-cutover-preparation`; it has not been merged or deployed.
  GitLab pipeline `2840852197` failed without executing its checks: the typecheck
  job reports "No more compute minutes available" and has no trace. Do not treat
  this as either a test failure or a successful remote validation.
- Auth0 custom domain `auth.kindred-asterling-ai-coaching.com`, resource
  `cd_Yk5iiysYGTxBmMSd`, exists and uses Auth0-managed certificates. It initially
  reported "The verification record was not found."
- Cloudflare's existing `auth` CNAME already pointed to
  `dev-rio3w0hvdl6hccn6-cd-yk5iiysygtxbmmsd.edge.tenants.us.auth0.com` with
  proxying disabled. The cause was zone-wide **CNAME flattening for all CNAME
  records**, which suppressed CNAME answers even for DNS-only records.
- Disabled that zone-wide flattening setting and read back the saved `false`
  state. Both authoritative nameservers and Google's public resolver returned the
  required CNAME afterward. Another public resolver retained a negative cache
  response, so propagation was still in progress. Existing record targets,
  website proxying, DNSSEC, and access policies were not changed. This setting
  affects all DNS-only CNAME answers, not only `auth`; their destinations remain
  unchanged. Restoring the toggle would restore flattening but break verification.
- Both production API health endpoints returned success after the DNS change.
  Auth0 subsequently reported the custom domain VERIFIED. Its HTTPS OpenID
  discovery endpoint returned the custom-domain issuer and authorization, token,
  and JWKS endpoints successfully. This does not activate the deployed app issuer.
- Founder created the separate **Kindred Auth0 Sign-In** Web client and saved
  its credentials in Auth0. The expected client ID was read back without exposing
  the secret; the developer-key warning disappeared. Enabled this connection for
  the Kindred SPA. No existing Calendar client was edited.
- Founder completed Try Connection. Auth0 logs confirm Success Login through
  `google-oauth2` at `2026-09-11T13:25:51.436Z` and Success Exchange of the
  authorization code at `2026-09-11T13:25:51.922Z`. This verifies the social
  connection, not the deployed Kindred application or existing-account continuity.
- Founder saved Spacemail SMTP credentials and sent test messages. The earlier
  test at `2026-09-11T13:30:23.397Z` failed with SMTP 535 authentication rejected.
  A later test at `2026-09-11T13:36:47.573Z` returned HTTP 200 / "Email sent",
  with no newer notification failure observed. Founder subsequently confirmed
  receipt. SMTP test delivery is verified; password-reset flow remains untested.
  Credential fields appearing blank after saving are not evidence of missing
  stored credentials.

Pending: account-security operations, complete customer
mapping/restore rehearsal, CI capacity, container validation, and production release.

## Coolify read-only cutover audit — September 11, 2026

- Latest successful deployment remains `9980553b0a316fe5dbe60f6daf5c421d8c5e217f`.
  The same image is listed as available for rollback. Rollback itself was not run.
- Git Source is Kindred-Gitlab, repository
  `Kindred-2026/Kindred-Asterling-AI-Coaching`, branch `main`,
  commit selector `HEAD`. A fresh GitLab fetch still resolves main to
  `2205b982401cd809fd0a297eb9cd378e5e0c0159`.
- No `AUTH0_*` or `VITE_AUTH0_*` variables are present in the 50-row hosting
  inventory. Clerk, Calendar, payment, reminder, AI and database variable names
  remain present. Secret values were not exposed or changed.
- Coolify application storage backups show zero schedules and zero executions.
  This page covers application storage; it does not establish whether external
  MongoDB has backups. A database backup and restore rehearsal remain unverified.
- No reviewed identity mapping or rehearsal report was located in the release
  checkout. Requested the location of any private existing evidence from the
  founder. No production records were read or modified during this audit.
- No Coolify settings were saved and no deployment was triggered. Existing
  account continuity must be established before switching traffic: the new API
  rejects email collisions with `account_link_required` and has no live Clerk
  authentication fallback.

## Hosting values saved — September 11, 2026

- Founder added all five Auth0 production values. Corrected the misspelled
  `VITE_AITH0_AUDIENCE` to `VITE_AUTH0_AUDIENCE` in production and preview.
  Explicitly saved and read back the production audience value.
- Read back all five production public values against the table above. The three
  Vite values are build-only; both API values are runtime-only. No secrets were
  revealed or replaced. Coolify still uses its existing BuildKit secrets mode.
- Auth0 SPA settings include the production root callback/logout and web origin,
  alongside localhost:8080 entries. Refresh rotation is enabled, idle lifetime
  86400 seconds, maximum lifetime 604800 seconds, overlap 5 seconds.
- The application settings MRRT table and its configuration panel currently show
  no API entries. Earlier grant documentation does not establish current readiness.
  Resolve grant/audience configuration or verify live account-security operations
  through the custom domain before promotion.
- Founder reports no other platform users and no known prior migration work. This
  is not a verified database inventory; the founder's own history still requires
  continuity. MongoDB Atlas connector access is expired and requires reconnection.
  No account records were retrieved or modified.
- No deploy, merge, backup, identity write, or credential retirement was performed.

## Read-only account inventory — September 11, 2026

- MongoDB Atlas connector reauthenticated successfully. Inspected the selected
  project's Cluster0 and the `kindred` database; Coolify's production database
  name was read back as `kindred`.
- Two application user records exist: one with a Clerk mapping and neither with
  an Auth0 mapping. Both have email addresses and existing coaching history.
- The older record has one conversation, one morning log, and no subscription
  record. The Clerk-linked record has five conversations, two morning logs, and
  one subscription record. A subscription record alone does not prove a paid or
  active entitlement. No message bodies or health content were read.
- Founder confirmed both accounts belong to them and must remain separate with
  their existing histories. Exact email addresses and identity IDs are omitted
  from this tracked report. No account merge is authorized.
- Auth0's user inventory currently shows one Google identity matching the
  Clerk-linked account's label. The second account still needs a verified Auth0
  identity. Email matching alone is not proof sufficient to apply a mapping.
- The current migration helper requires a nonempty Clerk subject for every row,
  so it cannot handle the older account as-is. A reviewed migration path for
  that account and an isolated restore rehearsal remain required.
- Atlas has a database named `kindred_migration_rehearsal_20260902`; its name
  alone is not evidence of a current backup, tested restore, or Auth0 rehearsal.
- The Atlas web dashboard requires a separate login to inspect backup/restore
  options. Requested browser login; no backup or restore was initiated.
- All MongoDB operations were read-only. No database records, provider identities,
  subscriptions or production deployments changed during this inventory.

## Atlas backup and restore rehearsal started — September 11, 2026

- Atlas Cloud Backup and point-in-time recovery are enabled for Cluster0.
  Dashboard showed 29 retained snapshots; newest snapshot was
  `2026-09-11T13:52:16Z` (07:52 MDT), MongoDB 8.0.32.
- Restore history was empty before this rehearsal.
- Started restore job `6aa4097cdc4bdca4c495e1a8` at approximately 08:00 MDT:
  source `kindred` from that snapshot; destination
  `Cluster0.kindred_auth0_restore_20260911`; strategy **Create as new**.
  Selected all ordinary indexes excluding TTL indexes so expiry cannot remove
  rehearsal records. Search indexes are not supported by this restore mode.
- Atlas selected-data size was 528 KB. No new cluster was created. The restore
  creates a separate database on the existing cluster and does not overwrite
  `kindred`. It still uses shared cluster resources.
- Last observed state: INITIALIZING, preparing resources and performing collection
  restore. Completion, record reconciliation and migration rehearsal are pending.
- Opened a Google connection test for the founder's second account. User must
  complete account selection/sign-in; no second identity has been assumed.
- No production account mapping, live database overwrite, merge or application
  deployment was performed.

## Second identity and migration-helper preparation — September 11, 2026

- The second Google connection test displayed Successful transaction. Auth0's
  user inventory now shows two separate Google identities corresponding to the
  two founder-owned account labels. Exact identity IDs remain out of this report.
- Added an explicit `--allow-legacy-without-clerk` migration option requiring
  `clerkUserId: null` in each independently reviewed pre-Clerk mapping. Omitted
  fields still fail, and existing Clerk/Auth0 ownership checks remain enforced.
  Each transactional update now requires exactly one matched account.
- Added regression coverage for opt-in/dry-run behavior, omitted legacy IDs,
  rejection of a null mapping against a Clerk account without partial batch
  writes, and Auth0 identity collisions. Tests use a disposable local replica set.
- No mapping has been applied to either live or restored accounts. The Atlas
  restore job still reported INITIALIZING at the latest check.

Validation of the legacy-account helper update (Node 24.19.0 / pnpm 10.34.5):
`pnpm --filter @workspace/db run test:api` passed 302 tests in 37 files;
`pnpm --filter @workspace/kindred-coach run test` passed 195 tests in 23 files;
`pnpm run typecheck` passed across the workspace; `git diff --check` passed.
No new application build, remote CI, live migration or production verification
was performed for this update.

## Migration rehearsal completed — September 11, 2026

The Atlas restore completed and the full identity-mapping rehearsal ran to
completion against the isolated copy `Cluster0.kindred_auth0_restore_20260911`.
Production `kindred` was not written to at any point.

- The two founder-owned accounts were mapped to their confirmed Auth0 Google
  subjects. One account is pre-Clerk (migrated with `clerkUserId: null` via
  `--allow-legacy-without-clerk`); the other is Clerk-linked. Exact identity
  IDs and emails remain out of this tracked report.
- The founder confirmed each Auth0 subject by reading the Auth0 user record
  (email-verified, matching the corresponding account), not by position.
- The mapping file is stored owner-only outside the repository; it is not
  committed.

Rehearsal sequence against the restore database:

- Dry run passed: both mappings validated with no writes.
- Apply passed: `auth0UserId` and `updatedAt` set on exactly two rows.
- Read-back confirmed internal `id` values unchanged, `clerkUserId` preserved
  (including the legacy `null`), and `auth0UserId` set to the intended subject
  on each account.
- Data continuity verified: the pre-Clerk account retains one conversation and
  one morning log with no subscription; the Clerk-linked account retains five
  conversations, two morning logs, and one subscription. These match the
  read-only inventory recorded above.
- Database-initialization rehearsal passed: the unique partial `auth0UserId`
  index (`auth0UserId_1`, unique, `{$type:"string"}` filter) installs cleanly
  on the populated restore database.

Authorization: the Atlas database user initially held `readWrite` on `kindred`
only. The founder added `readWrite` on `kindred_auth0_restore_20260911` to the
existing user (`asterlingdigital_db_user`) to permit the rehearsal. No role
grants beyond the existing `kindred` scope were added.

Not performed: production mapping, any write to `kindred`, live
account-security operations, container build/boot, deployment, or provider
credential changes.

## CI coverage moved to GitHub Actions — September 11, 2026

GitLab CI remains blocked on shared compute minutes ("No more compute minutes
available"). To retain validation coverage without GitLab compute, the GitHub
Actions workflow (`.github/workflows/ci.yml`) was updated to mirror the GitLab
jobs: `typecheck`, `test-api-server` (with `libcurl4`), `test-kindred-coach`,
and a production build that runs `build:deployment` plus the API build using
synthetic public Auth0 identifiers. Committed locally on the cutover branch
and pushed to `origin`.

## Production mapping applied — September 11, 2026

The reviewed mapping was applied to the live `kindred` database with the
founder's explicit approval. The write-freeze precondition is satisfied in
practice: the founder confirmed only the two founder-owned accounts exist.

- Dry run against `kindred` passed: both mappings validated with no writes.
- Apply set `auth0UserId` and `updatedAt` on exactly two rows; read-back
  confirmed internal `id` values unchanged and `clerkUserId` preserved
  (including the legacy `null`).
- The currently deployed build is still the pre-Auth0 Clerk build, which reads
  `clerkUserId` and ignores `auth0UserId`, so the write is inert until the
  Auth0 build deploys.
- The unique partial `auth0UserId` index is not yet installed on `kindred`; it
  is created by the first Auth0-build database initialization on deploy.
  Production has two distinct subjects, so the index will build cleanly.

Not performed: deployment, live account-security operations, container
build/boot, or provider credential changes.

## Deploy source flipped to GitHub — September 11, 2026

GitLab could not run the pipeline (no shared compute minutes), so the deploy
source and CI were moved to the GitHub repository.

- Force-pushed GitHub `main` to match GitLab `main` (`2205b98`). This dropped
  the GitHub-only commits that had diverged from GitLab (dependabot bumps and a
  jfrog OIDC workflow example); they are minor and re-creatable.
- Pushed `codex/auth0-cutover-preparation` to GitHub and merged it via pull
  request #134. GitHub `main` now carries the Auth0 `Dockerfile` build args and
  the updated GitHub Actions `ci.yml`.
- GitHub Actions CI ran on the pull request: `typecheck`, `test-api-server`,
  `test-kindred-coach`, and `build` all passed, along with CodeQL, njsscan, and
  Devin review. Two pre-existing checks remain red in the experimental Next.js
  `frontend/` package only (`pnpm audit` vulnerabilities and an
  `eslint-plugin-react`/`eslint` version incompatibility); these are not
  deployed and do not block the production build.
- Coolify must be repointed to the GitHub repository
  (`Kindred-2026/Kindred-Asterling-AI-Coaching`, branch `main`) before the
  next deploy. This repointing was not performed from the repository.

Not performed: Coolify repointing, deployment, live account-security
operations, or container build/boot.
