import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  failThen,
  json,
  mockExternalProviders,
  setProviderEnv,
  status,
} from "./__fixtures__/externalProviders";
import { cancelHelcimSubscription } from "./helcimClient";
import {
  deleteAuth0User,
  isAuth0ManagementConfigured,
  resetAuth0ManagementToken,
} from "./auth0Management";
import { planAmplitudeDeletion, sendAmplitudeDeletion } from "./amplitudeDeletion";
import { pseudonymousUserId } from "./analytics";
import { ProviderRequestError, retryPolicy, withRetries } from "./retry";

let restoreEnv: () => void;
let providers: ReturnType<typeof mockExternalProviders> | undefined;
const originalDelay = retryPolicy.baseDelayMs;

beforeEach(() => {
  restoreEnv = setProviderEnv();
  retryPolicy.baseDelayMs = 0;
  resetAuth0ManagementToken();
});

afterEach(() => {
  providers?.restore();
  providers = undefined;
  restoreEnv();
  retryPolicy.baseDelayMs = originalDelay;
});

describe("cancelHelcimSubscription", () => {
  it("confirms the owner, then deletes with the api-token header", async () => {
    providers = mockExternalProviders({ helcimCustomerCode: "ka_owner" });
    await expect(cancelHelcimSubscription("4321", "ka_owner")).resolves.toBe("cancelled");
    const [lookup, removal] = providers.of("helcim");
    expect(lookup).toMatchObject({
      method: "GET",
      url: "https://api.helcim.com/v2/subscriptions/4321",
    });
    expect(removal).toMatchObject({
      method: "DELETE",
      url: "https://api.helcim.com/v2/subscriptions/4321",
    });
    expect(removal!.headers["api-token"]).toBe("test-helcim-key");
    expect(removal!.headers).not.toHaveProperty("authorization");
  });

  it("never deletes a subscription that belongs to another customer", async () => {
    providers = mockExternalProviders({ helcimCustomerCode: "ka_someone" });
    await expect(cancelHelcimSubscription("4321", "ka_owner")).resolves.toBe(
      "not_customer_subscription",
    );
    expect(providers.of("helcim").map((call) => call.method)).toEqual(["GET"]);
  });

  it("checks the owner when Helcim wraps the subscription in a list", async () => {
    providers = mockExternalProviders({
      helcimLookup: () => json({ data: [{ id: 4321, customerCode: "ka_someone" }] }),
    });
    await expect(cancelHelcimSubscription("4321", "ka_owner")).resolves.toBe(
      "not_customer_subscription",
    );
  });

  it("cancels when Helcim does not report an owner", async () => {
    providers = mockExternalProviders({
      helcimLookup: () => json({ data: { id: 4321 } }),
    });
    await expect(cancelHelcimSubscription("4321", "ka_owner")).resolves.toBe("cancelled");
  });

  it("treats a subscription Helcim no longer has as already stopped", async () => {
    providers = mockExternalProviders({ helcimLookup: status(404) });
    await expect(cancelHelcimSubscription("4321", null)).resolves.toBe("already_gone");
  });

  it("marks server errors retryable and client errors final", async () => {
    providers = mockExternalProviders({ helcimDelete: status(503) });
    await expect(cancelHelcimSubscription("4321", null)).rejects.toMatchObject({
      status: 503,
      retryable: true,
    });
    providers.restore();
    providers = mockExternalProviders({ helcimDelete: status(403) });
    await expect(cancelHelcimSubscription("4321", null)).rejects.toMatchObject({
      status: 403,
      retryable: false,
    });
  });

  it("rejects a malformed subscription ID without calling Helcim", async () => {
    providers = mockExternalProviders();
    await expect(cancelHelcimSubscription("../customers/1", null)).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expect(providers.calls).toHaveLength(0);
  });
});

