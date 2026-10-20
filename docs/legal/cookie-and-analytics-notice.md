# Cookie and Analytics Notice

> **Superseded working draft.** The published text is in `artifacts/kindred-coach/src/pages/public/legal.tsx` (version 1.4, effective October 20, 2026), with matching PDFs in `artifacts/kindred-coach/public/legal-documents/`. This file is kept for history; where it differs from the published text, the published text applies.

**Status:** Approved — not legal advice
**Last repository review:** October 5, 2026
**Intended users:** Adults aged 18 and older only

This draft must be reconciled with the deployed infrastructure, contracts, business practices, supported launch locations, and applicable law. Confirmation items require approval by the proprietor, an authorized adult, and qualified legal counsel before publication.

## Essential technologies

Kindred may use:

- Auth0 authentication and session technologies to keep users signed in and protect account requests.
- Browser storage for interface preferences such as theme, where supported.
- Security, load-balancing, or hosting cookies set by DigitalOcean or Cloudflare and identified in the final deployment inventory.

## Diagnostics and advertising

Kindred loads Sentry's browser SDK for error monitoring. It sends error details, performance timing and, for 10% of sessions and every session with an error, a replay of page changes with all text, inputs, images and media hidden. It keeps a session identifier in session storage and sets no advertising or tracking cookies. The SDK is configured not to send user details, cookies, headers, query strings or request bodies. Application and hosting logs may also be used to operate, secure, and troubleshoot the service.

No Google Analytics, Meta Pixel, advertising network, or similar advertising tracker was found in the reviewed repository. This notice must be updated before any such technology is enabled. Social links in the footer are ordinary outbound links; the site does not embed social feeds or pixels.

## Controls

Users can use browser controls to remove or block cookies, but blocking essential authentication storage may prevent sign-in or secure features from working.

> **Founder/legal confirmation required:** Inspect production response headers and browser storage. Identify cookie names, providers, and lifetimes; confirm Auth0, DigitalOcean, and Cloudflare behavior; and determine whether a consent manager is required in each supported launch location.
