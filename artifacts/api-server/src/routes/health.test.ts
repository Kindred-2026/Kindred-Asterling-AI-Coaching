import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import healthRouter from "./health";

// Mirrors the app.ts wiring: the health router is mounted at /api before any
// authentication, so the endpoint must answer with no credentials and no
// database. Kept hermetic so it runs in bare CI/verification environments.
function createTestApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", healthRouter);
  return app;
}

describe("health endpoint", () => {
  it("answers GET /api/health with 200 and an ok status", async () => {
    const response = await request(createTestApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toEqual({ status: "ok" });
  });

  it("needs no credentials to answer", async () => {
    const response = await request(createTestApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("keeps serving the existing /api/healthz sibling", async () => {
    const response = await request(createTestApp()).get("/api/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
