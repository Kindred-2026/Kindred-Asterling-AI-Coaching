import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "@workspace/db";
import {
  db,
  closeDatabase,
  usersTable,
  conversations,
  messages,
  morningLogsTable,
  eveningReportsTable,
  bodyScansTable,
  habitsTable,
  habitEntriesTable,
  medicationsTable,
  dailyUsageTable,
} from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

// These tests drive the real Express chat routes over HTTP (auth middleware,
// request validation, status codes, conversation/message ownership checks, and
// response shapes). Chat history is the most sensitive class of user data, so we
// prove anonymous callers are rejected, one user can't read another's archived
// conversation, and a failed LLM turn never persists a fallback assistant reply
// that would pollute the conversation. The outbound AI provider is mocked so
// the suite makes no real model calls.
const { providerChatMock } = vi.hoisted(() => ({ providerChatMock: vi.fn() }));
vi.mock("./ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ai")>();
  return {
    ...actual,
    getAIProvider: () => ({ name: "ollama", chat: providerChatMock }),
  };
});

const createMock = providerChatMock;

function mockReplyOnce(text: string) {
  createMock.mockResolvedValueOnce({
    content: text,
    toolCalls: [],
    finishReason: "stop",
  });
}
function failReplyOnce() {
  createMock.mockRejectedValueOnce(new Error("ollama unavailable"));
}

// Mocks a single provider turn that asks to call a tool. The route runs the tool
// scoped to the session user, then re-calls the provider with the result fed back.
function mockToolUseOnce(
  toolName: string,
  input: Record<string, unknown> = {},
) {
  createMock.mockResolvedValueOnce({
    content: "",
    toolCalls: [
      {
        id: "tool-call-1",
        name: toolName,
        arguments: input,
      },
    ],
    finishReason: "tool_calls",
  });
}

// Mocks a single provider turn that asks to call several tools at once. The route
// runs every requested tool (each scoped to the session user) and feeds all the
// results back together on the next call.
function mockMultiToolUseOnce(
  tools: { name: string; input?: Record<string, unknown>; id?: string }[],
) {
  createMock.mockResolvedValueOnce({
    content: "",
    toolCalls: tools.map((tool) => ({
      id: tool.id ?? `tool-${tool.name}`,
      name: tool.name,
      arguments: tool.input ?? {},
    })),
    finishReason: "tool_calls",
  });
}

// Mocks an unbounded "always asks for another tool" model so we can prove the
// agentic loop is capped and never loops forever / burns tokens.
function mockToolUseAlways(toolName: string) {
  createMock.mockResolvedValue({
    content: "",
    toolCalls: [{ id: "tool-call-loop", name: toolName, arguments: {} }],
    finishReason: "tool_calls",
  });
}

const suffix = Math.random().toString(36).slice(2, 10);
const userAId = `test-chathttp-a-${suffix}`;
const userBId = `test-chathttp-b-${suffix}`;

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

interface ConvWithMessages {
  id: number;
  messages: { role: string; content: string }[];
}

async function quotaCount(userId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const [result] = await db
    .select()
    .from(dailyUsageTable)
    .where(eq(dailyUsageTable.userId, userId));
  return result?.date === today ? result.count : 0;
}

async function messagesForUser(userId: string) {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.userId, userId));
}

