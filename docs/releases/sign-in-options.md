# Sign-in options

Production Auth0 tenant: `dev-4c281gnuylq4hccq.ca.auth0.com`, single-page
application **Kindred-Coach** (`mKA9s0GTE78sWmtK2Ffbi7iq9hi8dsF7`). These are
public identifiers. Older documents that name `dev-rio3w0hvdl6hccn6.us.auth0.com`
describe the earlier, locally tested tenant.

## What people can use

| Method | Auth0 setup | Live result (2026-10-07) |
| - | - | - |
| Email and password | `Username-Password-Authentication`; email is the only identifier, verified with a code at sign-up | Login page offers it and sign-up created a working account; a password sign-in was not separately recorded |
| Passkey | Same database connection, `authentication_methods.passkey` | Passed: owner signed in with a passkey |
| Google | `google-oauth2` | Passed: owner signed in with Google |
| Emailed sign-in code | Passwordless `email` connection, 6-digit code valid for 180 seconds | Passed: code received and signed in |
| Sign in with Apple | Not set up | Needs a paid Apple Developer Program membership |
| Okta Personal | Removed | Not offered |

The Auth0 login page shows email and password, "Continue with a passkey" and
"Continue with Google". Universal Login only shows the passwordless `email`
connection when the app asks for it by name, so Kindred's sign-in page has a
separate **Email me a sign-in code** button that passes `connection: "email"`.

Auth0 rejected email codes on the database connection itself
(`operation_not_supported`), which is why codes use the separate connection.
The optional username and phone identifiers were removed from the database
connection because the 15-character username limit blocked passkey sign-up.

Sign-in and code emails go through the Resend email provider from
`kindred_ai_spacemail@kindred-asterling-ai-coaching.com`.

## One account per sign-in method

Kindred never links accounts by email (`artifacts/api-server/src/lib/auth0Identity.ts`).
Each Auth0 identity, such as `auth0|…`, `google-oauth2|…` or `email|…`, is a
separate Kindred user. Someone who signs in with a different method than the one
they joined with gets `409 account_link_required`, and the app tells them to
sign out and use the method they used before, or contact support.

## Changing these settings

`auth0-deploy/local/tenant.yaml` matches the live tenant for the connections
above as of 2026-10-07. Other parts of that export are older, so compare it
with the tenant before importing. When patching a connection through the
Management API, `options` replaces the whole object: read it first and send
every field back.
