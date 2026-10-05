# Privacy Policy

**Status:** Approved — not legal advice
**Last repository review:** October 5, 2026
**Intended users:** Adults aged 18 and older only

This draft must be reconciled with the deployed infrastructure, contracts, business practices, supported launch locations, and applicable law. Confirmation items require approval by the proprietor, an authorized adult, and qualified legal counsel before publication.

## Who is responsible

Kindred Asterling AI is operated as an Alberta sole proprietorship based in Edmonton, Alberta, Canada.

Privacy questions may be sent to [kindredaicoach@gmail.com](mailto:kindredaicoach@gmail.com). Customer-support requests may be sent to [kindred_support@kindred-asterling-ai-coaching.com](mailto:kindred_support@kindred-asterling-ai-coaching.com).

> **Founder/legal confirmation required:** An Alberta trade name is not a separate legal person. Confirm the proprietor's contracting identity and privacy-officer designation. Before publication, provide a business mailbox or registered service address instead of publishing a private residential address.

## Information Kindred handles

Kindred may handle:

- Account and identity information, including identity-provider identifiers, email, verification state, name, and profile details a user chooses to provide.
- Wellness and coaching information, including morning and evening reflections, body scans, habits, medication schedules and logs, goals, chat messages, and generated coaching replies.
- Optional feature data, including reminder preferences, phone number, and time zone when those features are enabled.
- Encrypted Google Calendar refresh tokens saved before the Calendar integration was removed (see below).
- Subscription and transaction references needed to confirm access. Kindred delegates checkout and billing management to Helcim rather than storing complete payment-card details.
- Operational information such as request logs, quota usage, security events, and delivery records. The current safety-event code is designed to emit a non-identifying control event rather than message content.

## Why information is used

Kindred uses information to:

- Provide authentication, coaching conversations, assessments, habit and medication tracking, reports, reminders, and account support.
- Personalize responses using context selected as relevant to the current interaction.
- Operate subscriptions, prevent abuse, protect accounts, troubleshoot failures, and meet legal obligations.
- Send marketing only under separate, recorded consent where required. Service messages and marketing preferences must not be bundled.

## Service providers and disclosures

The application and its Managed Postgres database run on Fly.io in Toronto (`yyz`). Since 2026-10-03 the public domain has been served by the Fly app through Cloudflare, which provides DNS, TLS, and network protection. `fly.toml` selects Anthropic's Claude models through the Anthropic API for coaching replies; requests can optionally be routed through Cloudflare AI Gateway with payload logging and caching turned off. The production cutover gates in the Fly.io runbook are still open, and the previous server and MongoDB database are kept for rollback until they close.

The service uses Auth0 for identity, Helcim for payments, Twilio for SMS, Resend for email, and ElevenLabs for voice features. Legacy Clerk identity mappings are retained only for account-history reconciliation and rollback. Information should be sent to a provider only when its feature is enabled and needed.

> **Founder/legal confirmation required:** Before publication, confirm actual hosting and database locations, live AI model/provider and processing region, enabled optional providers, retention and training terms, subprocessors, cross-border transfers, and contractual safeguards. Remove providers not used in production. The application does not include a third-party error-monitoring SDK; add one here before enabling it.

## Former Google Calendar integration

Kindred no longer connects to Google Calendar and does not request, display, or use calendar events. Accounts that connected Google Calendar before the integration was removed may still have an encrypted refresh token stored. Kindred no longer holds the key needed to decrypt these tokens, so they cannot be used to access Google data. They are deleted with the account, and the remaining tokens will be deleted from all accounts. Users can also remove Kindred's access from their Google Account's third-party connections at any time.

Kindred's use and transfer of information received from Google APIs complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. Google user data is not sold, used for advertising, or used to train a general-purpose AI model.

> **Founder/legal confirmation required:** Record the date the remaining stored tokens are deleted, then remove this section's description of stored tokens.

## Consent, choices, retention, and access

Optional communication processing should require specific, informed, revocable consent. The product exposes account export and deletion routes. Production procedures must also address correction, consent withdrawal, provider-side deletion, legal holds, and verified privacy requests.

Current internal proposals retain:

- Account and wellness data for the account lifetime.
- Reminder-delivery records for 90 days.
- Backups for 35 days.
- Administrative audit records for one year.
- Billing records for up to seven years when legally required.

These periods remain proposals until business and legal review confirms them.

> **Founder/legal confirmation required:** Approve or replace each proposed retention period. Set request-verification steps, response timelines, deletion and legal-hold exceptions, and any other rules required by law.

## Security and Canadian privacy guidance

The application uses access controls, user-scoped queries, no-store responses for wellness data, and security headers. No system is risk-free. Incident-response and breach-notification procedures must be confirmed before launch.

Review the [PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/) and [Canadian privacy regulators' generative-AI principles](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai).
