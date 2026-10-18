import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

// Loaded before the app with `node --import ./dist/instrument.mjs` so Sentry
// can hook into Node first. Sentry stays off unless SENTRY_DSN is set, so
// local dev, tests and CI send nothing.
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    integrations: [nodeProfilingIntegration()],
    // Kindred holds private reflections, so error reports carry only what
    // Sentry needs to debug: no user details, cookies, headers, query strings,
    // request/response bodies, database values, AI prompts or replies, or
    // local variables (any of which could contain a user's messages).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // A sample keeps the free plan's quota.
    tracesSampleRate: 0.2,
    profileSessionSampleRate: 0.2,
    profileLifecycle: "trace",
    // Console messages can echo request data, so they never become
    // breadcrumbs.
    beforeBreadcrumb: (breadcrumb) =>
      breadcrumb.category === "console" ? null : breadcrumb,
  });
}
