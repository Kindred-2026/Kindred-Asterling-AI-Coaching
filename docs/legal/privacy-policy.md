# Privacy Policy

**Status:** Approved — not legal advice
**Last repository review:** August 24, 2026
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
- Optional integration data, including an encrypted Google Calendar refresh token and read-only upcoming-event information, plus reminder preferences, phone number, and time zone when those features are enabled.
- Subscription and transaction references needed to confirm access. Kindred delegates checkout and billing management to Helcim rather than storing complete payment-card details.
- Operational information such as request logs, quota usage, security events, and delivery records. The current safety-event code is designed to emit a non-identifying control event rather than message content.

## Why information is used

Kindred uses information to:

- Provide authentication, coaching conversations, assessments, habit and medication tracking, reports, reminders, calendar context, and account support.
- Personalize responses using context selected as relevant to the current interaction.
- Operate subscriptions, prevent abuse, protect accounts, troubleshoot failures, and meet legal obligations.
- Send marketing only under separate, recorded consent where required. Service messages and marketing preferences must not be bundled.

## Service providers and disclosures

The hosting provider, database provider, and AI processor must be reconciled with the live deployment before publication. The planned hosting target is DigitalOcean App Platform with managed PostgreSQL. The planned hosted AI route is Cloudflare AI Gateway to a selected upstream model provider. These are target choices and are not confirmation of a completed cutover.

The service also supports Clerk for identity, Helcim for payments, Google Calendar for optional read-only calendar access, Sentry for error and performance monitoring when enabled, Twilio for SMS, Resend for email, and ElevenLabs for voice features. Information should be sent to a provider only when its feature is enabled and needed.

> **Founder/legal confirmation required:** Before publication, confirm actual hosting and database locations, live AI model/provider and processing region, enabled optional providers, retention and training terms, subprocessors, cross-border transfers, and contractual safeguards. Remove providers not used in production.

## Google Calendar data

If a user connects Google Calendar, Kindred requests read-only access to upcoming events. Kindred stores an encrypted refresh token so the connection can continue, displays upcoming event information to the user, and may supply only a title-free schedule-density signal to the coaching AI.

Kindred's use and transfer of information received from Google APIs will comply with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. Google Calendar data is not sold, used for advertising, or used to train a general-purpose AI model.

> **Founder/legal confirmation required:** Match the app's requested OAuth scope to the least-privilege scope configured in Google Cloud. Implement and verify a calendar disconnect and token-revocation flow before promising users that they can revoke access inside Kindred.

## Consent, choices, retention, and access

Optional calendar and communication processing should require specific, informed, revocable consent. The product exposes account export and deletion routes. Production procedures must also address correction, consent withdrawal, provider-side deletion, legal holds, and verified privacy requests.

Current internal proposals retain:

- Account and wellness data for the account lifetime.
- Reminder-delivery records for 90 days.
- Backups for 35 days.
- Administrative audit records for one year.
- Billing records for up to seven years when legally required.

These periods remain proposals until business and legal review confirms them.

> **Founder/legal confirmation required:** Approve or replace each proposed retention period. Set request-verification steps, response timelines, deletion and legal-hold exceptions, and any other rules required by law.

## Security and Canadian privacy guidance

The application uses access controls, user-scoped queries, encrypted calendar tokens, no-store responses for wellness data, and security headers. No system is risk-free. Incident-response and breach-notification procedures must be confirmed before launch.

Review the [PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/) and [Canadian privacy regulators' generative-AI principles](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai).

---

## Internal Contabo vendor reference

These supplier-identification details were provided for review. They are generally more appropriate for vendor records or an imprint, if one is legally required, than for the public Privacy Policy itself:

- **Provider:** Contabo GmbH
- **Address:** Welfenstrasse 22, 81541 Munich, Germany
- **Fax:** +49 89 216 658 62
- **Email:** info@contabo.com
- **Managing directors:** Stephan Wolfram and Mario Wilhelm
- **Register court:** AG Munich
- **Register number:** HRB 180722
- **VAT ID:** DE267602842
