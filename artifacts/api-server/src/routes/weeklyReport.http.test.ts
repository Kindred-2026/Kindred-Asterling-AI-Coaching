import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Writable } from "node:stream";
import {
  bodyScansTable,
  closeDatabase,
  db,
  eq,
  usersTable,
} from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

// Record the text written to the PDF instead of rendering it, so the test can
// read which entries the report included.
vi.mock("pdfkit", () => ({
  default: class {
    private lines: string[] = [];
    private out?: Writable;
    pipe(out: Writable) {
      this.out = out;
      return out;
    }
    text(line: string) {
      this.lines.push(line);
      return this;
    }
    fontSize() {
      return this;
    }
    fillColor() {
      return this;
    }
    moveDown() {
      return this;
    }
    end() {
      this.out?.end(this.lines.join("\n"));
    }
  },
}));

const userId = `test-weekly-${crypto.randomUUID()}`;
const previousTz = process.env.TZ;
let server: Server;
let baseUrl: string;
let token: string;

beforeAll(async () => {
  // The bug only shows when the server is not running in UTC.
  process.env.TZ = "America/Los_Angeles";
  await db.insert(usersTable).values({ id: userId });
  token = registerTestClerkIdentity({ id: userId });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
  revokeTestClerkIdentity(token);
  await db.delete(bodyScansTable).where(eq(bodyScansTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await closeDatabase();
});

describe("GET /api/weekly-report/pdf", () => {
  it("leaves out body scans from the evening before the week starts", async () => {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const y = start.getFullYear();
    const m = start.getMonth();
    const d = start.getDate();
    await db.insert(bodyScansTable).values([
      {
        userId,
        scannedAt: new Date(y, m, d - 1, 20, 0),
        energyLevel: 5,
        notes: "before-window",
      },
      {
        userId,
        scannedAt: new Date(y, m, d, 8, 0),
        energyLevel: 5,
        notes: "in-window",
      },
    ]);

    const res = await fetch(`${baseUrl}/weekly-report/pdf`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Notes: in-window");
    expect(text).not.toContain("before-window");
  });
});
