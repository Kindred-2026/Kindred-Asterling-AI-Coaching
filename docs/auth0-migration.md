# Auth0 replacement and rollout

> **Historical rollout record.** This document records the implementation and
> evidence from that phase; it is not the source of current production status.
> Check `docs/FINALIZATION_RECORD.md` and the latest release evidence for
> current gates. Use `docs/FLY_DEPLOYMENT.md` for the selected hosting target.

The React/Vite frontend and Express API use Auth0. Internal `users.id` values
remain the owner keys for coaching records, subscriptions, reminders, and other
application data. The old Clerk mapping fields and offline migration helpers
remain for audit/rollback; the Clerk webhook is no longer mounted and the
production packages no longer depend on Clerk.

## Current cutover preparation

The [production cutover checklist](releases/auth0-cutover.md) records the exact
hosting changes, account-mapping gates, rollback procedure, and pending evidence.
The preparation branch updates the root Dockerfile to accept the three public
Auth0 build values through arguments or secret mounts, and rejects missing values
before compilation. It does not apply provider settings or production identity writes.
The historical task evidence below records what was done at that time.

## Auth0 resources created through MCP

- Application: **Kindred Asterling AI Coaching** (`HhxYDycwHK6A71CofaymdURN9zEgvaFS`), type SPA, authorization code + rotating refresh tokens, no client secret in the browser.
- Tenant: `dev-rio3w0hvdl6hccn6.us.auth0.com`.
- API: **Kindred Coaching API**, identifier `https://kindred-asterling-ai-coaching.com/api`, RS256.
- Registered local callback and logout: `http://localhost:8080/`; web origin: `http://localhost:8080`.
- The MCP quickstart enabled `skip_non_verifiable_callback_uri_confirmation_prompt` for localhost.
- No production deployment, production callback registration, customer import, or production database migration has been performed.

## Configuration

Frontend build variables:

```text
VITE_AUTH0_DOMAIN=dev-rio3w0hvdl6hccn6.us.auth0.com
VITE_AUTH0_CLIENT_ID=HhxYDycwHK6A71CofaymdURN9zEgvaFS
VITE_AUTH0_AUDIENCE=https://kindred-asterling-ai-coaching.com/api
```

The onboarding tool wrote the package's ignored `.env.local`. Vite loads `VITE_AUTH0_*` from there, while preserving the workspace-root environment convention for other keys; explicit build environment values take precedence. Keep all environment files untracked. The SPA uses in-memory token storage, authorization code with PKCE, rotating refresh tokens, and validated site-relative return destinations. Public prerendering uses a static signed-out context; authentication executes in the browser.

API runtime variables:

```text
AUTH0_DOMAIN=dev-rio3w0hvdl6hccn6.us.auth0.com
AUTH0_AUDIENCE=https://kindred-asterling-ai-coaching.com/api
```

Set these in the existing environment injection mechanism. The API never uses a SPA client secret or MCP management token. `CLERK_*` variables are no longer runtime requirements. Health handlers do not require user authentication, but production startup requires both Auth0 runtime variables. API routes that require a user reject missing/invalid tokens. JWT signature, algorithm, issuer, audience and expiration are checked by `express-oauth2-jwt-bearer`. UserInfo must match the verified subject. Auth0 machine identities are rejected on user routes.

## Account security

The account page uses the official Auth0 React SDK's My Account client to list/remove authentication methods, enroll authenticator apps and phone verification, and change passwords. Secrets entered by users are held in component state and sent through the SDK; they are not logged or persisted by Kindred. Auth0 controls factor availability and step-up requirements.

The My Account API is enabled in this tenant. The new SPA now has a **user** client grant to `https://dev-rio3w0hvdl6hccn6.us.auth0.com/me/` with:

- `read:me:authentication_methods`
- `create:me:authentication_methods`
- `delete:me:authentication_methods`
- `read:me:factors`

The same audience/scopes are configured in the SPA's Multi-Resource Refresh Token policy. Refresh tokens remain rotating and expiring, with a seven-day maximum lifetime and one-day idle lifetime. Keep the My Account API's existing security policy and factor restrictions. Test actual enrollment, step-up and removal with a dedicated test account before production. Do not globally weaken MFA or consent policies to make a test pass.

