import { createHash } from "node:crypto";
import type { AuthIdentity } from "./auth0Identity";

export class Auth0UserinfoRequestFailed extends Error {
  readonly category = "auth0_userinfo_request_failed" as const;
  constructor() {
    super("Auth0 userinfo request failed");
    this.name = "Auth0UserinfoRequestFailed";
  }
}

export class Auth0SubjectMismatch extends Error {
  readonly category = "auth0_subject_mismatch" as const;
  constructor() {
    super("Auth0 subject mismatch");
    this.name = "Auth0SubjectMismatch";
  }
}

// Cache only verified UserInfo claims, never bearer tokens or application
// authorization. The middleware still validates every JWT and syncs each user.
export function createAuth0ProfileLoader(options: {
  issuerBaseURL: string;
  profileFetch?: typeof fetch;
  now?: () => number;
  maxEntries?: number;
}) {
  const now = options.now ?? Date.now;
  const cache = new Map<
    string,
    { expiresAt: number; value: Promise<AuthIdentity> }
  >();
  const maxEntries = options.maxEntries ?? 1000;
  return (
    token: string,
    subject: string,
    tokenExpiresAt: number,
  ): Promise<AuthIdentity> => {
    const key = createHash("sha256").update(token).digest("hex");
    const current = now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= current) cache.delete(key);
    }
    const cached = cache.get(key);
    if (cached) return cached.value;
    const value = (async () => {
      let response: Response;
      try {
        response = await (options.profileFetch ?? fetch)(
          new URL("userinfo", options.issuerBaseURL).href,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
            redirect: "error",
          },
        );
      } catch {
        throw new Auth0UserinfoRequestFailed();
      }
      if (!response.ok) throw new Auth0UserinfoRequestFailed();
      const profile = (await response.json()) as Record<string, unknown>;
      if (profile.sub !== subject) throw new Auth0SubjectMismatch();
      const string = (value: unknown) =>
        typeof value === "string" ? value : null;
      return {
        id: subject,
        email: string(profile.email),
        firstName: string(profile.given_name),
        lastName: string(profile.family_name),
        profileImageUrl: string(profile.picture),
        emailVerified: profile.email_verified === true,
      };
    })();
    while (cache.size >= maxEntries && cache.size > 0) {
      cache.delete(cache.keys().next().value!);
    }
    const entry = {
      expiresAt: Math.min(current + 60_000, tokenExpiresAt),
      value,
    };
    if (entry.expiresAt > current && maxEntries > 0) cache.set(key, entry);
    // Failures are never reused; a later request can recover from a transient
    // provider failure. Do not let an old rejection remove a replacement entry.
    void value.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    return value;
  };
}
