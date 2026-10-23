import { createHmac } from "node:crypto";

// Intercom Messenger for signed-in users. The server signs who the user is
// (Intercom's "Messenger API secret", HS256) so nobody can boot the Messenger
// as someone else and read their conversations. Both values come from
// Intercom > Settings > Workspace > Security > Messenger; without them the
// endpoint answers 404 and the CSP stays closed to Intercom.
export interface IntercomConfig {
  appId: string;
  secret: string;
}

export function intercomConfig(
  env: NodeJS.ProcessEnv = process.env,
): IntercomConfig | null {
  const appId = env.INTERCOM_APP_ID?.trim();
  const secret = env.INTERCOM_MESSENGER_SECRET?.trim();
  return appId && secret ? { appId, secret } : null;
}

/** Long enough for a slow page load; each Messenger boot asks for a new one. */
export const INTERCOM_JWT_TTL_SECONDS = 10 * 60;

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

export function signIntercomUserJwt(
  claims: { user_id: string; email?: string },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ ...claims, exp: nowSeconds + INTERCOM_JWT_TTL_SECONDS }),
  );
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

// Hosts Intercom lists for US-hosted workspaces:
// https://www.intercom.com/help/en/articles/3894-using-intercom-with-content-security-policy
// Keep in step with the marketing site's list in kindred-coach/scripts/prerender.mjs.
export const INTERCOM_CSP = {
  scriptSrc: [
    "https://app.intercom.io",
    "https://widget.intercom.io",
    "https://js.intercomcdn.com",
  ],
  imgSrc: ["blob:"],
  connectSrc: [
    "https://via.intercom.io",
    "https://api.intercom.io",
    "https://api-iam.intercom.io",
    "https://api-ping.intercom.io",
    "https://*.intercom-messenger.com",
    "wss://*.intercom-messenger.com",
    "https://nexus-websocket-a.intercom.io",
    "wss://nexus-websocket-a.intercom.io",
    "https://nexus-websocket-b.intercom.io",
    "wss://nexus-websocket-b.intercom.io",
    "https://uploads.intercomcdn.com",
    "https://uploads.intercomusercontent.com",
  ],
  fontSrc: ["https://js.intercomcdn.com", "https://fonts.intercomcdn.com"],
  mediaSrc: ["https://js.intercomcdn.com", "https://downloads.intercomcdn.com"],
  frameSrc: [
    "https://intercom-sheets.com",
    "https://www.intercom-reporting.com",
    "https://www.youtube.com",
    "https://player.vimeo.com",
    "https://fast.wistia.net",
  ],
  formAction: ["https://intercom.help", "https://api-iam.intercom.io"],
};
