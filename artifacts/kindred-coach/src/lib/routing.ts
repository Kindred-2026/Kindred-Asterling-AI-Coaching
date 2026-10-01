// Same-origin redirect helpers shared by the signed-out auth flow and the
// pricing → login → checkout flow.
//
// These are deliberately pure (no `window`/`document` access) so they can be
// unit-tested without a browser environment and remain SSR-safe.

export const DEFAULT_APP_PATH = "/today";

/** Site-relative paths shared by the router, navigation and static metadata. */
export const PRIMARY_PAGES: Record<string, string> = {
  "/today": "Today",
  "/talk": "Talk",
  "/insights": "Insights",
  "/you": "You",
};
export const SECONDARY_PAGES: Record<string, string> = {
  "/app/morning": "Morning",
  "/app/scans": "Scans",
  "/app/evening": "Evening",
  "/app/habits": "Habits",
  "/app/medications": "Medications",
  "/app/reminders": "Reminders",
  "/app/account": "Account security",
  "/app/archive": "Archive",
  "/app/admin/beta": "Beta administration",
  "/app/session-tasks/choose-organization": "Choose organization",
  "/app/session-tasks/reset-password": "Reset password",
  "/app/session-tasks/setup-mfa": "Set up MFA",
};
export const LEGACY_PRIMARY_ROUTE_REDIRECTS: Record<string, string> = {
  "/app": "/today",
  "/app/chat": "/talk",
  "/app/reports": "/insights",
  "/app/profile": "/you",
  "/app/today": "/today",
  "/app/talk": "/talk",
  "/app/insights": "/insights",
  "/app/you": "/you",
};

// Match /app at a segment boundary without creating a nested router base.
export const PRIVATE_ROUTE_PATTERN =
  /^\/(?:today|talk|insights|you|app(?:\/.*)?)\/?$/;

export function signedInPage(pathname: string) {
  const path = canonicalPathname(pathname);
  const canonicalPath = LEGACY_PRIMARY_ROUTE_REDIRECTS[path] ?? path;
  const title = PRIMARY_PAGES[canonicalPath] ?? SECONDARY_PAGES[canonicalPath];
  return title ? { canonicalPath, title } : null;
}
const DEFAULT_PRICING_PATH = "/pricing";

/**
 * Keep client-side route matching stable when the static file server resolves
 * prerendered directories with a trailing slash. The root path is already
 * canonical and must stay `/`.
 */
export function canonicalPathname(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * A post-login destination is only trusted when it is a clean, absolute path
 * *within this site*. Anything that could take the browser off-site — a full
 * URL, a scheme-relative `//host`, a `javascript:`/`data:` scheme, backslashes,
 * or embedded CR/LF used for header/redirect smuggling — is rejected so the
 * caller can fall back to a safe default.
 */
export function isSafeReturnDestination(
  value: string | null | undefined,
): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (/[\r\n]/.test(value)) return false;
  return true;
}

/**
 * Resolve a `returnTo` query value into a destination path we are willing to
 * navigate to after sign-in. Unsafe or missing values collapse to `fallback`.
 */
export function resolveReturnDestination(
  raw: string | null | undefined,
  fallback: string = DEFAULT_APP_PATH,
): string {
  return isSafeReturnDestination(raw) ? raw : fallback;
}

/**
 * Build the public `/login` URL that a signed-out visitor is routed through,
 * carrying an encoded return destination so they land back where they came
 * from (e.g. `/pricing` → `/login?returnTo=%2Fpricing`). The destination is
 * validated first — unsafe values collapse to `/today`.
 */
export function buildLoginUrl(returnTo: string | null | undefined): string {
  const destination = resolveReturnDestination(returnTo);
  return `/login?returnTo=${encodeURIComponent(destination)}`;
}

/** Default return destination used by the pricing checkout CTA. */
export const PRICING_RETURN_PATH = DEFAULT_PRICING_PATH;

/** Preserve a full site-relative destination, including its query and fragment. */
export function protectedDestination(path: string | undefined): string {
  return resolveReturnDestination(path);
}

/** Public login URL for either a canonical or legacy signed-in deep link. */
export function protectedRouteLoginTarget(path: string | undefined): string {
  return buildLoginUrl(protectedDestination(path));
}
