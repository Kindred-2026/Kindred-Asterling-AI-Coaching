import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { HSTS_MAX_AGE_SECONDS, securityHeaders } from "./securityHeaders";

function createTestApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(securityHeaders(["https://tenant.auth0.test"]));
  app.get("/", (_req, res) => res.send("ok"));
  return app;
}

describe("security headers", () => {
  it("enables HSTS for at least a year, including subdomains", async () => {
    const response = await request(createTestApp()).get("/");
    expect(response.headers["strict-transport-security"]).toBe(
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
    );
    expect(HSTS_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(31536000);
  });

  it("allows the Auth0 origin for connections and frames only", async () => {
    const csp = (await request(createTestApp()).get("/")).headers["content-security-policy"];
    expect(csp).toContain("connect-src 'self' https://tenant.auth0.test");
    expect(csp).toContain("frame-src https://tenant.auth0.test");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows Intercom only when it is configured", async () => {
    const closed = (await request(createTestApp()).get("/")).headers["content-security-policy"];
    expect(closed).not.toContain("intercom");

    const app = express();
    app.use(securityHeaders([], { intercom: true }));
    app.get("/", (_req, res) => res.send("ok"));
    const csp = (await request(app).get("/")).headers["content-security-policy"];
    const directive = (name: string) =>
      csp.split(";").map((d: string) => d.trim()).find((d: string) => d.startsWith(`${name} `));
    expect(directive("script-src")).toBe(
      "script-src 'self' https://app.intercom.io https://widget.intercom.io https://js.intercomcdn.com",
    );
    expect(directive("connect-src")).toContain("wss://nexus-websocket-a.intercom.io");
    expect(directive("form-action")).toBe(
      "form-action 'self' https://intercom.help https://api-iam.intercom.io",
    );
    expect(csp).toContain("script-src-attr 'none'");
  });

  it("blocks inline scripts", async () => {
    const csp = (await request(createTestApp()).get("/")).headers["content-security-policy"];
    const scriptSrc = csp.split(";").find((d: string) => d.startsWith("script-src "));
    expect(scriptSrc).toBe("script-src 'self'");
    expect(csp).toContain("script-src-attr 'none'");
  });
});
