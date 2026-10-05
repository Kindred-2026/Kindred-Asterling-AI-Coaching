import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  marketingSiteOrigin,
  marketingSiteRedirect,
} from "./marketingSiteRedirect";

function createTestApp() {
  const app = express();
  app.use(marketingSiteRedirect("https://marketing.example"));
  app.all(/.*/, (_req, res) => res.send("app"));
  return app;
}

describe("marketing site redirect", () => {
  it.each([
    "/about",
    "/science/",
    "/legal/privacy/",
    "/legal-documents/privacy-policy.pdf",
    "/sitemap.xml",
    "/llms.txt",
  ])("moves %s to the marketing domain", async (path) => {
    const response = await request(createTestApp()).get(`${path}?ref=x`);
    expect(response.status).toBe(301);
    expect(response.headers.location).toBe(
      `https://marketing.example${path}?ref=x`,
    );
  });

  it.each(["/", "/login", "/signup", "/pricing", "/today", "/api/healthz", "/aboutus"])(
    "keeps %s on the app domain",
    async (path) => {
      const response = await request(createTestApp()).get(path);
      expect(response.status).toBe(200);
      expect(response.text).toBe("app");
    },
  );

  it("keeps the Auth0 callback on the app root", async () => {
    const response = await request(createTestApp()).get("/?code=a&state=b");
    expect(response.status).toBe(200);
  });

  it("asks crawlers not to index the app", async () => {
    const response = await request(createTestApp()).get("/robots.txt");
    expect(response.text).toBe("User-agent: *\nDisallow: /\n");
  });

  it("leaves writes alone", async () => {
    const response = await request(createTestApp()).post("/about");
    expect(response.status).toBe(200);
  });

  it("reads the origin from MARKETING_SITE_URL", () => {
    expect(marketingSiteOrigin(undefined)).toBeNull();
    expect(marketingSiteOrigin(" ")).toBeNull();
    expect(marketingSiteOrigin("https://marketing.example/")).toBe(
      "https://marketing.example",
    );
    expect(() => marketingSiteOrigin("ftp://marketing.example")).toThrow();
  });
});
