import helmet from "helmet";

// One year, the minimum that scanners and the HSTS preload list accept.
export const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

// Intercom Messenger (US region), from
// https://www.intercom.com/help/en/articles/3894-using-intercom-with-content-security-policy
// Keep in sync with kindred-coach/scripts/prerender.mjs.
export const INTERCOM_CSP = {
  scriptSrc: [
    "https://app.intercom.io",
    "https://widget.intercom.io",
    "https://js.intercomcdn.com",
  ],
  connectSrc: [
    "https://via.intercom.io",
    "https://api.intercom.io",
    "https://api-iam.intercom.io",
    "https://api-ping.intercom.io",
    "https://*.intercom-messenger.com",
    "wss://*.intercom-messenger.com",
    "https://nexus-websocket-a.intercom.io",
    "wss://nexus-websocket-a.intercom.io",
    "https://nexus-websocket-b.intercom.io",
    "wss://nexus-websocket-b.intercom.io",
    "https://uploads.intercomcdn.com",
    "https://uploads.intercomusercontent.com",
  ],
  frameSrc: [
    "https://intercom-sheets.com",
    "https://www.intercom-reporting.com",
    "https://www.youtube.com",
    "https://player.vimeo.com",
    "https://fast.wistia.net",
  ],
  fontSrc: ["https://js.intercomcdn.com", "https://fonts.intercomcdn.com"],
  formAction: ["https://intercom.help", "https://api-iam.intercom.io"],
  mediaSrc: ["https://js.intercomcdn.com", "https://downloads.intercomcdn.com"],
};

// Security headers — Helmet sets CSP, X-Frame-Options, HSTS, etc.
export function securityHeaders(auth0Origins: string[] = []) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline': inline scripts are blocked to stop XSS. Put any
        // script in its own file (see kindred-coach/public/theme-init.js).
        scriptSrc: ["'self'", ...INTERCOM_CSP.scriptSrc],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        // Intercom renders blob: previews of attachments.
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        // Sentry error reports and replays from the browser.
        connectSrc: [
          "'self'",
          ...auth0Origins,
          "https://*.ingest.us.sentry.io",
          ...INTERCOM_CSP.connectSrc,
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", ...INTERCOM_CSP.fontSrc],
        formAction: ["'self'", ...INTERCOM_CSP.formAction],
        mediaSrc: ["'self'", ...INTERCOM_CSP.mediaSrc],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: [...auth0Origins, ...INTERCOM_CSP.frameSrc],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow audio/TTS resources
    // Set HSTS explicitly so browsers only use HTTPS for a year. Cloudflare's
    // own HSTS setting overrides this header; see docs/CLOUDFLARE_SETUP.md.
    strictTransportSecurity: {
      maxAge: HSTS_MAX_AGE_SECONDS,
      includeSubDomains: true,
    },
  });
}
