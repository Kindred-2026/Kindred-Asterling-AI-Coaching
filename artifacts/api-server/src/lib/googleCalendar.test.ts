import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { disconnectCalendar } from "./googleCalendar";

const databaseMocks = vi.hoisted(() => ({
  limit: vi.fn(),
  deleteWhere: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  eq: vi.fn(() => ({ filter: {} })),
  calendarConnectionsTable: {
    encryptedRefreshToken: "encryptedRefreshToken",
    userId: "userId",
  },
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: databaseMocks.limit })),
      })),
    })),
    delete: vi.fn(() => ({ where: databaseMocks.deleteWhere })),
  },
}));

vi.mock("./logger", () => ({
  logger: { warn: vi.fn() },
}));

function encryptRefreshToken(value: string, secret: string): string {
  const key = createHmac("sha256", secret)
    .update("kindred-calendar-token")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

describe("disconnectCalendar", () => {
  const secret = randomBytes(32).toString("hex");

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = secret;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  });

  it("revokes the refresh token and deletes the stored connection", async () => {
    databaseMocks.limit.mockResolvedValueOnce([
      { encryptedRefreshToken: encryptRefreshToken("refresh-token", secret) },
    ]);
    databaseMocks.deleteWhere.mockResolvedValueOnce(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await disconnectCalendar("user-123");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({
        method: "POST",
        body: new URLSearchParams({ token: "refresh-token" }),
      }),
    );
    expect(db.delete).toHaveBeenCalledOnce();
    expect(databaseMocks.deleteWhere).toHaveBeenCalledOnce();
  });

  it("still deletes the stored connection when Google revocation fails", async () => {
    databaseMocks.limit.mockResolvedValueOnce([
      { encryptedRefreshToken: encryptRefreshToken("refresh-token", secret) },
    ]);
    databaseMocks.deleteWhere.mockResolvedValueOnce(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(disconnectCalendar("user-123")).resolves.toBeUndefined();

    expect(db.delete).toHaveBeenCalledOnce();
    expect(databaseMocks.deleteWhere).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-123" }),
      "Google Calendar token revocation failed",
    );
  });

  it("is idempotent when no connection exists", async () => {
    databaseMocks.limit.mockResolvedValueOnce([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await disconnectCalendar("user-123");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });
});