beforeAll(async () => {
  await db.insert(usersTable).values([
    {
      id: userAId,
      email: `${userAId}@example.test`,
      emailVerifiedAt: new Date(),
    },
    {
      id: userBId,
      email: `${userBId}@example.test`,
      emailVerifiedAt: new Date(),
    },
  ]);
  tokenA = await makeSession(userAId);
  tokenB = await makeSession(userBId);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

afterEach(async () => {
  createMock.mockReset();
  for (const id of [userAId, userBId]) {
    // Cascade removes messages owned by the user's conversations.
    await db.delete(conversations).where(eq(conversations.userId, id));
    await db.delete(morningLogsTable).where(eq(morningLogsTable.userId, id));
    await db
      .delete(eveningReportsTable)
      .where(eq(eveningReportsTable.userId, id));
    await db.delete(bodyScansTable).where(eq(bodyScansTable.userId, id));
    // habit_entries + medication_logs cascade off their parent rows.
    await db.delete(habitsTable).where(eq(habitsTable.userId, id));
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
    { method: "GET", path: "/chat/active" },
    { method: "POST", path: "/chat/send", body: { content: "hello" } },
    {
      method: "POST",
      path: "/chat/append",
      body: { role: "user", content: "hello" },
    },
    { method: "POST", path: "/chat/archive" },
    { method: "GET", path: "/chat/archived" },
    { method: "GET", path: "/chat/archived/1" },
  ];

  it.each(anonymousCases)(
    "rejects anonymous $method $path with 401",
    async ({ method, path, body }) => {
      const res = await api(method, path, { body });
      expect(res.status).toBe(401);
      // A rejected request must never reach the LLM.
      expect(createMock).not.toHaveBeenCalled();
    },
  );
});

describe("GET /chat/active", () => {
  it("returns null when no active conversation exists (read-only — never creates)", async () => {
    // GET must not insert any rows; it returns null for a new user.
    const res = await api("GET", "/chat/active", { token: tokenA });
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();

    // Confirm zero conversations were written.
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userAId));
    expect(rows).toHaveLength(0);
  });

  it("returns the active conversation after it has been created by POST", async () => {
    // A POST creates the conversation; the subsequent GET should return it.
    mockReplyOnce("Hello there.");
    await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "hi" },
    });

    const res = await api("GET", "/chat/active", { token: tokenA });
    expect(res.status).toBe(200);
    const conv = res.body as ConvWithMessages;
    expect(conv.id).toBeTypeOf("number");
    expect(Array.isArray(conv.messages)).toBe(true);

    // It belongs to the caller in the DB.
    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conv.id));
    expect(row.userId).toBe(userAId);
  });

  it("gives each user their own conversation, never a shared one", async () => {
    // Create separate conversations for each user via POST first.
    mockReplyOnce("Reply for A.");
    await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "hello from A" },
    });
    mockReplyOnce("Reply for B.");
    await api("POST", "/chat/send", {
      token: tokenB,
      body: { content: "hello from B" },
    });

    const a = (await api("GET", "/chat/active", { token: tokenA }))
      .body as ConvWithMessages;
    const b = (await api("GET", "/chat/active", { token: tokenB }))
      .body as ConvWithMessages;
    expect(a.id).not.toBe(b.id);

    const [rowB] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, b.id));
    expect(rowB.userId).toBe(userBId);
  });
});

describe("POST /chat/send", () => {
  it("returns the fixed crisis response without calling the AI provider or spending quota", async () => {
    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "I want to kill myself" },
    });
    expect(res.status).toBe(200);
    expect(createMock).not.toHaveBeenCalled();

    const safety = res.body as {
      type: string;
      message: string;
      falsePositive: { label: string };
      regionSelector: { id: string }[];
    };
    expect(safety.type).toBe("crisis_support");
    expect(safety.message).toContain("local emergency services");
    expect(safety.message).toContain(
      "not medical care or an emergency service",
    );
    expect(safety.falsePositive.label).toBe("This doesn’t apply");
    expect(safety.regionSelector).toContainEqual(
      expect.objectContaining({ id: "international" }),
    );

    const quotaRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userAId));
    expect(quotaRows).toHaveLength(0);

    const storedMessages = await messagesForUser(userAId);
    expect(storedMessages).toHaveLength(0);
  });

  it("persists the user turn and the assistant reply for the owner", async () => {
    mockReplyOnce("Take your time at therapy.");
    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "heading to therapy" },
    });
    expect(res.status).toBe(200);

    const conv = res.body as ConvWithMessages;
    const roles = conv.messages.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
    expect(conv.messages.some((m) => m.content === "heading to therapy")).toBe(
      true,
    );
    expect(
      conv.messages.some((m) => m.content === "Take your time at therapy."),
    ).toBe(true);
    expect(
      (await messagesForUser(userAId)).every((m) => m.userId === userAId),
    ).toBe(true);
  });

  it("rejects an invalid body with 400 and never calls the model", async () => {
    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "" },
    });
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();

    const rows = await messagesForUser(userAId);
    expect(rows).toHaveLength(0);
  });

  it("returns 502 and persists no fallback assistant reply when the model call fails", async () => {
    const quotaBefore = await quotaCount(userAId);
    failReplyOnce();
    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "are you there" },
    });
    expect(res.status).toBe(502);

    // The user turn is stored, but no assistant turn is — a failed LLM call
    // must never pollute history with a fabricated reply.
    const rows = await messagesForUser(userAId);
    expect(rows.filter((r) => r.role === "assistant")).toHaveLength(0);
    expect(rows.filter((r) => r.role === "user")).toHaveLength(1);
    // The reserved slot is returned after both bounded attempts fail.
    expect(await quotaCount(userAId)).toBe(quotaBefore);
  });
});

