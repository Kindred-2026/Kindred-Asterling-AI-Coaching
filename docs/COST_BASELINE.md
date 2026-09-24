# Kindred recurring cost baseline

**As of:** 2026-09-24. **Status:** planning inventory; no provider invoices or
billing dashboards were inspected. The under-$50/month target excludes Helcim
payment-processing charges and remains unverified until every applicable row
has a current bill or usage export.

| Service | Current or target purpose | Published starting estimate | Kindred actual monthly cost | Status / measurement source |
| --- | --- | ---: | ---: | --- |
| Fly.io app compute | Selected app/API hosting; target Toronto region `yyz` | Usage-based; not estimated until app size is selected | Not measured | User confirmed account/payment access only; no app deployed; invoice unverified |
| Fly Managed Postgres Basic | Selected primary database; target Toronto region `yyz` | $38.00/month plus $0.28/GB/month provisioned storage; CLI creation defaults to 10 GB | Not measured | Selected target; no cluster deployed; choose the initial storage size explicitly and verify backup, restore, and invoice in Fly dashboard |
| Cloudflare AI Gateway | AI routing, metadata, rate limits | $0 for core Gateway features | Not measured | Upstream inference is usage-billed; verify log retention limits and any paid features |
| OpenAI or selected Gateway upstream | Model inference | Usage-based; no Kindred estimate | Not measured | Record tokens, model, invoice, quota, and spend alert |
| Cloudflare DNS, proxy, and application security | Domain routing, TLS, edge security | Account/plan dependent | Not measured | Verify plan and any add-ons |
| Auth0 | Authentication | Account/MAU-plan dependent | Not measured | Verify tenant plan and active MAUs |
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

Fly Managed Postgres Basic starts at **$38/month plus provisioned storage**.
The Fly CLI currently defaults new clusters to 10 GB, which costs $2.80/month.
The lowest listed always-on `shared-cpu-1x` app machine with 256 MB RAM is
$2.02/month; Fly's compute price table varies by region, so confirm the `yyz`
rate before provisioning. Using that lowest listed rate, the illustrative
minimum is **$42.82/month before app memory above 256 MB,
network transfer, backups beyond included retention, model inference, and every
other retained service**. Kindred's actual memory requirement has not been
measured, and the smallest machine may not run the production app reliably. A
single additional 256 MB of machine memory raises the listed low-end machine
price to $3.32/month, putting the illustrative subtotal at $44.12 before any
Toronto adjustment. This is a floor
scenario, not a workload estimate or a claim that the under-$50 goal is
achievable. Do not retire MongoDB or Coolify based on published starting prices
alone. See [the Fly.io deployment runbook](FLY_DEPLOYMENT.md).

Before cutover, fill in actual monthly totals and billing periods for every
retained service, configure model quotas and spend alerts, and record a dated
invoice/usage source. Reconcile again after 30 days on the selected provider and after
the rollback window closes.

Pricing references checked 2026-09-24: [Fly Managed Postgres](https://docs.fly.io/mpg),
[Fly resource pricing](https://fly.io/docs/about/pricing/),
[Fly Managed Postgres creation and default storage size](https://fly.io/docs/mpg/create-and-connect/),
and [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/reference/pricing/).
