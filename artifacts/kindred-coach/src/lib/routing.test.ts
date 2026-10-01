import { describe, expect, it } from "vitest";
import {
  canonicalPathname,
  isSafeReturnDestination,
  resolveReturnDestination,
  buildLoginUrl,
  protectedDestination,
  protectedRouteLoginTarget,
  PRICING_RETURN_PATH,
} from "./routing";

// Pure unit tests for the same-origin return-destination helpers. No DOM,
// router, or browser environment is involved — these assertions describe the
// exact strings the signed-out auth flow and the pricing checkout CTA produce.

describe("canonicalPathname", () => {
  it("removes trailing slashes from public and protected routes", () => {
    expect(canonicalPathname("/legal/privacy/")).toBe("/legal/privacy");
    expect(canonicalPathname("/legal/terms///")).toBe("/legal/terms");
    expect(canonicalPathname("/app/reminders/")).toBe("/app/reminders");
  });

  it("preserves the root and already-canonical paths", () => {
    expect(canonicalPathname("/")).toBe("/");
    expect(canonicalPathname("/legal/privacy")).toBe("/legal/privacy");
  });
});

describe("isSafeReturnDestination", () => {
  it("accepts clean same-origin absolute paths", () => {
    expect(isSafeReturnDestination("/pricing")).toBe(true);
    expect(isSafeReturnDestination("/app/morning")).toBe(true);
    expect(isSafeReturnDestination("/app")).toBe(true);
  });

  it("rejects full external URLs", () => {
    expect(isSafeReturnDestination("https://evil.example.com/pricing")).toBe(
      false,
    );
    expect(isSafeReturnDestination("http://evil.example.com")).toBe(false);
  });

  it("rejects scheme-relative URLs", () => {
    expect(isSafeReturnDestination("//evil.example.com")).toBe(false);
  });

  it("rejects javascript/data schemes and backslashes/control chars", () => {
    expect(isSafeReturnDestination("javascript:alert(1)")).toBe(false);
    expect(isSafeReturnDestination("data:text/html,<script>")).toBe(false);
    expect(isSafeReturnDestination("/pricing\\evil")).toBe(false);
    expect(
      isSafeReturnDestination("/pricing\r\nLocation:https://evil.com"),
    ).toBe(false);
  });

  it("rejects missing, empty, or non-path values", () => {
    expect(isSafeReturnDestination(null)).toBe(false);
    expect(isSafeReturnDestination(undefined)).toBe(false);
    expect(isSafeReturnDestination("")).toBe(false);
    expect(isSafeReturnDestination("pricing")).toBe(false);
  });
});

describe("resolveReturnDestination", () => {
  it("falls back to canonical /today when no safe destination is supplied", () => {
    expect(resolveReturnDestination(null)).toBe("/today");
    expect(resolveReturnDestination("https://evil.example.com")).toBe("/today");
    expect(resolveReturnDestination("//evil.example.com")).toBe("/today");
  });

  it("preserves a validated same-origin return destination", () => {
    expect(resolveReturnDestination("/pricing")).toBe("/pricing");
    expect(resolveReturnDestination("/app/morning")).toBe("/app/morning");
  });

  it("honours a custom fallback", () => {
    expect(
      resolveReturnDestination("https://evil.example.com", "/pricing"),
    ).toBe("/pricing");
  });
});

describe("buildLoginUrl", () => {
  it("builds the public /login URL with an encoded return destination", () => {
    expect(buildLoginUrl("/pricing")).toBe("/login?returnTo=%2Fpricing");
  });

  it("keeps the target on the public /login route (not /app/login)", () => {
    const url = buildLoginUrl("/today");
    expect(url.startsWith("/login?")).toBe(true);
    expect(url).not.toMatch(/^\/app\/login/);
  });

  it("rejects an external return destination and falls back to /today", () => {
    expect(buildLoginUrl("https://evil.example.com/pricing")).toBe(
      "/login?returnTo=%2Ftoday",
    );
    expect(buildLoginUrl("//evil.example.com")).toBe(
      "/login?returnTo=%2Ftoday",
    );
  });
});

describe("protected destinations", () => {
  it.each([
    "/today",
    "/talk?session=abc#reply",
    "/insights",
    "/you",
    "/app",
    "/app/chat?session=abc#reply",
    "/app/reminders?filter=today",
    "/app/account#security",
  ])("preserves %s through login", (path) => {
    expect(protectedDestination(path)).toBe(path);
    expect(protectedRouteLoginTarget(path)).toBe(
      `/login?returnTo=${encodeURIComponent(path)}`,
    );
  });

  it("defaults missing destinations to Today", () => {
    expect(protectedDestination(undefined)).toBe("/today");
    expect(protectedRouteLoginTarget(undefined)).toBe(
      "/login?returnTo=%2Ftoday",
    );
  });
});

describe("pricing to login", () => {
  it("routes a signed-out pricing CTA through login and back to pricing", () => {
    const target = buildLoginUrl(PRICING_RETURN_PATH);
    expect(target).toBe("/login?returnTo=%2Fpricing");
    expect(
      resolveReturnDestination(
        new URLSearchParams(target.split("?")[1]).get("returnTo"),
      ),
    ).toBe("/pricing");
  });
});
