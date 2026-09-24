# Railway deployment candidate

**Status:** recommended alternative to DigitalOcean after the account rejected
the available payment methods. No Railway account, app, database, or payment
method has been configured or verified. Keep Coolify and MongoDB available.

Railway is the preferred next provider to evaluate because one Railway project
can deploy the existing application from GitHub, run PostgreSQL, provide
scheduled volume backups and PostgreSQL point-in-time recovery, and expose
hard compute spending limits. This is a candidate, not proof that Railway will
accept the same payment method or that actual Kindred costs will fit the
under-$50/month target.

## Application deployment shape

Deploy one Node.js service from the canonical repository root. Keep the Vite
client and Express API in the existing single production artifact:

- Root directory: repository root (`/`)
- Build command: `pnpm build`
- Start command: `pnpm start`
- Health check: `/api/healthz/db`
- Use the platform-provided `PORT` value.

Confirm Railpack selects the repository's supported Node.js version and
pnpm workspace correctly in a non-production deploy. Do not split the client
and API into separate services: the Express server serves the built browser
assets and `/api/**` on the same origin. Do not add a Docker requirement.

Set `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE` as
build-time public identifiers. Put runtime credentials in Railway's encrypted
service variables, never in GitHub or config files. Until the PostgreSQL
adapter is integrated and validated, the application still requires its
current MongoDB runtime configuration. Do not point `DATABASE_URL` at a new
database yet.

## Cost and guardrails

Railway Hobby currently has a $5/month minimum that includes $5 of service
usage. Service usage is metered by CPU, memory, storage, and egress; it is not
a fixed app-plus-database price. At the published rates, an illustrative
always-active combined footprint of 1 vCPU and 1 GB RAM is about $30/month for
CPU and memory before volumes, network egress, AI inference, and other services.
This is a ceiling-style illustration for continuously consumed CPU, not a
forecast of Kindred's actual usage. Measure a staging service before selecting
production sizes.

Set a workspace compute email alert and hard limit before deploying. Railway
takes all workloads offline at the hard limit, so treat it as a deliberate
spend-versus-availability control; set it above a realistic monthly baseline
and alert threshold. Add model-provider quotas and alerts separately.

For PostgreSQL, enable scheduled volume backups and PITR before production data
arrives. Railway documents daily, weekly, and monthly volume backup retention
and roughly four weeks of PITR when the required base backups are available.
Keep portable encrypted `pg_dump` backups outside the Railway project and
prove restore before cutover; platform snapshots alone do not satisfy the
rollback requirement.

## Migration and cutover gates

1. Verify Railway accepts the intended payment method and review its billing
currency, invoices, service limits, and account terms. Do not share payment
details in chat or commit them to this repository.
2. Deploy the existing app to a disposable staging environment from the exact
   reviewed commit. Verify the build, health endpoint, Auth0, secrets, logs,
   and production-shaped resource usage.
3. Finish the PostgreSQL runtime adapter and its integration checks first.
   Rehearse MongoDB export, ownership/history reconciliation, migration,
   backup, and restore using non-production data.
4. Validate sign-in, separate account histories, chat/AI, payment checkout and
   webhooks, Calendar, reminders, voice, export, deletion, and backup restore.
5. Compare all real bills with the under-$50 target, excluding payment
   processing, and set platform and model spend controls. Do not treat the
   published metering example as proof of the target.
6. Cut over only after explicit staging acceptance. Keep the prior Coolify
   release and MongoDB data intact through the rollback window. Retire them
   only after production checks and a successful restore drill.

Pricing and operating references checked 2026-09-23: [Railway pricing](https://railway.com/pricing),
[usage plans](https://docs.railway.com/pricing/plans),
[cost controls](https://docs.railway.com/pricing/cost-control),
[monorepo deployments](https://docs.railway.com/deployments/monorepo),
[PostgreSQL backups and restore](https://docs.railway.com/guides/postgres-backups-restores),
and [point-in-time recovery](https://docs.railway.com/volumes/point-in-time-recovery).
