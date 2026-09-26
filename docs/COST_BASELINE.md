# Kindred recurring cost baseline

**As of:** 2026-09-26. **Status:** partial provider verification; Auth0 plan and
quota dashboards were inspected, but no provider invoices were verified. The under-$50/month target excludes Helcim
payment-processing charges and remains unverified until every applicable row
has a current bill or usage export.

| Service | Current or target purpose | Published starting estimate | Kindred actual monthly cost | Status / measurement source |
| --- | --- | ---: | ---: | --- |
| Fly.io app compute | Selected app/API hosting; one staging machine running | About $5.92/month for one always-on shared-cpu-1x machine with 1 GB RAM at the current reference rate; regional price must be confirmed | Not measured; compute started | App `kindred-asterling-ai-coaching` release v1 runs one 1024 MB machine in `yyz`; no invoice inspected |
| Fly Managed Postgres Basic | Staging primary database in Toronto (`yyz`); attached and serving the app | $38.00/month plus $0.28/GB/month for v2 storage used; latest status reported 2.95 GB, about $0.83/month if usage stays level | Not measured; resource is provisioned and billable | Cluster `kindred-staging-db-20260924` has one replica; 20 GB provisioned capacity; synthetic migration/restore passed, production-like rehearsal and invoice remain pending |
| Cloudflare AI Gateway | AI routing, metadata, rate limits, and spend controls | $0 for core Gateway features | Not measured | Upstream inference is usage-billed. Log cost/retention depends on when the account created its first Gateway; verify the account's applicable plan and configured limits |
| OpenAI or selected Gateway upstream | Model inference | Usage-based; no Kindred estimate | Not measured | Record tokens, model, invoice, quota, and spend alert |
| Cloudflare DNS, proxy, and application security | Domain routing, TLS, edge security | Account/plan dependent | Not measured | Verify plan and any add-ons |
| Auth0 | Authentication | Dashboard shows Free, $0/month | Invoice not verified | September dashboard showed 4 external active users and 9/1000 M2M uses. Always-required MFA includes OTP and recovery codes labeled Pro, and email labeled Enterprise; quota warning reports use of features outside the Free plan. Resolve entitlement/security choice before claiming sustainable $0 cost; no plan or MFA changes made |
| MongoDB Atlas | Current database until cutover | Account/cluster dependent | Not measured | Verify invoice and storage/backup/egress before retirement |
| Coolify host / VPS | Current deployment and rollback window | Host/plan dependent | Not measured | Verify current host charge; retain through rollback window |
| Resend | Transactional email | Plan/volume dependent | Not measured | Verify monthly plan and email volume |
| Sentry | Error monitoring | Plan/event-volume dependent | Not measured | Verify projects, event volume, and retention |
| Twilio | Optional SMS reminders | Usage-based | Not measured | Verify active sender, message volume, and account fees |
| ElevenLabs | Optional voice feature | Plan/usage dependent | Not measured | Verify active use, plan, and generated minutes |
| Domain registration and DNS add-ons | Public access | Renewal/plan dependent | Not measured | Convert annual invoice to monthly equivalent |
| Database backups, object storage, and egress | Retention and recovery | Configuration/usage dependent | Not measured | Include encrypted rollback backup storage and transfer |
| GitHub Actions, Snyk, and OpenCode | CI/security automation | Account/usage dependent | Not measured | Verify included minutes and any paid subscriptions |
| Helcim payment-processing fees | Payment processing | Excluded from the $50 target | Not measured | Track separately; include any non-processing subscription fee |

Fly Managed Postgres Basic is **$38/month plus storage usage**. The current
v2 cluster status reported 20 GB provisioned capacity and 2.95 GB used; Fly's
v2 pricing is based on storage used, not provisioned capacity. At $0.28/GB per
30-day month, that is about $0.83/month while usage stays level. Kindred's
reminder scheduler must run continuously until it is moved to durable external
work, so the app estimate uses an always-on machine rather than scale-to-zero.
A 1 GB shared-cpu-1x machine is listed at about $5.92/month at the current
reference rate; the actual `yyz` price remains unverified. Staging currently
runs with 1 GB; broader workload sizing remains unverified. This scenario totals about **$44.75/month** for app plus database
at the observed storage use, before network transfer, other providers, AI
inference, backups beyond included retention, and remaining services. It leaves
about $5.25 under the $50 target for those costs, and is not supported by
measured bills.

**Caveat:** The Fly MPG docs confirm automatic backups/recovery, HA/failover,
and connection pooling are included, but state that security patches and
version upgrades are still under development. Before production selection or
cutover, confirm the operator, patch/upgrade procedure, and a successful
restore test. Cloudflare currently
prices core AI Gateway features at $0, but inference is billed by the upstream
provider. For accounts whose first Gateway is created on or after 2026-09-24,
Gateway logs follow Workers Logs pricing: Workers Free includes 200,000 log
events per day with 3-day retention; Workers Paid includes 20 million events
per month with 7-day retention, then $0.60 per additional million. Confirm the
first-Gateway date and plan before estimating log costs. The API disables
conversation payload collection and response caching, but metadata/usage logs
may remain subject to the Gateway's log policy. Gateway spend limits can enforce
a budget and reject later requests with HTTP 429, but enforcement is eventually
consistent and cost estimates depend on published model pricing; retain the
application's daily quota and provider-side budget alerts as additional controls.
The smaller
256 MB machine estimate would lower the subtotal but has not been shown to run
Kindred reliably. Do not retire MongoDB or Coolify from list prices alone. See
[the Fly.io deployment runbook](FLY_DEPLOYMENT.md).

Before cutover, fill in actual monthly totals and billing periods for every
retained service, configure model quotas and spend alerts, and record a dated
invoice/usage source. Reconcile again after 30 days on the selected provider and after
the rollback window closes.

Pricing references checked 2026-09-26: [Fly Managed Postgres plans, v2 storage pricing, and storage behavior](https://docs.fly.io/postgres),
[Fly resource pricing](https://docs.fly.io/about/pricing/),
[Fly Managed Postgres creation and default storage size](https://fly.io/docs/mpg/create-and-connect/),
Cloudflare [AI Gateway pricing and logging](https://developers.cloudflare.com/ai-gateway/reference/pricing/),
and [AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/).
