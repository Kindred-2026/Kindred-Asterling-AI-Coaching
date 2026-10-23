import { describe, expect, it } from "vitest";
import { parseTargetDays } from "./habits";

describe("parseTargetDays", () => {
  it.each([
    ["1", 1],
    ["30", 30],
    [" 365 ", 365],
  ])("keeps %j", (raw, expected) => {
    expect(parseTargetDays(raw)).toBe(expected);
  });

  it.each(["", "0", "-5", "366", "1000", "12.5", "abc", "12abc"])(
    "falls back to 90 for %j",
    (raw) => {
      expect(parseTargetDays(raw)).toBe(90);
    },
  );
});
