# Privacy, retention, and account lifecycle policy

**Production gate:** This engineering policy is not legal advice. Before launch, counsel must approve it for every jurisdiction served, including health/wellness-data, consumer-health-data, privacy, age/consent, breach-notification, tax, and payment-record rules. Record that approval and any required DPIA/PIA or consent-language changes in the release checklist.

## Data inventory, purpose, retention, and deletion

| Category | Examples | Purpose | Active retention | Account deletion |
|---|---|---|---|---|
| Identity/profile | name, email, birthday, phone, profile and onboarding text | authentication and personalization | account lifetime | delete immediately |
| Wellness/health-adjacent content | morning/evening journals, body scans, habits, medications, coaching chats | user-requested coaching features | account lifetime | delete immediately |
| Communications | reminder settings and delivery ledger | requested reminders | account lifetime; delivery ledger up to 90 days | delete immediately |
| Removed Google Calendar integration | encrypted refresh tokens saved before the integration was removed; the key is gone, so they can no longer be decrypted, used, or revoked | none | until the one-off `drop:calendar-connections` job runs (approved 2026-10-01) | delete immediately |
| Security/usage | sessions, verification tokens, daily quota | security, abuse prevention, service operation | session/token expiry; quota 30 days | delete immediately |
| Billing | subscription/customer identifiers and transaction records held by payment provider | subscription, tax, chargebacks, accounting | while active, then up to 7 years where legally required | local subscription cache is deleted; provider records are retained/anonymized only as legally required |
| Administrative audit | entitlement grants and audit events | authorization evidence, fraud/security investigation | 1 year, unless a legal hold applies | delete user-linked rows; security incident evidence may be separately preserved under documented legal hold |
| Webhook idempotency | event ID/type/time, no content | prevent replay | 30 days | not user-linked; age out automatically |

Deletion is a transaction: dependent user-owned rows cascade and the user row is removed. Data is never reassigned to another user. A verified provider webhook uses the same lifecycle service as an authenticated request. Legal holds must be documented, access-restricted, and released promptly; they are not implemented by silently retaining live profile content.

## Export and consent

Authenticated users may request `GET /account/export`. The machine-readable JSON includes their profile and all directly user-owned feature data. `DELETE /account` performs deletion and returns no body. The product must present specific, informed, revocable consent before collecting wellness data or enabling optional email or SMS processing. Store consent version, time, jurisdiction, and withdrawal; do not bundle optional processing with service terms. Product and counsel must approve the final consent UI before production.

## Subprocessors

The deployment owner must maintain and publish the actual configured list and locations. Expected categories are: hosting/database provider, Clerk (identity when enabled), payment provider, email/SMS providers, and configured AI inference providers. Contracts must cover confidentiality, security, deletion/return, breach notice, transfer mechanisms, and prohibit training on user data unless separately and explicitly consented to. Disable any unapproved integration.

## Backups

Production backups must be encrypted, access-logged, immutable against ordinary application access, and expire within **35 days**. Account deletion is immediate in the live database; deleted data may persist only in disaster-recovery backups until expiry. Restores must replay the deletion ledger before serving traffic. Backups are not used to recover individual deleted accounts.

## Incidents and rights requests

On suspected exposure: contain access, preserve minimal evidence, rotate credentials, identify affected data/users/jurisdictions, notify the privacy/security leads and counsel, document decisions, and meet applicable regulator/user deadlines. Do not put wellness content in logs or tickets. Verify identity for export/deletion/correction requests, log completion without retaining exported content, and provide an escalation/appeal channel. Test the response plan and restore/deletion procedure at least annually.
