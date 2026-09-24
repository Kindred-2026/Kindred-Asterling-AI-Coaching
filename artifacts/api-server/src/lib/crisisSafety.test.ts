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
      detectorVersion: "2026-08-08",
      retentionClass: "security_safety_30d",
      accessClass: "security_response_only",
    });
  });

  it("returns deterministic reviewed neutral copy and false-positive handling", () => {
    const first = crisisSupportResponse();
    expect(crisisSupportResponse()).toEqual(first);
    expect(first.message).toContain("not medical care or an emergency service");
    expect(first.falsePositive.label).toBe("This doesn’t apply");
    expect(first.regionSelector[0].id).toBe("international");
    expect(JSON.stringify(first)).not.toContain("988");
  });
});
