import { createHmac, randomUUID } from "node:crypto";
import { logger } from "./logger";

// Server-side product analytics via Amplitude's HTTP V2 API. Events are sent
// from the api-server only, so the browser loads no analytics SDK and sets no
// cookies (the Cookie Notice promises this). Auth is the AMPLITUDE_API_KEY
// secret; without it every call is a no-op.
//
// Privacy rules for callers:
// - Event names describe an action ("Morning Check-in Completed"), never its
//   content. Never put notes, moods, medication names or chat text in
//   properties.
// - Medication and body-scan actions are not tracked at all: even the event
//   name would reveal health information.
// - The user ID sent is an HMAC of Kindred's internal ID, so Amplitude never
//   sees the real ID or email.

const API_URL = "https://api2.amplitude.com/2/httpapi";

export type AnalyticsEvent =
  | "Account Created"
  | "Morning Check-in Completed"
  | "Evening Report Completed"
  | "Habit Created"
  | "Habit Logged"
  | "Chat Message Sent";

type EventProperties = Record<string, string | number | boolean>;

export function isAnalyticsConfigured(): boolean {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return false;
  }
  return Boolean(process.env.AMPLITUDE_API_KEY?.trim());
}

/** Stable pseudonymous ID. AMPLITUDE_ID_SALT keeps IDs stable across API key rotation. */
export function pseudonymousUserId(userId: string, salt: string): string {
  return createHmac("sha256", salt).update(userId).digest("hex").slice(0, 32);
}

async function send(
  userId: string,
  eventType: AnalyticsEvent,
  properties?: EventProperties,
): Promise<void> {
  const apiKey = process.env.AMPLITUDE_API_KEY!.trim();
  const salt = process.env.AMPLITUDE_ID_SALT?.trim() || apiKey;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        events: [
          {
            user_id: pseudonymousUserId(userId, salt),
            event_type: eventType,
            time: Date.now(),
            insert_id: randomUUID(),
            platform: "Web",
            ...(properties ? { event_properties: properties } : {}),
          },
        ],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, eventType },
        "Amplitude track event failed",
      );
    }
  } catch (err) {
    logger.warn({ err, eventType }, "Amplitude track event threw");
  }
}

/**
 * Record a product event. Fire-and-forget: never throws and never delays the
 * response, so an analytics outage can't break a check-in or a chat.
 */
export function trackEvent(
  userId: string,
  eventType: AnalyticsEvent,
  properties?: EventProperties,
): void {
  if (!isAnalyticsConfigured()) return;
  void send(userId, eventType, properties);
}
