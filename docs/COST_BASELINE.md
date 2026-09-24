# Kindred recurring cost baseline

**As of:** 2026-09-23. **Status:** planning inventory; no provider invoices or
billing dashboards were inspected. The under-$50/month target excludes Helcim
payment-processing charges and remains unverified until every applicable row
has a current bill or usage export.

| Service | Current or target purpose | Published starting estimate | Kindred actual monthly cost | Status / measurement source |
| --- | --- | ---: | ---: | --- |
| Railway Hobby | Recommended app/API and PostgreSQL candidate after DigitalOcean payment rejection | $5 minimum, includes $5 usage; actual services usage-metered | Not measured | Candidate only; payment acceptance, Railway region, app sizing, backup restore, and invoice remain unverified |
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

Railway's published rates make an illustrative continuously active combined
footprint of 1 vCPU and 1 GB RAM about **$30/month** for CPU and memory. Storage,
egress, inference, and other services are extra. This is not a forecast or a
claim that Kindred will meet the under-$50 target. Do not retire MongoDB or
Coolify based on this estimate alone. See [the Railway deployment candidate](RAILWAY_DEPLOYMENT.md).

Before cutover, fill in actual monthly totals and billing periods for every
retained service, configure model quotas and spend alerts, and record a dated
invoice/usage source. Reconcile again after 30 days on the selected provider and after
the rollback window closes.

Pricing references checked 2026-09-23: [Railway pricing](https://railway.com/pricing),
[Railway cost controls](https://docs.railway.com/pricing/cost-control),
and [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/reference/pricing/).
