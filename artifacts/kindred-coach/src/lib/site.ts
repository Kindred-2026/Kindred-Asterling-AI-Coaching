// Kindred can run as one site, or split across two domains:
//
// - The app domain (VITE_MARKETING_SITE_URL set) is only the sign-in portal and
//   the signed-in app. Its root path is the login page, and marketing and legal
//   pages send visitors to the marketing domain.
// - The marketing domain (VITE_APP_URL set) is only the public website. Sign-in,
//   sign-up, checkout and signed-in pages send visitors to the app domain.
//
// With neither set, every page is served from the same origin as before.

/** Paths that belong to the public marketing website. */
const MARKETING_PATHS = new Set([
  "/",
  "/about",
  "/science",
  "/legal/privacy",
  "/legal/terms",
  "/legal/health-disclaimer",
  "/legal/ai-disclosure",
  "/legal/cookies",
  "/legal/marketing-consent",
]);

/** Normalise an optional absolute https/http origin; anything else is ignored. */
export function normaliseSiteOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const MARKETING_SITE_ORIGIN = normaliseSiteOrigin(
  import.meta.env.VITE_MARKETING_SITE_URL,
);
export const APP_SITE_ORIGIN = normaliseSiteOrigin(import.meta.env.VITE_APP_URL);

function stripTrailingSlash(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.has(stripTrailingSlash(pathname));
}

/**
 * Where a request for `pathname` should go instead of rendering here, or null
 * to render it on this origin. `/` stays on the app domain because it is the
 * login portal there.
 */
export function crossSiteDestination(
  pathname: string,
  search: string,
  hash: string,
  origins: { marketing: string | null; app: string | null } = {
    marketing: MARKETING_SITE_ORIGIN,
    app: APP_SITE_ORIGIN,
  },
): string | null {
  const path = stripTrailingSlash(pathname);
  if (origins.marketing && path !== "/" && isMarketingPath(path)) {
    return `${origins.marketing}${path}${search}${hash}`;
  }
  if (origins.app && !isMarketingPath(path) && path !== "/pricing") {
    return `${origins.app}${path}${search}${hash}`;
  }
  return null;
}

/** Link to a marketing page, absolute when the marketing site is elsewhere. */
export function marketingHref(path: string): string {
  return MARKETING_SITE_ORIGIN ? `${MARKETING_SITE_ORIGIN}${path}` : path;
}

/** Link to an app page, absolute when the app is on another domain. */
export function appHref(path: string): string {
  return APP_SITE_ORIGIN ? `${APP_SITE_ORIGIN}${path}` : path;
}