describe("POST /chat/send agentic tool loop", () => {
  // Pull the tool message that the route fed back to Ollama after running
  // the requested tool. This is what proves the executor was scoped to the
  // session user: the JSON handed back to the model contains exactly that
  // user's rows. callIndex selects the Ollama request to inspect.
  function toolResultTextFrom(callIndex: number): string {
    const call = createMock.mock.calls[callIndex]?.[0] as
      { messages: { role: string; content: unknown }[] } | undefined;
    expect(call, `expected a model call at index ${callIndex}`).toBeTruthy();
    const toolResult = [...call!.messages]
      .reverse()
      .find((message) => message.role === "tool");
    return typeof toolResult?.content === "string" ? toolResult.content : "";
  }

  // Like toolResultTextFrom, but concatenates every tool message. Used when one
  // model turn requested several tools at once.
  function allToolResultsTextFrom(callIndex: number): string {
    const call = createMock.mock.calls[callIndex]?.[0] as
      { messages: { role: string; content: unknown }[] } | undefined;
    expect(call, `expected a model call at index ${callIndex}`).toBeTruthy();
    return call!.messages
      .filter((message) => message.role === "tool")
      .map((message) =>
        typeof message.content === "string" ? message.content : "",
      )
      .join("\n");
  }

  it("runs the requested tool scoped to the session user and returns the final reply", async () => {
    // Seed a morning log for BOTH users on the same date. If the loop leaked
    // the wrong id into the tool, user B's note would surface in the payload
    // handed back to the model.
    await db.insert(morningLogsTable).values([
      {
        userId: userAId,
        date: "2026-05-20",
        mentalLoadLevel: "medium",
        miniGoals: [],
        notes: "USER_A_MORNING_NOTE",
      },
      {
        userId: userBId,
        date: "2026-05-20",
        mentalLoadLevel: "high",
        miniGoals: [],
        notes: "USER_B_MORNING_NOTE",
      },
    ]);

    // Turn 1: Ollama asks for the morning logs. Turn 2: it produces a reply.
    mockToolUseOnce("get_recent_morning_logs", { limit: 7 });
    mockReplyOnce("Your mornings have felt heavy lately.");

    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "how have my mornings been" },
    });
    expect(res.status).toBe(200);

    // The loop made exactly two model calls: tool_use, then the final reply.
    expect(createMock).toHaveBeenCalledTimes(2);

    // The tool ran scoped to user A: their note is in the result fed back to
    // the model, and user B's note is not.
    const fedBack = toolResultTextFrom(1);
    expect(fedBack).toContain("USER_A_MORNING_NOTE");
    expect(fedBack).not.toContain("USER_B_MORNING_NOTE");

    // The loop terminated and the final reply persisted for the owner.
    const conv = res.body as ConvWithMessages;
    expect(
      conv.messages.some(
        (m) =>
          m.role === "assistant" &&
          m.content === "Your mornings have felt heavy lately.",
      ),
    ).toBe(true);
  });

  it("runs get_recent_evening_reports scoped to the session user", async () => {
    // Both users have an evening reflection on the same day. Only the caller's
    // wins/challenges text may surface in what's fed back to the model.
    await db.insert(eveningReportsTable).values([
      {
        userId: userAId,
        date: "2026-05-21",
        medicationEffectiveness: 7,
        overallMood: "steady",
        wins: "USER_A_EVENING_WIN",
        challenges: "USER_A_EVENING_CHALLENGE",
        tomorrowIntent: "rest",
      },
      {
        userId: userBId,
        date: "2026-05-21",
        medicationEffectiveness: 3,
        overallMood: "low",
        wins: "USER_B_EVENING_WIN",
        challenges: "USER_B_EVENING_CHALLENGE",
        tomorrowIntent: "regroup",
      },
    ]);

    mockToolUseOnce("get_recent_evening_reports", { limit: 7 });
    mockReplyOnce("Sounds like the evenings carried a real win.");

    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "how have my evenings gone" },
    });
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);

    const fedBack = toolResultTextFrom(1);
    expect(fedBack).toContain("USER_A_EVENING_WIN");
    expect(fedBack).toContain("USER_A_EVENING_CHALLENGE");
    expect(fedBack).not.toContain("USER_B_EVENING_WIN");
    expect(fedBack).not.toContain("USER_B_EVENING_CHALLENGE");
  });

  it("runs get_recent_body_scans scoped to the session user", async () => {
    // Two users log a body scan; only the caller's sensations/notes may leave.
    await db.insert(bodyScansTable).values([
      {
        userId: userAId,
        scannedAt: new Date("2026-05-22T09:00:00Z"),
        feelings: ["calm"],
        energyLevel: 6,
        physicalSensations: "USER_A_BODY_SENSATION",
        notes: "USER_A_BODY_NOTE",
      },
      {
        userId: userBId,
        scannedAt: new Date("2026-05-22T09:00:00Z"),
        feelings: ["tense"],
        energyLevel: 2,
        physicalSensations: "USER_B_BODY_SENSATION",
        notes: "USER_B_BODY_NOTE",
      },
    ]);

    mockToolUseOnce("get_recent_body_scans", { limit: 7 });
    mockReplyOnce("Your body's been asking for a slower pace.");

    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "how's my body been feeling" },
    });
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);

    const fedBack = toolResultTextFrom(1);
    expect(fedBack).toContain("USER_A_BODY_SENSATION");
    expect(fedBack).toContain("USER_A_BODY_NOTE");
    expect(fedBack).not.toContain("USER_B_BODY_SENSATION");
    expect(fedBack).not.toContain("USER_B_BODY_NOTE");
  });

  it("runs get_habits_with_streaks scoped to the session user", async () => {
    // Each user owns a habit with a completed entry. The tool must only ever
    // surface the caller's habit name — never the other user's.
    const [habitA] = await db
      .insert(habitsTable)
      .values({
        userId: userAId,
        name: "USER_A_HABIT",
        description: null,
        targetDays: 90,
        startDate: "2026-05-01",
      })
      .returning();
    const [habitB] = await db
      .insert(habitsTable)
      .values({
        userId: userBId,
        name: "USER_B_HABIT",
        description: null,
        targetDays: 90,
        startDate: "2026-05-01",
      })
      .returning();
    const todayStr = new Date().toISOString().split("T")[0];
    await db.insert(habitEntriesTable).values([
      {
        userId: userAId,
        habitId: habitA.id,
        date: todayStr,
        completed: true,
      },
      {
        userId: userBId,
        habitId: habitB.id,
        date: todayStr,
        completed: true,
      },
    ]);

    mockToolUseOnce("get_habits_with_streaks");
    mockReplyOnce("That streak is something to be proud of.");

    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "how are my habits going" },
    });
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);

    const fedBack = toolResultTextFrom(1);
    expect(fedBack).toContain("USER_A_HABIT");
    expect(fedBack).not.toContain("USER_B_HABIT");
  });

  it("runs get_medications_status scoped to the session user", async () => {
    // Two users have a medication. Only the caller's med name/notes may surface.
    await db.insert(medicationsTable).values([
      {
        userId: userAId,
        name: "USER_A_MED",
        dosage: "10mg",
        times: ["08:00"],
        notes: "USER_A_MED_NOTE",
      },
      {
        userId: userBId,
        name: "USER_B_MED",
        dosage: "20mg",
        times: ["09:00"],
        notes: "USER_B_MED_NOTE",
      },
    ]);

    mockToolUseOnce("get_medications_status");
    mockReplyOnce("Looks like the morning dose is still pending.");

    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "did I take my meds today" },
    });
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(2);

    const fedBack = toolResultTextFrom(1);
    expect(fedBack).toContain("USER_A_MED");
    expect(fedBack).toContain("USER_A_MED_NOTE");
    expect(fedBack).not.toContain("USER_B_MED");
    expect(fedBack).not.toContain("USER_B_MED_NOTE");
  });

  it("runs two tools requested in one turn, both scoped to the session user", async () => {
    // A single model turn asks for evening reports AND body scans at once. Both
    // executors must run scoped to the caller and feed back only their rows.
    await db.insert(eveningReportsTable).values([
      {
        userId: userAId,
        date: "2026-05-23",
        medicationEffectiveness: 8,
        overallMood: "good",
        wins: "USER_A_EVENING_WIN",
        challenges: null,
        tomorrowIntent: null,
      },
      {
        userId: userBId,
        date: "2026-05-23",
        medicationEffectiveness: 4,
        overallMood: "tired",
        wins: "USER_B_EVENING_WIN",
        challenges: null,
        tomorrowIntent: null,
      },
    ]);
    await db.insert(bodyScansTable).values([
      {
        userId: userAId,
        scannedAt: new Date("2026-05-23T20:00:00Z"),
        feelings: ["light"],
        energyLevel: 7,
        physicalSensations: "USER_A_BODY_SENSATION",
        notes: null,
      },
      {
        userId: userBId,
        scannedAt: new Date("2026-05-23T20:00:00Z"),
        feelings: ["heavy"],
        energyLevel: 3,
        physicalSensations: "USER_B_BODY_SENSATION",
        notes: null,
      },
    ]);

    mockMultiToolUseOnce([
      {
        name: "get_recent_evening_reports",
        input: { limit: 7 },
        id: "toolu_a",
      },
      { name: "get_recent_body_scans", input: { limit: 7 }, id: "toolu_b" },
    ]);
    mockReplyOnce("Your evenings and your body both point the same way.");

    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "how have my evenings and body been" },
    });
    expect(res.status).toBe(200);
    // One tool_use turn (with two tools) + one final reply = two model calls.
    expect(createMock).toHaveBeenCalledTimes(2);

    // Both tool results rode back on the same user turn; neither leaked B.
    const fedBack = allToolResultsTextFrom(1);
    expect(fedBack).toContain("USER_A_EVENING_WIN");
    expect(fedBack).toContain("USER_A_BODY_SENSATION");
    expect(fedBack).not.toContain("USER_B_EVENING_WIN");
    expect(fedBack).not.toContain("USER_B_BODY_SENSATION");
  });

  it("bounds a model that keeps requesting tools at the iteration cap", async () => {
    // A misbehaving model that never stops asking for tools must not loop
    // forever. The route caps at MAX_TOOL_ITERATIONS (4) and then fails the
    // turn rather than burning unbounded tokens.
    mockToolUseAlways("get_recent_morning_logs");

    const res = await api("POST", "/chat/send", {
      token: tokenA,
      body: { content: "loop please" },
    });
    expect(res.status).toBe(502);
    expect((res.body as { reason?: string }).reason).toBe(
      "max_tool_iterations",
    );

    // Exactly 4 model calls — the cap — no more.
    expect(createMock).toHaveBeenCalledTimes(4);

    // The user turn is stored, but the capped turn persisted no assistant
    // reply (no fabricated history).
    const rows = await messagesForUser(userAId);
    expect(rows.filter((r) => r.role === "assistant")).toHaveLength(0);
    expect(rows.filter((r) => r.role === "user")).toHaveLength(1);
  });
});

