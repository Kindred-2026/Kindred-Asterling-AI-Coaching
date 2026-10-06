import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAnalyticsConfigured,
  pseudonymousUserId,
  trackEvent,
} from "./analytics";

describe("analytics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is off in tests even when a key is set", () => {
    vi.stubEnv("AMPLITUDE_API_KEY", "key");
    expect(isAnalyticsConfigured()).toBe(false);
  });

  it("sends nothing when not configured", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    trackEvent("user-1", "Morning Check-in Completed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never exposes the internal user ID", () => {
    const id = pseudonymousUserId("user-1", "salt");
    expect(id).not.toContain("user-1");
    expect(id).toHaveLength(32);
    expect(pseudonymousUserId("user-1", "salt")).toBe(id);
    expect(pseudonymousUserId("user-1", "other")).not.toBe(id);
  });
});
