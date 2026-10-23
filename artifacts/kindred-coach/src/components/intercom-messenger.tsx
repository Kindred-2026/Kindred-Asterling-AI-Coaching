import { useEffect } from "react";
import { boot, Intercom, shutdown } from "@intercom/messenger-js-sdk";
import { APP_SITE_ORIGIN } from "@/lib/site";

// Visitors: the anonymous Messenger runs only on the marketing-only build
// (VITE_APP_URL set), whose CSP allows Intercom (see scripts/prerender.mjs). It
// stays off unless the build sets VITE_INTERCOM_APP_ID, so local dev, tests and
// CI send nothing. The app ID is a public identifier, not a secret.
//
// Signed-in users: the Account page boots it with a token the API signs (see
// AccountSupportChat); the app domain's CSP allows Intercom only when the
// server is configured for it.
export const INTERCOM_APP_ID = APP_SITE_ORIGIN
  ? import.meta.env.VITE_INTERCOM_APP_ID?.trim() || null
  : null;

let widgetLoaded = false;

export interface IntercomUser {
  userJwt: string;
  createdAt: number;
}

/** Shows the Intercom Messenger while mounted, as a visitor or as `user`. */
export function IntercomMessenger({
  appId = INTERCOM_APP_ID,
  user,
}: {
  appId?: string | null;
  user?: IntercomUser;
}) {
  const userJwt = user?.userJwt;
  const createdAt = user?.createdAt;

  useEffect(() => {
    if (!appId) return;
    // Who the user is (ID, email, name) travels only inside the signed token.
    const settings = {
      app_id: appId,
      ...(userJwt ? { intercom_user_jwt: userJwt, created_at: createdAt } : {}),
    };
    if (widgetLoaded) {
      // The widget script is already on the page; shutdown() only hid it.
      boot(settings);
    } else {
      Intercom(settings);
      widgetLoaded = true;
    }
    return () => shutdown();
  }, [appId, userJwt, createdAt]);

  return null;
}

/** Ends the Intercom session and its cookie, if the Messenger ran on this page. */
export function shutdownIntercom(): void {
  if (widgetLoaded) shutdown();
}
