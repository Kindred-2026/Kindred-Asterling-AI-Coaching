import type { RequestHandler } from "express";

// When the public website lives on its own domain (MARKETING_SITE_URL), this
// domain serves only the sign-in portal and the signed-in app. Marketing and
// legal pages move permanently to the marketing domain, and crawlers are told
// not to index the app.
const MARKETING_PATH =
  /^\/(?:about|science|legal|legal-documents|sitemap\.xml|llms\.txt)(?:\/|$)/;

const APP_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

export function marketingSiteOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("MARKETING_SITE_URL must be an http(s) URL");
  }
  return url.origin;
}

export function marketingSiteRedirect(marketingOrigin: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path === "/robots.txt") {
      res.type("text/plain").send(APP_ROBOTS_TXT);
      return;
    }
    if (MARKETING_PATH.test(req.path)) {
      res.redirect(301, `${marketingOrigin}${req.originalUrl}`);
      return;
    }
    next();
  };
}
