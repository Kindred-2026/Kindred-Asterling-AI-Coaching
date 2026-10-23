import helmet from "helmet";
import { INTERCOM_CSP } from "../lib/intercom";

// One year, the minimum that scanners and the HSTS preload list accept.
export const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

// Security headers — Helmet sets CSP, X-Frame-Options, HSTS, etc.
// `intercom` opens the CSP to the Intercom Messenger, only when it is configured.
export function securityHeaders(
  auth0Origins: string[] = [],
  { intercom = false }: { intercom?: boolean } = {},
) {
  const ic = intercom ? INTERCOM_CSP : null;
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No 'unsafe-inline': inline scripts are blocked to stop XSS. Put any
        // script in its own file (see kindred-coach/public/theme-init.js).
        scriptSrc: ["'self'", ...(ic?.scriptSrc ?? [])],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:", ...(ic?.imgSrc ?? [])],
        // Sentry error reports and replays from the browser.
        connectSrc: [
          "'self'",
          ...auth0Origins,
          "https://*.ingest.us.sentry.io",
          ...(ic?.connectSrc ?? []),
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", ...(ic?.fontSrc ?? [])],
        ...(ic ? { mediaSrc: ["'self'", ...ic.mediaSrc] } : {}),
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: [...auth0Origins, ...(ic?.frameSrc ?? [])],
        formAction: ["'self'", ...(ic?.formAction ?? [])],
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
