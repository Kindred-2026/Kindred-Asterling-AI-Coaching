# Kindred recurring cost baseline

**As of:** 2026-09-24. **Status:** planning inventory; no provider invoices or
billing dashboards were inspected. The under-$50/month target excludes Helcim
payment-processing charges and remains unverified until every applicable row
has a current bill or usage export.

| Service | Current or target purpose | Published starting estimate | Kindred actual monthly cost | Status / measurement source |
| --- | --- | ---: | ---: | --- |
| DigitalOcean App Platform | Target web/API hosting | $10.00 for the documented 1 GiB app container | Not measured | Target only; verify component size, bandwidth, and invoice |
| DigitalOcean Managed PostgreSQL | Target primary database | $15.15 for the documented 1 GiB plan | Not measured | Target only; verify storage, backup, and node configuration |
| Cloudflare AI Gateway | AI routing, metadata, rate limits | $0 for core Gateway features | Not measured | Verify plan, log retention, and any paid features |
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

The currently documented DigitalOcean starting estimates total **$25.15/month**,
leaving **$24.85** for every other included recurring service, usage, storage,
backups, and inference. This is an estimate only, not a forecast or a claim that
Kindred will meet the target. Do not retire MongoDB or Coolify based on the
target price alone.

Before cutover, fill in actual monthly totals and billing periods for every
retained service, configure model quotas and spend alerts, and record a dated
invoice/usage source. Reconcile again after 30 days on DigitalOcean and after
the rollback window closes.

Pricing references checked 2026-09-23: [DigitalOcean App Platform](https://docs.digitalocean.com/products/app-platform/details/pricing/),
[DigitalOcean Managed Databases](https://www.digitalocean.com/pricing/managed-databases),
and [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/reference/pricing/).
