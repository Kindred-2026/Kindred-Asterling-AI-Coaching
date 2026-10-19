import * as Sentry from "@sentry/react";

// Sentry stays off unless the build sets VITE_SENTRY_DSN, so local dev, tests
// and CI send nothing. The DSN is a public identifier, not a secret.
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Kindred holds private reflections, so error reports carry only what
    // Sentry needs to debug: no user details, cookies, headers, query strings,
    // or request/response bodies (which would include chat messages).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    },
    // No Session Replay: the Privacy Policy describes error reports and
    // performance timing only, and Replay would record the screen.
    integrations: [Sentry.browserTracingIntegration()],
    // A sample keeps the free plan's quota. Trace headers go only to our own
    // API (Sentry's same-origin default), never to Auth0 or other third parties.
    tracesSampleRate: 0.2,
    // Console messages can echo what someone typed, so they never become
    // breadcrumbs.
    beforeBreadcrumb: (breadcrumb) =>
      breadcrumb.category === "console" ? null : breadcrumb,
  });
}

// React 19 root error hooks; they do nothing until initSentry has run.
export const sentryRootOptions = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
