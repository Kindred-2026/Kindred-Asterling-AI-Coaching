import { describe, expect, it, vi } from "vitest";
import { createAuth0ProfileLoader } from "./auth0Profile";
import { Auth0UserinfoRequestFailed, Auth0SubjectMismatch } from "./auth0Profile";

function fixture() {
  let time = 1_000_000;
  const profileFetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          sub: "auth0|one",
          email: "one@example.test",
          email_verified: true,
        }),
      ),
  );
  const load = createAuth0ProfileLoader({
    issuerBaseURL: "https://issuer.example/",
    profileFetch,
    now: () => time,
    maxEntries: 2,
  });
  return {
    load,
    profileFetch,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
describe("Auth0 UserInfo request cache", () => {
  it("shares concurrent requests for the same verified token", async () => {
    const { load, profileFetch } = fixture();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        load("test-token-one", "auth0|one", 2_000_000),
      ),
    );
    expect(profileFetch).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.id === "auth0|one" && r.emailVerified)).toBe(
      true,
    );
  });
  it("does not share profile claims across different tokens", async () => {
    const { load, profileFetch } = fixture();
    await load("test-token-one", "auth0|one", 2_000_000);
    profileFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sub: "auth0|two" })),
    );
    expect((await load("test-token-two", "auth0|two", 2_000_000)).id).toBe(
      "auth0|two",
    );
    expect(profileFetch).toHaveBeenCalledTimes(2);
  });
  it("refreshes after one minute or token expiry, whichever comes first", async () => {
    const { load, profileFetch, advance } = fixture();
    await load("test-token-one", "auth0|one", 2_000_000);
    advance(60_000);
    await load("test-token-one", "auth0|one", 2_000_000);
    await load("test-token-short", "auth0|one", 1_061_000);
    advance(1000);
    await load("test-token-short", "auth0|one", 1_061_000);
    expect(profileFetch).toHaveBeenCalledTimes(4);
  });
  it("bounds memory and fetches an evicted entry again", async () => {
    const { load, profileFetch } = fixture();
    for (const token of ["one", "two", "three", "one"])
      await load(token, "auth0|one", 2_000_000);
    expect(profileFetch).toHaveBeenCalledTimes(4);
  });
  it("does not cache failures or mismatched subjects", async () => {
    const { load, profileFetch } = fixture();
    profileFetch.mockResolvedValueOnce(new Response("", { status: 429 }));
    await expect(load("one", "auth0|one", 2_000_000)).rejects.toBeInstanceOf(
      Auth0UserinfoRequestFailed,
    );
    profileFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sub: "auth0|other" })),
    );
    await expect(load("one", "auth0|one", 2_000_000)).rejects.toBeInstanceOf(
      Auth0SubjectMismatch,
    );
    await expect(load("one", "auth0|one", 2_000_000)).resolves.toMatchObject({
      id: "auth0|one",
    });
    expect(profileFetch).toHaveBeenCalledTimes(3);
  });
  it("classifies non-2xx /userinfo response as auth0_userinfo_request_failed", async () => {
    const { load, profileFetch } = fixture();
    profileFetch.mockResolvedValueOnce(new Response("", { status: 502 }));
    try {
      await load("one", "auth0|one", 2_000_000);
    } catch (err) {
      expect(err).toBeInstanceOf(Auth0UserinfoRequestFailed);
      expect((err as Auth0UserinfoRequestFailed).category).toBe(
        "auth0_userinfo_request_failed",
      );
    }
  });
  it("classifies thrown fetch failure as auth0_userinfo_request_failed", async () => {
    const { load, profileFetch } = fixture();
    profileFetch.mockRejectedValueOnce(new Error("fetch failed"));
    try {
      await load("one", "auth0|one", 2_000_000);
    } catch (err) {
      expect(err).toBeInstanceOf(Auth0UserinfoRequestFailed);
      expect((err as Auth0UserinfoRequestFailed).category).toBe(
        "auth0_userinfo_request_failed",
      );
    }
  });
  it("classifies profile sub mismatch as auth0_subject_mismatch", async () => {
    const { load, profileFetch } = fixture();
    profileFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sub: "auth0|other" })),
    );
    try {
      await load("one", "auth0|one", 2_000_000);
    } catch (err) {
      expect(err).toBeInstanceOf(Auth0SubjectMismatch);
      expect((err as Auth0SubjectMismatch).category).toBe(
        "auth0_subject_mismatch",
      );
    }
  });
});
