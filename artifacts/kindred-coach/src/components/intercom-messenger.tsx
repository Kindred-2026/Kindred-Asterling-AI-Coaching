import { useEffect } from "react";
import Intercom, { boot, shutdown } from "@intercom/messenger-js-sdk";

/** Intercom workspace that answers Kindred's in-app support messages. */
export const INTERCOM_APP_ID = "ggu2qi1h";
// The SDK's default region; boot() after a shutdown needs it spelled out.
const INTERCOM_API_BASE = "https://api-iam.intercom.io";

// The messenger lives on the page, not in a component: legal pages and the app
// mount separate trees, so remember who it was last booted as.
let bootedAs: string | undefined;

/** Test hook: forget the page's messenger between renders. */
export function resetIntercomForTests() {
  bootedAs = undefined;
}

export interface IntercomUser {
  id: string;
  name: string | null;
  email: string | null;
  /** ISO timestamp of when the Kindred account was created. */
  createdAt: string;
}

/**
 * Shows the Intercom launcher. Visitors talk to Intercom anonymously; once a
 * signed-in account loads, the messenger restarts as that person so the
 * conversation is tied to their Kindred account (and dropped on sign-out).
 *
 * `ready` holds the first boot until auth has settled, so a signed-in person
 * is not first registered as an anonymous visitor.
 */
export function IntercomMessenger({
  user,
  ready = true,
}: {
  user: IntercomUser | null;
  ready?: boolean;
}) {
  const userId = user?.id;
  const name = user?.name ?? undefined;
  const email = user?.email ?? undefined;
  const createdAt = user?.createdAt;

  useEffect(() => {
    if (!ready) return;
    const settings = {
      app_id: INTERCOM_APP_ID,
      ...(userId && createdAt
        ? {
            user_id: userId,
            name,
            email,
            // Intercom expects Unix time in seconds.
            created_at: Math.floor(new Date(createdAt).getTime() / 1000),
          }
        : {}),
    };
    const identity = JSON.stringify(settings);
    if (identity === bootedAs) return;
    const firstBoot = bootedAs === undefined;
    bootedAs = identity;
    if (firstBoot) {
      Intercom(settings);
      return;
    }
    // Switching between visitor and account (or account to account) must not
    // carry the previous person's conversations over.
    shutdown();
    boot({ ...settings, api_base: INTERCOM_API_BASE });
  }, [ready, userId, name, email, createdAt]);

  return null;
}
