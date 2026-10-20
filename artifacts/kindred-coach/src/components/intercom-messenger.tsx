import { useEffect } from "react";
import { boot, Intercom, shutdown } from "@intercom/messenger-js-sdk";
import { APP_SITE_ORIGIN } from "@/lib/site";

// The Messenger runs only on the marketing-only build (VITE_APP_URL set), whose
// CSP allows Intercom (see scripts/prerender.mjs). The app domain's CSP does not,
// and signed-in pages hold private reflections, so it never loads there. It
// stays off unless the build sets VITE_INTERCOM_APP_ID, so local dev, tests and
// CI send nothing. The app ID is a public identifier, not a secret.
export const INTERCOM_APP_ID = APP_SITE_ORIGIN
  ? import.meta.env.VITE_INTERCOM_APP_ID?.trim() || null
  : null;

let widgetLoaded = false;

/** Shows the anonymous Intercom Messenger while mounted. */
export function IntercomMessenger({
  appId = INTERCOM_APP_ID,
}: {
  appId?: string | null;
}) {
  useEffect(() => {
    if (!appId) return;
    if (widgetLoaded) {
      // The widget script is already on the page; shutdown() only hid it.
      boot({ app_id: appId });
    } else {
      Intercom({ app_id: appId });
      widgetLoaded = true;
    }
    return () => shutdown();
  }, [appId]);

  return null;
}
