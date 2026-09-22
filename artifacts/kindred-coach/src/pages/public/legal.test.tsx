import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AIUseDisclosure,
  CookieNotice,
  HealthDisclaimer,
  MarketingConsent,
  PrivacyPolicy,
  TermsAndConditions,
} from "./legal";

describe("approved legal documents", () => {
  it.each([
    [PrivacyPolicy, "privacy-policy.pdf", "1. Organization & Privacy Officer"],
    [
      TermsAndConditions,
      "terms-and-conditions-of-service.pdf",
      "1. Agreement to Terms & Eligibility",
    ],
    [
      HealthDisclaimer,
      "health-information-and-non-clinical-disclaimer.pdf",
      "1. Non-Medical and Non-Clinical Nature of the Service",
    ],
    [AIUseDisclosure, "ai-use-and-transparency-disclosure.pdf", "1. Scope & Purpose"],
    [CookieNotice, "cookie-and-tracking-technologies-notice.pdf", "1. Scope & Commitment"],
    [
      MarketingConsent,
      "marketing-consent-and-casl-compliance-protocol.pdf",
      "1. Statutory Background & Standards",
    ],
  ])("publishes document %# with its supplied PDF", (Component, filename, firstHeading) => {
    const html = renderToStaticMarkup(<Component />);
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.body.textContent).toContain(firstHeading);
    expect(html).toContain("Legal information");
    expect(html).toContain("Published");
    expect(html).not.toMatch(
      /Final Review Draft|Working draft|not for distribution|confirmation required/i,
    );
    expect(
      document.querySelector(`a[href="/legal-documents/${filename}"]`)?.hasAttribute("download"),
    ).toBe(true);

    const pdf = readFileSync(`${process.cwd()}/public/legal-documents/${filename}`);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
