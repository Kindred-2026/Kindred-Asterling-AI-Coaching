import { ProviderRequestError, providerHttpError } from "./retry";

// Auth0 Management API access for account deletion. The machine-to-machine
// application needs only the `delete:users` scope. The Management API answers
// on the tenant's canonical domain (for example tenant.ca.auth0.com), not on a
// custom sign-in domain, so AUTH0_MGMT_DOMAIN overrides AUTH0_DOMAIN here.

let cachedToken: { value: string; expiresAt: number } | null = null;

function managementDomain(): string | null {
  const raw = (process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN)?.trim();
  return raw ? raw.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null;
}

export function isAuth0ManagementConfigured(): boolean {
  return Boolean(
    managementDomain() &&
    process.env.AUTH0_MGMT_CLIENT_ID?.trim() &&
    process.env.AUTH0_MGMT_CLIENT_SECRET?.trim(),
  );
}

/** Test hook: forget the cached Management API token. */
export function resetAuth0ManagementToken(): void {
  cachedToken = null;
}

async function managementToken(domain: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.AUTH0_MGMT_CLIENT_ID!.trim(),
      client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET!.trim(),
      audience: `https://${domain}/api/v2/`,
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw providerHttpError("Auth0 Management API token request", response.status);
  const json = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof json.access_token !== "string") {
    throw new ProviderRequestError(
      "Auth0 Management API token response had no access token",
      null,
      false,
    );
  }
  const lifetimeSeconds = typeof json.expires_in === "number" ? json.expires_in : 3600;
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + lifetimeSeconds * 1000,
  };
  return cachedToken.value;
}

/** Deletes the Auth0 user. A user Auth0 no longer has counts as deleted. */
export async function deleteAuth0User(auth0UserId: string): Promise<"deleted" | "already_gone"> {
  const domain = managementDomain();
  if (!domain || !isAuth0ManagementConfigured()) {
    throw new ProviderRequestError("Auth0 Management API is not configured", null, false);
  }
  const token = await managementToken(domain);
  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    },
  );
  if (response.status === 401) {
    // A revoked or rotated token: fetch a fresh one on the next attempt.
    cachedToken = null;
    throw new ProviderRequestError("Auth0 Management API rejected the token (401)", 401, true);
  }
  if (response.status === 404) return "already_gone";
  if (!response.ok) throw providerHttpError("Auth0 user deletion", response.status);
  return "deleted";
}
