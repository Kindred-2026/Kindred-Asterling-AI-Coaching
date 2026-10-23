import { describe, expect, it, vi } from "vitest";

const { withMonitor, dbError } = vi.hoisted(() => ({
  withMonitor: vi.fn((_slug: string, callback: () => Promise<void>, _config: unknown) =>
    callback(),
  ),
  dbError: new Error("database unavailable"),
}));

vi.mock("@sentry/node", () => ({ withMonitor }));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@workspace/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@workspace/db")>()),
  db: {
    select: () => {
      throw dbError;
    },
  },
}));

import { logger } from "./logger";
import { REMINDER_MONITOR_SLUG, runReminderTick } from "./reminderScheduler";

describe("reminder tick Sentry monitor", () => {
  it("checks in on every-minute schedule and lets failures reach the monitor", async () => {
    await expect(runReminderTick()).resolves.toBeUndefined();

    expect(withMonitor).toHaveBeenCalledTimes(1);
    const [slug, , config] = withMonitor.mock.calls[0]!;
    expect(slug).toBe(REMINDER_MONITOR_SLUG);
    expect(config).toMatchObject({
      schedule: { type: "crontab", value: "* * * * *" },
      maxRuntime: 10,
    });
    // The tick's promise rejects inside withMonitor, so Sentry marks the
    // check-in as an error; runReminderTick itself still only logs.
    await expect(withMonitor.mock.results[0]!.value).rejects.toBe(dbError);
    expect(logger.error).toHaveBeenCalledWith({ err: dbError }, "Reminder tick failed");
  });
});
