import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = readFileSync(path.resolve(here, "../routes/index.ts"), "utf8");

// requireSubscription skips itself under NODE_ENV=test, so the HTTP suites
// cannot prove it is mounted. This guards the wiring instead.
describe("beta access gate", () => {
  it("mounts requireSubscription after requireAuth", () => {
    const auth = routes.indexOf("router.use(requireAuth)");
    const gate = routes.indexOf("router.use(requireSubscription)");
    expect(auth).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(auth);
  });

  it("leaves account export and deletion reachable without access", () => {
    expect(routes.indexOf("router.use(accountRouter)")).toBeLessThan(
      routes.indexOf("router.use(requireSubscription)"),
    );
  });

  it("lets signed-in people join the beta before they have access", () => {
    const join = routes.indexOf("router.use(betaRouter)");
    expect(join).toBeGreaterThan(routes.indexOf("router.use(requireAuth)"));
    expect(join).toBeLessThan(routes.indexOf("router.use(requireSubscription)"));
  });

  it("gates every product router", () => {
    const gate = routes.indexOf("router.use(requireSubscription)");
    for (const name of [
      "morningLogsRouter",
      "bodyScansRouter",
      "eveningReportsRouter",
      "habitsRouter",
      "dashboardRouter",
      "affirmationsRouter",
      "profileRouter",
      "chatRouter",
      "medicationsRouter",
      "weeklyReportRouter",
      "voiceRouter",
      "remindersRouter",
      "betaChecklistRouter",
    ]) {
      expect(routes.indexOf(`router.use(${name})`)).toBeGreaterThan(gate);
    }
  });
});
