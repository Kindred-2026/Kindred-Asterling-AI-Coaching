# DigitalOcean deployment and cutover runbook

**Status (2026-10-14):** the domain is served by DigitalOcean App Platform
([public check](#public-read-only-check--2026-10-14)). Step 9's sign-in, chat
and log checks are not recorded here. `kindred-asterling-ai-coaching.fly.dev`
no longer resolves, so the Fly rollback below may no longer be available.
Check with `fly status` before relying on it. The DigitalOcean account is now operational, so this
replaces the 2026-09 guides that were removed when DigitalOcean declined the
payment methods available then.

Run it in three parts:

1. **Prepare (no downtime, any time):** steps 0 to 5 create the database
   and the app, and check the app on its `ondigitalocean.app` address.
2. **Cut over (planned window, about 30 minutes):** step 6 stops Fly, copies
   the data, and points the domain at DigitalOcean.
3. **Retire Fly (after about a week):** step 8.

## What moves where

| | Fly.io (today) | DigitalOcean (target) |
| --- | --- | --- |
| App | Fly app `kindred-asterling-ai-coaching`, one 1 GB shared machine, Toronto (`yyz`) | App Platform app `kindred-asterling-ai-coaching`, service `web`, one `apps-s-1vcpu-1gb` instance, Toronto (`tor`) |
| Database | Fly Managed Postgres 16, Toronto | Managed PostgreSQL 16 cluster `kindred-db`, Toronto (`tor1`), database `kindred` |
| Build | Fly remote builder, same `Dockerfile` | App Platform builds the same `Dockerfile` from `main` |
| Configuration | `fly.toml` | `.do/app.yaml` |
| Secrets | Fly secrets | App Platform encrypted environment variables |
| Deploy | **Deploy to Fly.io** workflow | **Deploy to DigitalOcean** workflow, or **Deploy** in the dashboard |
| Domain | Cloudflare **proxied** → Fly | Cloudflare **DNS only** → App Platform |

Unchanged: Auth0 (same domain, so no callback changes), Anthropic, Resend, the
marketing site on Cloudflare Workers, and Cloudflare AI Gateway.

### Changes in the repository for this move

- The app verifies the database's TLS certificate against `POSTGRES_CA_CERT`
  when it is set. DigitalOcean signs database certificates with its own CA and
  hands out `?sslmode=require` URLs, which the PostgreSQL client otherwise
  rejects. Fly is unaffected because it does not set the variable.
- The `Dockerfile` no longer uses BuildKit-only `RUN --mount`. The App Platform
  builder is reported not to support it. The Auth0 build values are public,
  so they are plain build arguments now; the Fly workflow passes them with
  `--build-arg`.
- The **Deploy to DigitalOcean** workflow applies `.do/app.yaml` on every
  deploy, like `fly.toml`. A deploy replaces the whole app spec, so the
  workflow first copies each secret's encrypted value from the live app. It
  also keeps secrets added only in the dashboard, and keeps the custom domains
  while `.do/app.yaml` has no `domains:` list. Plain settings that exist only
  in the dashboard are removed, with a warning, so keep them in
  `.do/app.yaml`.
- After deploying, the workflow checks that rate limits see real visitor IP
  addresses (`scripts/check-client-ip.mjs`). See
  [step 4](#4-proxy-hops-trust_proxy_hops).

## Why Cloudflare switches to DNS only

App Platform already serves every app through its own Cloudflare-based edge
with TLS and DDoS protection. DigitalOcean's guide for putting your own CDN in
front says the CDN must rewrite the Host header to the app's
`ondigitalocean.app` address and that the custom domain must not be added to
the app ([Use an External CDN](https://docs.digitalocean.com/products/app-platform/how-to/configure-external-cdn/)).
Cloudflare only allows Host header rewrites on the Enterprise plan
([Origin Rules](https://developers.cloudflare.com/rules/origin-rules/features/)),
and Kindred uses the Free plan. So the app domain's records become
**DNS only** (grey cloud) and App Platform serves the domain directly.

What the app domain loses: Cloudflare's Bot Fight Mode, the Free Managed
Ruleset and the `/api/` rate-limiting rule. The app keeps its own per-user and
per-IP rate limits. Problems recorded in the
[Fly runbook's public checks](FLY_DEPLOYMENT.md#public-read-only-check--2026-10-07)
go away with them: challenges on `/api/` requests, an injected script that the
CSP blocks, and rewritten security headers. The marketing domain and AI
Gateway are not affected.

Do not turn the proxy back on for the app domain. It would add a proxy hop and
make App Platform's certificate renewal unreliable.

## Cost

Published prices, not a measured invoice: about $12/month for the 1 GiB App
Platform instance and about $15/month for the smallest single-node Managed
PostgreSQL cluster (1 GiB, daily backups with point-in-time recovery). That is
roughly $27/month before AI, email and bandwidth, against about $45/month on
Fly ([cost baseline](COST_BASELINE.md)). The `apps-s-1vcpu-1gb-fixed` size
(about $10/month) also works, because Kindred runs exactly one instance.
A standby database node costs extra and is optional. Recheck
[App Platform pricing](https://www.digitalocean.com/pricing/app-platform) and
[database pricing](https://www.digitalocean.com/pricing/managed-databases)
before creating anything, and record the first invoice in the cost baseline.

## 0. Before you start

- Install on your computer: `flyctl` (already used), and the PostgreSQL 16 (or
  newer) client tools `psql`, `pg_dump` and `pg_restore`. On a Mac:
  `brew install libpq && brew link --force libpq`. Check with
  `pg_dump --version`.
- Merge this change to `main`. App Platform builds `main`, and GitHub only
  offers the new workflow once it is on `main`.
- Let App Platform read the repository: in DigitalOcean, start **Create →
  App → GitHub**, install the DigitalOcean GitHub app on `Kindred-2026` with
  access to `Kindred-Asterling-AI-Coaching`, then leave the wizard without
  creating anything. The workflow creates the app in step 3.
- In DigitalOcean, create a personal access token (**API → Tokens → Generate
  New Token**, Custom Scopes: all `app` scopes plus `database` read). If a
  deploy later fails with a permissions error, regenerate it with full access.
- In GitHub (**Settings → Environments → New environment**), create
  `digitalocean-production` and add:
  - Secret `DIGITALOCEAN_ACCESS_TOKEN`: the token above.
  - Variables `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`,
    `VITE_AUTH0_AUDIENCE`: the same public values as in the `fly-staging`
    environment.
- Collect the runtime values while Fly is still running. `fly secrets list
  --app kindred-asterling-ai-coaching` shows the names. For values you do not
  have elsewhere, this prints them to your terminal only:

  ```sh
  fly ssh console --app kindred-asterling-ai-coaching -C "printenv AUTH0_DOMAIN AUTH0_AUDIENCE RESEND_FROM_EMAIL SUBSCRIPTION_OWNER_IDS"
  ```

  For `ANTHROPIC_API_KEY` and `RESEND_API_KEY`, create **new** keys named for
  DigitalOcean in the Anthropic Console and Resend. Revoke the Fly keys in
  step 8. If `fly secrets list` shows `AMPLITUDE_API_KEY`,
  `AMPLITUDE_ID_SALT` or `AMPLITUDE_AI_API_KEY`, copy them too. Keep the salt
  identical, or analytics user IDs change. Skip `POSTGRES_URL` (replaced by the database binding) and
  `OPENAI_API_KEY` (unused while `AI_PROVIDER` is `anthropic`).

## 1. Create the database

1. **Databases → Create Database Cluster**: PostgreSQL **16** (the version Fly
   runs), region **Toronto (TOR1)**, the smallest plan, name **`kindred-db`**.
   Wait until it shows as ready.
2. **Users & Databases**: add the database **`kindred`** and the user
   **`kindred_app`**. The app logs in as `kindred_app`; `doadmin` is only for
   you.
3. **Settings → Trusted Sources**: add your computer's IP address for the
   setup steps. You remove it again in step 7.
4. **Overview → Connection Details**: choose user `doadmin`, database
   `kindred`, and note the host. Click **Download CA certificate** and save it
   as `ca-certificate.crt` in the repository folder (Git ignores it). Then:

   ```sh
   export DO_DB="host=<the host> port=25060 user=doadmin dbname=kindred sslmode=verify-full sslrootcert=$PWD/ca-certificate.crt"
   psql "$DO_DB" -c "select version()"   # asks for the doadmin password
   ```

## 2. Load the empty schema

The app refuses to start without its schema. It gets an **empty** schema now,
and the real data only at cutover. That way, before cutover, the new app
cannot send reminder emails to testers alongside Fly.

```sh
cat lib/db/migrations-postgres/0*.sql | psql "$DO_DB" -v ON_ERROR_STOP=1 --single-transaction
psql "$DO_DB" -v ON_ERROR_STOP=1 -f .do/grant-app-role.sql
```

`.do/grant-app-role.sql` lets `kindred_app` read and write rows but not
create, change or drop tables, matching the Fly writer role. Check that, using
the `kindred_app` password shown under **Users & Databases**:

```sh
psql "${DO_DB/user=doadmin/user=kindred_app}" -c "create table privilege_check(x int)"
# expected: ERROR:  permission denied for schema public
```

If the table is created instead, drop it as `doadmin` and ask for help before
continuing; the user has more rights than the app needs.

## 3. Create the app

1. In GitHub, **Actions → Deploy to DigitalOcean → Run workflow** on `main`.
   The first run creates the app and builds the image, then **fails at
   startup**, because the secrets have no values yet. That is expected; the
   run warns which secrets are empty.
2. In DigitalOcean, open the app → **Settings → web → Environment
   Variables → Edit**. Fill in `ANTHROPIC_API_KEY`, `AUTH0_DOMAIN`,
   `AUTH0_AUDIENCE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and
   `SUBSCRIPTION_OWNER_IDS` with **Encrypt** ticked. Add any optional ones
   from step 0 the same way. Save; App Platform redeploys.
3. Check **Settings → Trusted Sources** on the database lists the app. App
   Platform normally adds it when it attaches the database; add it if not.
4. Run the workflow again. This time it should finish green, including the
   **Check visitor IPs reach the rate limiter** step.

## 4. Proxy hops (`TRUST_PROXY_HOPS`)

Rate limits for signed-out requests, including page and asset loads, are per
visitor IP. Express finds that IP by trusting `TRUST_PROXY_HOPS` proxies in
front of the app. If the number is too low, every visitor looks like the same
proxy and they all share one limit of 300 requests per 15 minutes, which
would break the sign-in page under normal use. If it is too high, anyone can
choose their own IP with a forged `X-Forwarded-For` header and dodge limits.

How many hops App Platform adds is not documented, so `.do/app.yaml` starts
at `1`. The workflow's last step tests it. It compares the rate limiter's
hashed key with the runner's real IP, and it sends a forged header to see
whether the app believes it. If the step fails, it says whether to raise or
lower the value. Change `TRUST_PROXY_HOPS` in `.do/app.yaml`, merge, and
deploy again. You can run the same check from your own computer:

```sh
node scripts/check-client-ip.mjs https://<app>.ondigitalocean.app
```

## 5. Check the app before cutover

On `https://<app>.ondigitalocean.app` (shown in the app's overview):

```sh
curl -sS https://<app>.ondigitalocean.app/api/healthz      # {"status":"ok"}
curl -sS https://<app>.ondigitalocean.app/api/healthz/db   # {"status":"ok","database":"connected"}
```

The sign-in page loads there, but signing in does not. The app only accepts
browser calls from `APP_PUBLIC_URL`, as with `fly.dev`. Sign-in is checked
right after the DNS switch. In **Runtime Logs**, look for
`Server listening` and `Reminder scheduler started`, with no errors.

Optionally, time a practice copy of the data now. Use step 6's dump and
restore commands, restoring into a scratch database such as
`kindred_rehearsal` (create it under **Users & Databases**) rather than
`kindred`, and leave Fly running. Delete the scratch database and the dump
afterwards.

## 6. Cutover

Tell beta testers about the window in advance. During it the app is
unavailable, and anything they type is lost.

1. **Save the current DNS records.** In Cloudflare, open the
   `kindred-asterling-ai-coaching.com` zone → **DNS → Records → Import and
   Export → Export**. Keep the file; rollback uses it.
2. **Open the Fly database tunnel** in a separate terminal and leave it
   running:

   ```sh
   fly mpg proxy w76geop28dnrplk4 --bind-addr 127.0.0.1 --local-port 16432
   ```

   In the Fly dashboard's Managed Postgres **Connect** view, note the
   `schema_admin` user name and password. In your main terminal:

   ```sh
   export FLY_DB="host=127.0.0.1 port=16432 user=<schema_admin user> dbname=fly-db"
   ```

3. **Stop Fly**, so nothing writes to the old database or sends reminders:

   ```sh
   fly scale count 0 --app kindred-asterling-ai-coaching --yes
   fly status --app kindred-asterling-ai-coaching    # no machines left
   ```

   Use `scale count 0`, not `machine stop`. Fly restarts stopped machines when
   a request arrives (`auto_start_machines = true`).

4. **Copy the data.** Each command asks for the relevant password. The
   restore replaces the empty schema in one transaction, so it either fully
   succeeds or changes nothing.

   ```sh
   pg_dump "$FLY_DB" --format=custom --no-owner --no-acl --schema=public --file=kindred-cutover.dump
   pg_restore --list kindred-cutover.dump | grep -v ' SCHEMA - public ' > kindred-cutover.list
   pg_restore --dbname="$DO_DB" --use-list=kindred-cutover.list --clean --if-exists \
     --exit-on-error --single-transaction --no-owner --no-acl --no-comments kindred-cutover.dump
   psql "$DO_DB" -v ON_ERROR_STOP=1 -f lib/db/migrations-postgres/0003_users_beta_checklist.sql
   psql "$DO_DB" -v ON_ERROR_STOP=1 -f .do/grant-app-role.sql
   ```

   The list file skips the dump's `CREATE SCHEMA public`, because that schema
   already exists in the new database. The restore copies Fly's schema as it
   is. It is not recorded whether Fly's database has the `0003` beta
   checklist column, and the app refuses to start without it, so `0003` runs
   again; it is safe to re-run. Do the same for any later migration that is
   safe to re-run.

5. **Compare row counts.** The two files must be identical:

   ```sh
   psql "$FLY_DB" -At -F' ' -f .do/row-counts.sql > counts-fly.txt
   psql "$DO_DB"  -At -F' ' -f .do/row-counts.sql > counts-do.txt
   diff counts-fly.txt counts-do.txt && echo "row counts match"
   ```

   Stop here and roll back if they differ.

6. **Add the domain to the app.** In the app, **Settings → Domains → Add
   Domain**: `kindred-asterling-ai-coaching.com`, choosing that you manage
   the DNS yourself. Add `www.kindred-asterling-ai-coaching.com` as an alias
   the same way. App Platform shows the target to point them at: the app's
   `ondigitalocean.app` hostname.
7. **Switch DNS** in Cloudflare (**DNS → Records**):
   - Delete the Fly `A` and `AAAA` records for `@`, and the
     `_acme-challenge` and `_acme-challenge.www` `CNAME` records.
   - Add `CNAME` `@` → `<app>.ondigitalocean.app`, **DNS only**. Cloudflare
     flattens a `CNAME` at the root automatically.
   - Change `CNAME` `www` to `<app>.ondigitalocean.app`, **DNS only**.
   - If the zone has `CAA` records, make sure they allow `letsencrypt.org` and
     `pki.goog`.
8. **Wait for the certificate.** The domains show as **Active** in the app's
   settings, usually within minutes. Cached DNS answers can keep sending
   some visitors to Cloudflare for up to five minutes.
9. **Verify on the real domain:**
   - `curl -sS https://kindred-asterling-ai-coaching.com/api/healthz/db`
     returns `connected`. `curl -sI` shows no `via: 1.1 fly.io` header.
   - Sign in. Your existing history is there.
   - Send one chat message and get a reply.
   - If you have a second test account, it sees only its own history.
   - Runtime Logs show no errors. The next reminder that is due arrives once.
10. Tell testers you are back. Delete `kindred-cutover.dump`,
    `kindred-cutover.list` and the `counts-*.txt` files; the Fly database still
    holds the source data until step 8.

### Rollback

Use this if verification fails. Any data testers wrote on DigitalOcean after
the switch is not on Fly; ask for help before copying it back.

1. In Cloudflare, put back the exported records: the Fly `A`/`AAAA` records
   for `@` and the `www` `CNAME`, all **proxied**, and the two
   `_acme-challenge` records **DNS only**.
   `fly ips list --app kindred-asterling-ai-coaching` shows the addresses.
2. In DigitalOcean, add the variable `REMINDER_SCHEDULER_DISABLED` = `true`
   to the `web` component, so the new app stops sending reminders, and remove
   the domains from the app.
3. Start Fly again and check it:

   ```sh
   fly scale count 1 --region yyz --app kindred-asterling-ai-coaching --yes
   curl -sS https://kindred-asterling-ai-coaching.com/api/healthz/db
   ```

## 7. After cutover

- Remove your computer's IP from the database's **Trusted Sources**.
- Set a billing alert (**Billing → Billing alerts**) at about $40/month.
- Deploy the marketing site (**Deploy to Cloudflare** workflow) so the privacy
  policy names DigitalOcean as the host.
- Deploy from now on with **Deploy to DigitalOcean**. Change configuration in
  `.do/app.yaml` and secret values in the dashboard.

## 8. Retire Fly (after about a week without problems)

1. Delete the Fly app and the Managed Postgres cluster
   (`kindred-staging-db-20260924`, `w76geop28dnrplk4`). This deletes the old
   copy of the data.
2. Revoke the Anthropic and Resend keys that Fly used, delete the Fly deploy
   token, and remove the `fly-staging` GitHub environment.
3. In Auth0, remove the `fly.dev` callback, logout and origin entries.
4. Remove the Fly files from the repository: `fly.toml`,
   `.github/workflows/fly-deploy.yml`, the Fly parts of `plugins/kindred-mcp`
   and `lib/db/scripts/run-fly-postgres-integration.mjs`. Also update
   `docs/FLY_DEPLOYMENT.md`, `docs/release-rollback.md`,
   `docs/DOMAIN_SPLIT.md`, `docs/COST_BASELINE.md` and `SECRET_INVENTORY.md`
   to match.

## Public read-only check — 2026-10-14

Unauthenticated `curl`/`dig`/`openssl` checks from 13:03 to 13:09 UTC against
`https://kindred-asterling-ai-coaching.com` and
`https://kindred-asterling-ai-coaching.fly.dev`. The marketing domain and
`www.` were outside this run's network allowlist. No sign-in, form, or AI
request was made.

| Check | Observed result |
| --- | --- |
| Host | Responses carry `x-do-app-origin` and `x-do-orig-status`, and no `via: 1.1 fly.io`, so App Platform serves the domain |
| Health | `/api/healthz` returned 200 `{"status":"ok"}` and `/api/healthz/db` returned 200 `{"status":"ok","database":"connected"}` in under 0.4 s, at 13:03 and again at 13:08 UTC |
| Fly staging | `kindred-asterling-ai-coaching.fly.dev` returns NXDOMAIN from Fly's DNS (`ns1.flydns.net`). Fly keeps that name while an app is scaled to 0, so the app was probably deleted or its IPs released. This could not be confirmed without Fly access |
| Deployed build | Static files are dated 2026-10-13 17:12:24 UTC, when `main` was at `7a9206b`. The served bundle `assets/index-BV4L0MRT.js` uses the public Auth0 tenant `dev-4c281gnuylq4hccq.ca.auth0.com` and audience `https://kindred-asterling-ai-coaching.com/api`. A local `build:deployment` of current `main` (`8e85acb`, which only adds the #282 dependency patch updates) gives a byte-identical `assets/index-D7RfiWZr.css` and `index.html`, apart from the bundle name. The JS bundle and `/pricing/` differ in dependency output. `7a9206b` could not be rebuilt offline, so the served build is not byte-verified |
| Public pages and domain split | `/`, `/login`, `/signup`, `/pricing/`, `/dashboard` and `/app/` return 200. `/about`, `/science`, `/legal/*`, `/legal-documents/*`, `/llms.txt` and `/sitemap.xml` return 301 to the same path on `https://kindred-asterling-ai.xyz`. `/robots.txt` returns `Disallow: /`. The Cloudflare managed challenges and the injected challenge script recorded on Fly are gone |
| Auth and CORS | `/api/auth/user` and `/api/calendar/status` return 401 without a token. With origin `https://kindred-asterling-ai-coaching.com`, the 401 carries a matching `Access-Control-Allow-Origin`. With the `fly.dev` origin or an unknown origin, it returns 403 (PR #268). The calendar 404 criterion stays unverified because authentication runs first |
| Security headers | The CSP from `securityHeaders.ts` (Auth0 tenant in `connect-src`/`frame-src`), HSTS `max-age=31536000; includeSubDomains`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-XSS-Protection: 0`, and `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy: same-origin`, matching Helmet with no edge rewrites |
| TLS | Google Trust Services `WE1` certificate for `kindred-asterling-ai-coaching.com`, expiring 2027-01-11 (89 days). `*.fly.dev` could not be checked because the name does not resolve |
