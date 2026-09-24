import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkAndIncrementDailyQuota,
  refundDailyQuota,
  getDailyLimit,
} from "./dailyQuota";
import { logger } from "./logger";

const { incrementDailyUsage, refundDailyUsage } = vi.hoisted(() => ({
  incrementDailyUsage: vi.fn(),
  refundDailyUsage: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { incrementDailyUsage, refundDailyUsage },
}));

vi.mock("./logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("dailyQuota", () => {
  const userId = "test-user-123";
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getDailyLimit", () => {
    it("returns default limit when env var is not set", () => {
      delete process.env.DAILY_CHAT_LIMIT;
      expect(getDailyLimit()).toBe(100);
    });

    it("returns configured limit from env var", () => {
      process.env.DAILY_CHAT_LIMIT = "50";
      expect(getDailyLimit()).toBe(50);
    });

    it("returns default limit if env var is not a valid number", () => {
      process.env.DAILY_CHAT_LIMIT = "invalid";
      expect(getDailyLimit()).toBe(100);
    });
  });

  describe("checkAndIncrementDailyQuota", () => {
    it("returns allowed true when count is within limit", async () => {
      incrementDailyUsage.mockResolvedValueOnce(1);

      const result = await checkAndIncrementDailyQuota(userId);
      expect(result).toEqual({ allowed: true, remaining: 99 });
    });

    it("returns allowed false when the atomic limit guard rejects the increment", async () => {
      process.env.DAILY_CHAT_LIMIT = "5";
      incrementDailyUsage.mockResolvedValueOnce(null);

      const result = await checkAndIncrementDailyQuota(userId);
      expect(result).toEqual({ allowed: false, remaining: 0 });
    });

    it("fails closed and logs error when MongoDB throws", async () => {
      const error = new Error("Database connection failed");
      incrementDailyUsage.mockRejectedValueOnce(error);

      const result = await checkAndIncrementDailyQuota(userId);

      expect(result).toEqual({ allowed: false, remaining: 0 });
      expect(logger.error).toHaveBeenCalledWith(
        { err: error, userId },
        "Daily quota check failed — denying (fail closed)",
      );
    });
  });

  describe("refundDailyQuota", () => {
    it("executes update query successfully", async () => {
      refundDailyUsage.mockResolvedValueOnce(undefined);

      await expect(refundDailyQuota(userId)).resolves.not.toThrow();
      expect(refundDailyUsage).toHaveBeenCalledTimes(1);
    });

    it("logs error when MongoDB throws", async () => {
      const error = new Error("Database connection failed");
      refundDailyUsage.mockRejectedValueOnce(error);

      await refundDailyQuota(userId);

      expect(logger.error).toHaveBeenCalledWith(
        { err: error, userId },
        "Failed to refund daily quota",
      );
    });
  });
});
