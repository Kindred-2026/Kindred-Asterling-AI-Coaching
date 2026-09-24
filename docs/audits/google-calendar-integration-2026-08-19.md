# Google Calendar Integration Audit

Audit date: 2026-08-19

## Conclusion

The integration is implemented across the frontend, API, database, and tests. The immediate local/deployment blocker is configuration: no Google Calendar variable is loaded in the audited shell, the checked-in environment example contains names but no values, and the 1Password environment template does not currently declare the Calendar credentials. Google Cloud project state cannot be verified from this repository.

This is not primarily a missing-frontend or missing-backend problem.

## Implemented

- Calendar page and dashboard display use the generated upcoming-events API client.
- Authenticated API routes expose connection status, OAuth start, callback, and upcoming events.
- OAuth requests use Google's read-only Calendar scope, offline access, a signed state value, and a ten-minute state expiry.
- The authorization code is exchanged server-side. Only the refresh token is persisted, encrypted with AES-256-GCM under a derived server key.
- Access tokens are refreshed when events are requested rather than persisted.
- Calendar connections are user-scoped and cascade on account deletion.
- The Google primary-calendar API request filters cancelled events, bounds the result to 50 items, and normalizes all-day and timed events.
- HTTP tests cover authentication, missing connection, connected success, and upstream failure for the upcoming-events route.

## Configuration required before connection can work

All of the following must be supplied to the API runtime:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `CALENDAR_OAUTH_STATE_SECRET`
- `CALENDAR_TOKEN_ENCRYPTION_KEY`
- `APP_PUBLIC_URL` in production

`GOOGLE_CALENDAR_REDIRECT_URI` must be the deployed absolute HTTPS URL ending in `/api/calendar/callback`; the same value must be registered exactly in the Google Cloud OAuth client. Runtime validation now rejects relative, non-HTTPS production, and wrong-path callback values.

The Google Cloud project must also have the Calendar API enabled, an OAuth consent screen configured, the correct application publishing/test-user status, and the exact redirect origin/URI registered. Those settings are external and were not verifiable during this audit.

## Correctness and reliability gaps

1. The status request and connect navigation are plain browser requests. Other API calls deliberately attach a Clerk bearer token through the generated client. Status/connect therefore depend on deployed Clerk cookie behavior and need an authenticated end-to-end deployment test.
2. There is no disconnect route or UI, Google token revocation call, or explicit consent-withdrawal flow. Account deletion removes the local token, but a user cannot independently disconnect Calendar.
3. A revoked/expired refresh token is surfaced as a generic upstream error. The UI cannot distinguish reconnect-required from a temporary Google failure.
4. OAuth state is signed and expiring but not stored for one-time consumption, and the flow does not use PKCE. Counsel/security should decide the required OAuth hardening level for the deployment.
5. Timed events are formatted in the API server's timezone. A user in another timezone can see a shifted date/time. The profile stores a timezone for reminders, but Calendar normalization does not use it.
6. The event API caps results at 50 and does not follow pagination. Very dense calendars may be truncated, so a derived load signal can undercount.
7. Tests do not cover OAuth URL/state validation, callback success/failure, token encryption round-trips, refresh-token failures, disconnect behavior, timezone conversion, or pagination.

## Context-system use

The new Kindred context assembler reuses the existing event fetch only when a message is schedule/load relevant and Calendar is configured and connected. It derives counts by day and does not pass event titles into the AI context. The resulting open/light/moderate/high scheduling signal is explicitly labeled as planning context, not a medical or psychological assessment.

## Recommended completion order

1. Configure the API runtime and Google Cloud OAuth client; run a real connection test at the deployed origin.
2. Align status/connect authentication with the Clerk bearer-token strategy and add an end-to-end test.
3. Add disconnect/revocation and reconnect-required states.
4. Normalize using the user's IANA timezone and test date boundaries.
5. Add pagination and the missing OAuth/token tests.

## Follow-up configuration check — 2026-09-24

The tracked `.env.1password` now declares the Calendar configuration names:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`,
`CALENDAR_OAUTH_STATE_SECRET`, and `CALENDAR_TOKEN_ENCRYPTION_KEY`. The
secret-valued entries are unresolved `op://` references; no vault values were
read. This supersedes the earlier template-missing observation only. The
referenced 1Password items, Google Cloud OAuth client, and deployed runtime
configuration remain unverified.
