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
    integrations: [
      Sentry.browserTracingIntegration(),
      // Replays hide all text and inputs and block images, audio and video,
      // so no journal entries or chat messages leave the browser.
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 1.0,
    // Trace headers go only to our own API (Sentry's same-origin default),
    // never to Auth0 or other third parties.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

// React 19 root error hooks; they do nothing until initSentry has run.
export const sentryRootOptions = {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
};