## Existing users and data

A new Auth0 subject never receives an existing account based only on email. A conflicting email produces `409 account_link_required`, and the frontend explains that support must link the account. Newly registered users receive a new internal application ID. Existing users need a reviewed mapping before cutover.

1. Take and restore-test a database backup. Inventory legacy Clerk users, authentication methods, provider connections, and application mappings through an authorized export workflow. Do not paste customer exports or credentials into chat.
2. Create/import corresponding identities into Auth0 using an approved migration plan. Password hash compatibility, social identity linking, email verification and MFA enrollment need provider-specific verification; this code change does not migrate those credentials. Prefer staged migration and explicit re-enrollment where transfer is unsupported.
3. Produce a privately stored, reviewed JSON mapping with exact IDs:

   ```json
   [{"userId":"existing-kindred-id","clerkUserId":"existing-clerk-id","auth0UserId":"auth0|verified-auth0-subject"}]
   ```

For a legacy account that predates Clerk, the reviewed mapping must explicitly set
`clerkUserId: null` and the command additionally requires
`--allow-legacy-without-clerk`. Establish ownership through an independently
verified sign-in and owner review before preparing that mapping. An omitted field
is rejected. The flag never bypasses an existing Clerk mapping or Auth0 owner,
never links by email, and leaves the missing/null Clerk field unchanged. Use the
same restore rehearsal and production approval process as for Clerk accounts.

4. With an isolated restored MongoDB replica set selected in the environment, validate without writes:

   ```sh
   pnpm --filter @workspace/db exec tsx ./scripts/link-auth0-identities.ts --mapping /private/path/reviewed.json --database kindred_rehearsal
   ```

5. After reviewing the result, repeat with `--apply` against the rehearsal database. The script checks the expected database name, old mapping, duplicate subjects and conflicting assignments; all updates are transactional. It changes `auth0UserId` and `updatedAt` only, preserving application IDs and Clerk mappings. A reviewed mapping is the ownership evidence; the script does not infer or establish ownership from an email.
6. Verify coaching history, subscription/owner/beta access, reminders and all account lifecycle operations for migrated users. Keep the old provider and backup through the rollback window.
7. Production mapping is a separately authorized operation. The new unique partial `auth0UserId` index is installed by normal database initialization on deployment; rehearse this before rollout.

## Release gates

- Run frontend tests/typecheck, full workspace typecheck, production frontend/API builds, the disposable MongoDB API harness, and `git diff --check`.
- Complete a real browser login → API → logout round trip and account-security operations with a test identity. Verify rejected JWTs and anonymous requests stay rejected.
- Review the active hosting build configuration before rollout. **Use `docs/FLY_DEPLOYMENT.md` for the selected Fly.io target; the legacy Coolify record is retained only for the current rollback deployment.** The prepared Dockerfile uses `VITE_AUTH0_*`; build and runtime values must select the same tenant and API audience.
- Register the final production callback, logout and web-origin URLs on the intended Auth0 application. Configure the approved production tenant and API variables in hosting. Do not mix tenants between frontend and backend.
- Deploy only after explicit approval, then verify `/api/healthz`, `/api/healthz/db`, migrated signed-in flows, payments and reminders in production. A passing build or CI does not establish production readiness.

