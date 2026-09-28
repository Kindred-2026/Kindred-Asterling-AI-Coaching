import helmet from "helmet";

// One year, the minimum that scanners and the HSTS preload list accept.
export const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

// Security headers — Helmet sets CSP, X-Frame-Options, HSTS, etc.
export function securityHeaders(auth0Origins: string[] = []) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...auth0Origins],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: [...auth0Origins],
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
