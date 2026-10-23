import { describe, expect, it } from "vitest";
import { failureDescription } from "./failure-description";

describe("failureDescription", () => {
  it.each([401, 403])("asks to sign in again for %i", (status) => {
    expect(failureDescription({ status })).toMatch(/Sign in again/);
  });

  it("asks to check the details for 400", () => {
    expect(failureDescription({ status: 400 })).toMatch(/check the details/);
  });

  it("names other status codes", () => {
    expect(failureDescription({ status: 503 })).toBe(
      "Something went wrong (error 503). Please try again.",
    );
  });

  it.each([new TypeError("Failed to fetch"), undefined, "boom"])(
    "falls back to a connection hint for %j",
    (err) => {
      expect(failureDescription(err)).toBe(
        "Something went wrong. Check your connection and try again.",
      );
    },
  );
});
