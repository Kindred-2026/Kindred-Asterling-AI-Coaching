import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({ logger: { warn: vi.fn() } }));

import { logger } from "./logger";
import {
  crisisSupportResponse,
  detectCrisis,
  emitSafetySignalEvent,
} from "./crisisSafety";

describe("crisis safety boundary", () => {
  beforeEach(() => vi.mocked(logger.warn).mockReset());

  it("detects direct safety signals but permits explicit denials", () => {
    expect(detectCrisis("I want to kill myself")).toBe(true);
    expect(detectCrisis("I'm not suicidal, just exhausted")).toBe(false);
    expect(detectCrisis("I am in a work crisis")).toBe(false);
    expect(detectCrisis("call 988 for information")).toBe(false);
  });

  it("logs an allowlisted event without message or identity data", () => {
    const secretMessage = randomBytes(24).toString("hex");
    const directIdentifier = "user_clerk_123@example.test";
    emitSafetySignalEvent();

    const serialized = JSON.stringify(vi.mocked(logger.warn).mock.calls);
    expect(serialized).not.toContain(secretMessage);
    expect(serialized).not.toContain(directIdentifier);
    expect(vi.mocked(logger.warn).mock.calls[0]?.[0]).toEqual({
      event: "safety_signal_detected",
      detectorVersion: "2026-10-16",
      retentionClass: "security_safety_30d",
      accessClass: "security_response_only",
    });
  });

  it("returns deterministic reviewed copy and false-positive handling", () => {
    const first = crisisSupportResponse();
    expect(crisisSupportResponse()).toEqual(first);
    expect(first.type).toBe("crisis_support");
    expect(first.message).toContain("not medical care or an emergency service");
    expect(first.falsePositive.label).toBe("This doesn’t apply");
    expect(first.falsePositive.instruction).toContain("rephrase");
  });

  it("lists 911, 9-8-8 for Canada and the US, and findahelpline.com elsewhere", () => {
    const { message, resources } = crisisSupportResponse();
    const byId = Object.fromEntries(resources.map((r) => [r.id, r]));

    expect(byId.emergency.contacts.map((c) => c.href)).toEqual(["tel:911"]);
    expect(byId["ca-988"].name).toBe("9-8-8 Suicide Crisis Helpline");
    expect(byId["us-988"].name).toBe("988 Suicide & Crisis Lifeline");
    for (const id of ["ca-988", "us-988"]) {
      expect(byId[id].contacts.map((c) => c.href)).toEqual([
        "tel:988",
        "sms:988",
      ]);
    }
    expect(byId.international.contacts[0].href).toBe(
      "https://findahelpline.com/",
    );

    // The stored message is the plain-text record of the same resources.
    expect(message).toContain("call 911");
    expect(message).toContain("call or text 9-8-8");
    expect(message).toContain("9-8-8 Suicide Crisis Helpline");
    expect(message).toContain("988 Suicide & Crisis Lifeline");
    expect(message).toContain("findahelpline.com");
  });
});