describe("deleteAuth0User", () => {
  it("uses a client-credentials token on the canonical tenant domain", async () => {
    providers = mockExternalProviders();
    await expect(deleteAuth0User("google-oauth2|123")).resolves.toBe("deleted");
    const [token, removal] = providers.of("auth0");
    expect(token).toMatchObject({
      method: "POST",
      url: "https://kindred-test.ca.auth0.com/oauth/token",
      body: {
        grant_type: "client_credentials",
        client_id: "mgmt-client",
        client_secret: "mgmt-secret",
        audience: "https://kindred-test.ca.auth0.com/api/v2/",
      },
    });
    expect(removal).toMatchObject({
      method: "DELETE",
      url: "https://kindred-test.ca.auth0.com/api/v2/users/google-oauth2%7C123",
    });
    expect(removal!.headers.authorization).toBe("Bearer mgmt-token");
  });

  it("reuses the cached token and refreshes it after a 401", async () => {
    providers = mockExternalProviders({
      auth0Delete: failThen(1, 401, status(204)),
    });
    await expect(withRetries(() => deleteAuth0User("auth0|a"), "test")).resolves.toBe("deleted");
    await deleteAuth0User("auth0|b");
    const tokenRequests = providers.of("auth0").filter((call) => call.url.endsWith("/oauth/token"));
    // First token, a refresh after the 401, then the cache serves auth0|b.
    expect(tokenRequests).toHaveLength(2);
  });

  it("treats an unknown Auth0 user as already deleted", async () => {
    providers = mockExternalProviders({ auth0Delete: status(404) });
    await expect(deleteAuth0User("auth0|gone")).resolves.toBe("already_gone");
  });

  it("is unconfigured without client credentials", () => {
    restoreEnv();
    restoreEnv = setProviderEnv({ AUTH0_MGMT_CLIENT_SECRET: undefined });
    expect(isAuth0ManagementConfigured()).toBe(false);
  });
});

describe("Amplitude deletion", () => {
  it("asks each project to delete the ID it received", () => {
    expect(planAmplitudeDeletion("user-1")).toEqual([
      {
        project: "product",
        apiKey: "product-key",
        secretKey: "product-secret",
        userIds: [pseudonymousUserId("user-1", "test-salt")],
      },
      {
        project: "agent",
        apiKey: "agent-key",
        secretKey: "agent-secret",
        userIds: ["user-1"],
      },
    ]);
  });

  it("sends one request when both trackers share a project", () => {
    restoreEnv();
    restoreEnv = setProviderEnv({ AMPLITUDE_AI_API_KEY: "product-key" });
    const requests = planAmplitudeDeletion("user-1");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      project: "product+agent",
      userIds: [pseudonymousUserId("user-1", "test-salt"), "user-1"],
    });
  });

  it("skips a project without its secret key", () => {
    restoreEnv();
    restoreEnv = setProviderEnv({
      AMPLITUDE_SECRET_KEY: undefined,
      AMPLITUDE_AI_SECRET_KEY: undefined,
    });
    expect(planAmplitudeDeletion("user-1")).toEqual([]);
  });

  it("posts to the User Privacy API with Basic auth", async () => {
    providers = mockExternalProviders();
    await sendAmplitudeDeletion({
      project: "agent",
      apiKey: "agent-key",
      secretKey: "agent-secret",
      userIds: ["user-1"],
    });
    const [call] = providers.of("amplitude");
    expect(call).toMatchObject({
      method: "POST",
      url: "https://amplitude.com/api/2/deletions/users",
      body: {
        user_ids: ["user-1"],
        requester: "kindred-account-deletion",
        ignore_invalid_id: "true",
      },
    });
    expect(call!.headers.authorization).toBe(
      `Basic ${Buffer.from("agent-key:agent-secret").toString("base64")}`,
    );
  });
});

describe("withRetries", () => {
  it("retries transient failures and stops on a final one", async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        if (calls < 3) throw new ProviderRequestError("busy", 503, true);
        return "ok";
      }, "test"),
    ).resolves.toBe("ok");
    expect(calls).toBe(3);

    calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw new ProviderRequestError("forbidden", 403, false);
      }, "test"),
    ).rejects.toThrow("forbidden");
    expect(calls).toBe(1);
  });

  it("gives up after the configured attempts", async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw new TypeError("fetch failed");
      }, "test"),
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(retryPolicy.attempts);
  });
});