References: [React SDK examples](https://github.com/auth0/auth0-react/blob/main/EXAMPLES.md), [Express JWT protection](https://auth0.com/docs/quickstart/backend/nodejs), [My Account API](https://auth0.com/docs/manage-users/my-account-api).

## Validation recorded in the originating local Auth0 task

- `pnpm --filter @workspace/kindred-coach run typecheck` — passed during integration.
- `pnpm --filter @workspace/api-server run typecheck` — passed as part of the final workspace check (an earlier standalone run found an obsolete Clerk test import, subsequently fixed).
- `pnpm --filter @workspace/kindred-coach run test` — 177 passed.
- `pnpm --filter @workspace/db run test:api` — 287 passed, using a disposable MongoDB replica set. Includes signed JWT rejection, identity collisions, reminder delivery, and dry-run/apply migration-command tests with synthetic records.
- `pnpm run typecheck` — passed, including library builds, migration scripts, canonical apps, and the experimental frontend.
- `pnpm --filter @workspace/kindred-coach run build` — passed, including public prerendering.
- `pnpm --filter @workspace/api-server run build` — passed.
- `git diff --check` — passed.
- Browser: the local `/login?returnTo=%2Ftoday` page rendered and its Sign in button reached the intended Auth0 application's Universal Login page.
- Not performed: a complete credentialed browser round trip, live My Account enrollment/removal/password changes, customer identity import, production migration, CI push, merge, deployment, or production flow verification.

The My Account user grant and MRRT policy are **configured**. Browser authorization completed, grant `cgr_ACzfmSo9AgcWGbT9` was created with `subject_type: user` and the four scopes listed above, and a subsequent application read verified the MRRT policy and rotating/expiring refresh-token settings. Credentialed account-security operations still require live verification. The registered SPA, Kindred API, and grant already exist; do not create duplicates when resuming.

At the end of the originating integration task, the root Dockerfile still injected only the Clerk publishable key. The later cutover preparation fixes that build wiring; production hosting changes remain pending.

## Clerk retirement boundary

Keep the Clerk instance, credentials, user records, and legacy identity mappings available until the Auth0 identity reconciliation and rollback retention gates are verified in `docs/FINALIZATION_RECORD.md`. The `clerk:admin` inspection command is retained for authorized inventory and diagnosis; it is not a complete customer or credential export. Use the reviewed export/import and identity-linking process above. Committing or pushing this branch does not authorize deployment, production identity writes, deleting Clerk data, revoking keys, or cancelling the Clerk service.

This integration retained GitLab main's existing Calendar authentication boundary and Today progression fixes. The Calendar retirement page tests use the replacement auth adapter. Docker/container and external provider settings remained unchanged.

## Integrated GitLab branch verification — September 8, 2026

Base: authoritative `origin/main` at `057a2050198d3f222c131647637b7ade97685c54`. The branch also includes the three reviewed Clerk inspection commits from GitHub: `1e701c6d49dca23bf9e978513b132edc39dbab9e`, `a42fb620ed60a5fa13f00f7f67e97b09077b7c49`, and `43564aa26c1a557c04a16bc3d2b9baea483ab641`. The helper's final files match GitHub main exactly; unrelated GitHub dependency and JFrog workflow changes were excluded.

Passed in the isolated integration worktree using Node 24.19.0 and pnpm 10.34.5:

- Frozen-lockfile offline dependency installation with lifecycle scripts disabled.
- `pnpm run typecheck`, including libraries, migration scripts, production packages, scripts, and the experimental frontend.
- `pnpm --filter @workspace/kindred-coach run test`: 21 files, 184 tests.
- `pnpm --filter @workspace/db run test:api`: 36 files, 292 tests using a disposable MongoDB replica set.
- `pnpm --filter @workspace/kindred-coach run build`: production bundle and public prerendering, with synthetic public Auth0 configuration supplied for compilation only.
- `pnpm --filter @workspace/api-server run build`.
- Clerk CLI help without credentials, plus 21 offline CLI smoke tests with synthetic records and fetch interception.
- `git diff --check`, staged whitespace validation, helper file equality, and comparison of the Calendar/Today implementation and regression tests against GitLab main.

The React/React DOM catalog moves together from 19.1.0 to 19.1.4 to satisfy the installed Auth0 React SDK's React 19.1 peer range. No dependency installation or source edits were made in the original checkout; its branch, HEAD, status, and 476 tracked/untracked path contents and modes matched the pre-integration snapshot.

This evidence is local validation. CI results, credentialed browser login/logout and My Account operations, production hosting configuration, customer import/linking, production deployment, and post-cutover verification are not established by these checks. Keep Clerk available until those rollout gates and the rollback window have been completed.