describe("POST /chat/append", () => {
  it("appends a message to the caller's own conversation", async () => {
    const res = await api("POST", "/chat/append", {
      token: tokenA,
      body: { role: "user", content: "a quick note" },
    });
    expect(res.status).toBe(200);
    const conv = res.body as ConvWithMessages;
    expect(conv.messages.some((m) => m.content === "a quick note")).toBe(true);

    // It landed under a conversation owned by the caller.
    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conv.id));
    expect(row.userId).toBe(userAId);
  });

  it("does not return a message with another owner even under the same conversation", async () => {
    const first = await api("POST", "/chat/append", {
      token: tokenA,
      body: { role: "user", content: "owned note" },
    });
    const conversationId = (first.body as ConvWithMessages).id;
    await db.insert(messages).values({
      conversationId,
      userId: userBId,
      role: "user",
      content: "cross-account fixture",
    });

    const active = await api("GET", "/chat/active", { token: tokenA });
    const returned = active.body as ConvWithMessages;
    expect(returned.messages.map((message) => message.content)).toContain(
      "owned note",
    );
    expect(returned.messages.map((message) => message.content)).not.toContain(
      "cross-account fixture",
    );
  });
});

describe("GET /chat/archived/:id ownership", () => {
  async function archivedConvIdFor(token: string): Promise<number> {
    // Archiving the current active conversation moves it to the archived list.
    await api("POST", "/chat/archive", { token });
    const list = (await api("GET", "/chat/archived", { token })).body as {
      id: number;
    }[];
    return list[0].id;
  }

  it("lets the owner read their archived conversation", async () => {
    const id = await archivedConvIdFor(tokenA);
    const res = await api("GET", `/chat/archived/${id}`, { token: tokenA });
    expect(res.status).toBe(200);
    expect((res.body as ConvWithMessages).id).toBe(id);
  });

  it("returns 404 when another user tries to read your archived conversation", async () => {
    const id = await archivedConvIdFor(tokenA);
    const res = await api("GET", `/chat/archived/${id}`, { token: tokenB });
    expect(res.status).toBe(404);
  });

  it("does not leak one user's archived conversations into another's list", async () => {
    await archivedConvIdFor(tokenA);
    const list = await api("GET", "/chat/archived", { token: tokenB });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(0);
  });
});
