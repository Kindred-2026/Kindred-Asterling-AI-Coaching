import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "@workspace/db";
import {
  db,
  closeDatabase,
  usersTable,
  medicationsTable,
  medicationLogsTable,
  medicationScheduleEntriesTable,
} from "@workspace/db";
import * as schedule from "./medicationSchedule";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

// These tests drive the real Express medication routes over HTTP (auth
// middleware, request validation, status codes, ownership checks, and the write
// transactions wired into each route). reconcileScheduleEntries — the dependent
// write inside the create/update transactions — is wrapped in a spy so a test
// can force it to throw mid-save and prove the route responds 500 and leaves no
// rows behind.
vi.mock("./medicationSchedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./medicationSchedule")>();
  return {
    ...actual,
    reconcileScheduleEntries: vi.fn(actual.reconcileScheduleEntries),
  };
});

const reconcileSpy = vi.mocked(schedule.reconcileScheduleEntries);

function failReconcileOnce() {
  reconcileSpy.mockImplementationOnce(async () => {
    throw new Error("reconcile boom");
  });
}

const suffix = Math.random().toString(36).slice(2, 10);
const userAId = `test-medhttp-a-${suffix}`;
const userBId = `test-medhttp-b-${suffix}`;
const TODAY = "2026-05-29";

let server: Server;
let baseUrl: string;
let tokenA: string;
let tokenB: string;
const tokens: string[] = [];

async function makeSession(userId: string): Promise<string> {
  const token = registerTestClerkIdentity({ id: userId });
  tokens.push(token);
  return token;
}

