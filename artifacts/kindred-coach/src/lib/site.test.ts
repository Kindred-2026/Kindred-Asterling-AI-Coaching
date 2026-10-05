import { describe, expect, it } from "vitest";
import {
  crossSiteDestination,
  isMarketingPath,
  normaliseSiteOrigin,
} from "./site";

const appOnly = { marketing: "https://www.marketing.example", app: null };
const marketingOnly = { marketing: null, app: "https://app.example" };
const single = { marketing: null, app: null };

describe("site split", () => {
  it("keeps every page on one origin when no split is configured", () => {
    for (const path of ["/", "/about", "/legal/terms", "/login", "/today"]) {
      expect(crossSiteDestination(path, "", "", single)).toBeNull();
    }
  });

  it("keeps the login portal, app, pricing and checkout return on the app domain", () => {
    for (const path of ["/", "/login", "/signup", "/pricing", "/payment-success", "/today", "/app/habits"]) {
      expect(crossSiteDestination(path, "?code=a&state=b", "", appOnly)).toBeNull();
    }
  });

  it("sends marketing and legal pages from the app domain to the marketing domain", () => {
    expect(crossSiteDestination("/about", "?x=1", "#team", appOnly)).toBe(
      "https://www.marketing.example/about?x=1#team",
    );
    expect(crossSiteDestination("/legal/privacy/", "", "", appOnly)).toBe(
      "https://www.marketing.example/legal/privacy",
    );
  });

  it("keeps marketing pages and pricing on the marketing domain", () => {
    for (const path of ["/", "/about", "/science", "/pricing", "/legal/cookies"]) {
      expect(crossSiteDestination(path, "", "", marketingOnly)).toBeNull();
    }
  });

  it("sends sign-in and app pages from the marketing domain to the app domain", () => {
    expect(
      crossSiteDestination("/login", "?returnTo=%2Fpricing", "", marketingOnly),
    ).toBe("https://app.example/login?returnTo=%2Fpricing");
    expect(crossSiteDestination("/today", "", "", marketingOnly)).toBe(
      "https://app.example/today",
    );
    expect(crossSiteDestination("/payment-success", "", "", marketingOnly)).toBe(
      "https://app.example/payment-success",
    );
  });

  it("recognises marketing paths with or without a trailing slash", () => {
    expect(isMarketingPath("/science/")).toBe(true);
    expect(isMarketingPath("/login")).toBe(false);
  });

  it("accepts only absolute http(s) origins", () => {
    expect(normaliseSiteOrigin("https://example.com/some/path")).toBe(
      "https://example.com",
    );
    expect(normaliseSiteOrigin("javascript:alert(1)")).toBeNull();
    expect(normaliseSiteOrigin("/relative")).toBeNull();
    expect(normaliseSiteOrigin(undefined)).toBeNull();
  });
});
