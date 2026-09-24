import { db } from "@workspace/db";
import { logger } from "./logger";

const DEFAULT_DAILY_LIMIT = 100;

export function getDailyLimit(): number {
  return (
    parseInt(process.env.DAILY_CHAT_LIMIT || "", 10) || DEFAULT_DAILY_LIMIT
  );
}

export async function checkAndIncrementDailyQuota(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const limit = getDailyLimit();
  try {
    const date = new Date().toISOString().split("T")[0];
    const count = await db.incrementDailyUsage(userId, date, limit);
    if (count === null) return { allowed: false, remaining: 0 };
    const remaining = Math.max(0, limit - count);
    return { allowed: count <= limit, remaining };
  } catch (err) {
    logger.error(
      { err, userId },
      "Daily quota check failed — denying (fail closed)",
    );
    return { allowed: false, remaining: 0 };
  }
}

export async function refundDailyQuota(userId: string): Promise<void> {
  try {
    const date = new Date().toISOString().split("T")[0];
    await db.refundDailyUsage(userId, date);
  } catch (err) {
    logger.error({ err, userId }, "Failed to refund daily quota");
  }
}