interface ApiResult {
  status: number;
  body: unknown;
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

async function createMed(
  token: string,
  overrides: Partial<{
    name: string;
    dosage: string;
    times: string[];
    notes: string | null;
  }> = {},
): Promise<number> {
  const res = await api("POST", "/medications", {
    token,
    body: {
      name: "Vitamin D",
      dosage: "1000 IU",
      times: ["08:00"],
      notes: null,
      ...overrides,
    },
  });
  return (res.body as { id: number }).id;
}

beforeAll(async () => {
  await db.insert(usersTable).values([{ id: userAId }, { id: userBId }]);
  tokenA = await makeSession(userAId);
  tokenB = await makeSession(userBId);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

afterEach(async () => {
  reconcileSpy.mockClear();
  for (const id of [userAId, userBId]) {
    // Cascade removes logs + schedule entries for every med owned by the user.
    await db.delete(medicationsTable).where(eq(medicationsTable.userId, id));
  }
});

afterAll(async () => {
  tokens.forEach(revokeTestClerkIdentity);
  for (const id of [userAId, userBId]) {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await closeDatabase();
});

describe("auth is required", () => {
  const anonymousCases: { method: string; path: string; body?: unknown }[] = [
    { method: "GET", path: "/medications" },
    {
      method: "POST",
      path: "/medications",
      body: { name: "Anon", dosage: "1mg", times: ["08:00"] },
    },
    {
      method: "PATCH",
      path: "/medications/1",
      body: { name: "Anon", dosage: "1mg", times: ["08:00"] },
    },
    { method: "DELETE", path: "/medications/1" },
    {
      method: "POST",
      path: "/medications/1/log",
      body: { scheduledTime: "08:00" },
    },
    {
      method: "DELETE",
      path: "/medications/1/log",
      body: { scheduledTime: "08:00" },
    },
  ];

  it.each(anonymousCases)(
    "rejects anonymous $method $path with 401",
    async ({ method, path, body }) => {
      const res = await api(method, path, { body });
      expect(res.status).toBe(401);
    },
  );
});

describe("POST/GET /medications", () => {
  it("creates a medication and reads it back for the owner", async () => {
    const created = await api("POST", "/medications", {
      token: tokenA,
      body: {
        name: "Vitamin D",
        dosage: "1000 IU",
        times: ["08:00", "20:00"],
        notes: "with food",
      },
    });
    expect(created.status).toBe(201);
    expect((created.body as { id: number }).id).toBeTypeOf("number");

    const list = await api("GET", "/medications", { token: tokenA });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect((list.body as { times: string[] }[])[0].times).toEqual([
      "08:00",
      "20:00",
    ]);
  });

  it("rejects an invalid body with 400 and writes nothing", async () => {
    const res = await api("POST", "/medications", {
      token: tokenA,
      body: { name: "", dosage: "1mg", times: [] },
    });
    expect(res.status).toBe(400);

    const list = await api("GET", "/medications", { token: tokenA });
    expect(list.body).toHaveLength(0);
  });

  it("does not leak one user's medications to another user", async () => {
    await createMed(tokenA, { name: "Private" });

    const list = await api("GET", "/medications", { token: tokenB });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(0);
  });

  it("rolls back and returns 500 when the save fails mid-transaction", async () => {
    failReconcileOnce();

    const res = await api("POST", "/medications", {
      token: tokenA,
      body: { name: "Doomed", dosage: "5mg", times: ["09:00"], notes: null },
    });
    expect(res.status).toBe(500);

    // No half-saved medication and no orphaned schedule entries.
    const list = await api("GET", "/medications", { token: tokenA });
    expect(list.body).toHaveLength(0);
    const entries = await db
      .select()
      .from(medicationScheduleEntriesTable)
      .where(eq(medicationScheduleEntriesTable.userId, userAId));
    expect(entries).toHaveLength(0);
  });
});

describe("PATCH /medications/:id", () => {
  it("updates a medication the caller owns", async () => {
    const id = await createMed(tokenA, { name: "Before", dosage: "10mg" });
    const res = await api("PATCH", `/medications/${id}`, {
      token: tokenA,
      body: { name: "After", dosage: "20mg", times: ["09:00"], notes: "edit" },
    });
    expect(res.status).toBe(200);
    expect((res.body as { name: string }).name).toBe("After");
  });

  it("returns 404 when another user tries to update your medication", async () => {
    const id = await createMed(tokenA, { name: "Owned" });
    const res = await api("PATCH", `/medications/${id}`, {
      token: tokenB,
      body: { name: "Hijacked", dosage: "1mg", times: ["08:00"], notes: null },
    });
    expect(res.status).toBe(404);

    // The owner's medication is untouched.
    const list = await api("GET", "/medications", { token: tokenA });
    expect((list.body as { name: string }[])[0].name).toBe("Owned");
  });

  it("rolls back field changes and returns 500 when the save fails", async () => {
    const id = await createMed(tokenA, {
      name: "Original",
      dosage: "10mg",
      times: ["08:00"],
    });

    failReconcileOnce();
    const res = await api("PATCH", `/medications/${id}`, {
      token: tokenA,
      body: {
        name: "Should Not Stick",
        dosage: "99mg",
        times: ["09:00", "10:00"],
        notes: "nope",
      },
    });
    expect(res.status).toBe(500);

    const [row] = await db
      .select()
      .from(medicationsTable)
      .where(eq(medicationsTable.id, id));
    expect(row.name).toBe("Original");
    expect(row.dosage).toBe("10mg");
    expect(row.times).toEqual(["08:00"]);
  });
});

describe("schedule dating uses the client's local day", () => {
  // UTC-14 and UTC+14 are 28 hours apart, so they never share a calendar day.
  function localDay(tzOffset: number): string {
    return new Date(Date.now() - tzOffset * 60_000).toISOString().split("T")[0];
  }

  it("dates create and update schedule entries with the sent tzOffset", async () => {
    const created = await api("POST", "/medications", {
      token: tokenA,
      body: { name: "Tz", dosage: "1mg", times: ["08:00"], tzOffset: 840 },
    });
    expect(created.status).toBe(201);
    expect(reconcileSpy.mock.calls.at(-1)?.[4]).toBe(localDay(840));

    const id = (created.body as { id: number }).id;
    const updated = await api("PATCH", `/medications/${id}`, {
      token: tokenA,
      body: { name: "Tz", dosage: "1mg", times: ["09:00"], tzOffset: -840 },
    });
    expect(updated.status).toBe(200);
    expect(reconcileSpy.mock.calls.at(-1)?.[4]).toBe(localDay(-840));
    expect(localDay(840)).not.toBe(localDay(-840));
  });
});

describe("DELETE /medications/:id", () => {
  it("deletes a medication the caller owns", async () => {
    const id = await createMed(tokenA);
    const res = await api("DELETE", `/medications/${id}`, { token: tokenA });
    expect(res.status).toBe(204);

    const list = await api("GET", "/medications", { token: tokenA });
    expect(list.body).toHaveLength(0);
  });

  it("returns 404 when another user tries to delete your medication", async () => {
    const id = await createMed(tokenA);
    const res = await api("DELETE", `/medications/${id}`, { token: tokenB });
    expect(res.status).toBe(404);

    // The owner still has the medication.
    const list = await api("GET", "/medications", { token: tokenA });
    expect(list.body).toHaveLength(1);
  });
});

describe("POST/DELETE /medications/:id/log", () => {
  it("logs a dose for a medication the caller owns", async () => {
    const id = await createMed(tokenA, { times: ["08:00"] });
    const res = await api("POST", `/medications/${id}/log`, {
      token: tokenA,
      body: { scheduledTime: "08:00", effectiveness: 7 },
    });
    expect(res.status).toBe(201);
    expect((res.body as { medicationId: number }).medicationId).toBe(id);
  });

  it("returns 404 for an unscheduled dose time and writes nothing", async () => {
    const id = await createMed(tokenA, { times: ["08:00"] });
    const res = await api("POST", `/medications/${id}/log`, {
      token: tokenA,
      body: { scheduledTime: "23:00", effectiveness: 5 },
    });
    expect(res.status).toBe(404);

    const logs = await db
      .select()
      .from(medicationLogsTable)
      .where(eq(medicationLogsTable.userId, userAId));
    expect(logs).toHaveLength(0);
  });

  it("returns 404 when another user tries to log against your medication", async () => {
    const id = await createMed(tokenA, { times: ["08:00"] });
    const res = await api("POST", `/medications/${id}/log`, {
      token: tokenB,
      body: { scheduledTime: "08:00", effectiveness: 5 },
    });
    expect(res.status).toBe(404);

    // No dose log was written for the owner.
    const logs = await db
      .select()
      .from(medicationLogsTable)
      .where(eq(medicationLogsTable.userId, userAId));
    expect(logs).toHaveLength(0);
  });

  it("removes a dose log the caller owns", async () => {
    const id = await createMed(tokenA, { times: ["08:00"] });
    await api("POST", `/medications/${id}/log`, {
      token: tokenA,
      body: { scheduledTime: "08:00", effectiveness: 7 },
    });

    const res = await api("DELETE", `/medications/${id}/log`, {
      token: tokenA,
      body: { scheduledTime: "08:00" },
    });
    expect(res.status).toBe(204);

    const logs = await db
      .select()
      .from(medicationLogsTable)
      .where(eq(medicationLogsTable.userId, userAId));
    expect(logs).toHaveLength(0);
  });

  it("returns 404 when another user tries to remove your dose log", async () => {
    const id = await createMed(tokenA, { times: ["08:00"] });
    await api("POST", `/medications/${id}/log`, {
      token: tokenA,
      body: { scheduledTime: "08:00", effectiveness: 7 },
    });

    const res = await api("DELETE", `/medications/${id}/log`, {
      token: tokenB,
      body: { scheduledTime: "08:00" },
    });
    expect(res.status).toBe(404);

    // The owner's dose log is untouched.
    const logs = await db
      .select()
      .from(medicationLogsTable)
      .where(eq(medicationLogsTable.userId, userAId));
    expect(logs).toHaveLength(1);
  });
});
