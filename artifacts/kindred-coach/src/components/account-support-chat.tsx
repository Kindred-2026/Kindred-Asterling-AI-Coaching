import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  IntercomMessenger,
  type IntercomUser,
} from "@/components/intercom-messenger";

interface IntercomSettingsResponse extends IntercomUser {
  appId: string;
}

// The support Messenger on the Account page, signed in as the current user. It
// stays out of the pages where people write reflections. Each visit asks the
// API for a fresh short-lived token; a 404 means support chat is not set up.
export function AccountSupportChat() {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<IntercomSettingsResponse | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/account/intercom", {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as IntercomSettingsResponse;
      if (!cancelled) setSettings(body);
    })().catch(() => {
      // Support chat is optional; the page works without it.
    });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (!settings) return null;
  return (
    <IntercomMessenger
      appId={settings.appId}
      user={{ userJwt: settings.userJwt, createdAt: settings.createdAt }}
    />
  );
}
