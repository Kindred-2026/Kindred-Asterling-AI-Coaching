import { afterEach, describe, expect, it } from "vitest";
import { validateRuntimeConfig } from "./validateConfig";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function baseEnv(): void {
  process.env = {
    ...originalEnv,
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://test:27017",
    MONGODB_DATABASE: "kindred_test",
    PORT: "8080",
    AI_PROVIDER: "disabled",
  };
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
}

describe("AI provider configuration", () => {
  it("allows startup with AI disabled", () => {
    baseEnv();
    expect(validateRuntimeConfig).not.toThrow();
  });

  it("validates only OpenAI variables when OpenAI is selected", () => {
    baseEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "server-only-secret";
    process.env.OPENAI_MODEL = "model";
    expect(validateRuntimeConfig).not.toThrow();
  });

  it("rejects retired Bedrock configuration", () => {
    baseEnv();
    process.env.AI_PROVIDER = "bedrock";
    expect(validateRuntimeConfig).toThrow(/ollama, openai, disabled/);
  });

  it("reports only the selected provider's missing variables", () => {
    baseEnv();
    process.env.AI_PROVIDER = "openai";
    expect(validateRuntimeConfig).toThrow(/OPENAI_API_KEY, OPENAI_MODEL/);
  });
});

describe("MongoDB runtime configuration", () => {
  it("requires the server-only URI and database", () => {
    baseEnv();
    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_DATABASE;
    expect(validateRuntimeConfig).toThrow(/MONGODB_URI, MONGODB_DATABASE/);
  });

  it("accepts a complete configuration", () => {
    baseEnv();
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
    process.env.MONGODB_DATABASE = "kindred";
    expect(validateRuntimeConfig).not.toThrow();
  });

  it("rejects an unsafe URI scheme or database name", () => {
    baseEnv();
    process.env.MONGODB_URI = "https://mongo.example";
    process.env.MONGODB_DATABASE = "kindred/mirror";
    expect(validateRuntimeConfig).toThrow(/MONGODB_URI must use/);

    process.env.MONGODB_URI = "mongodb+srv://mongo.example";
    expect(validateRuntimeConfig).toThrow(/MONGODB_DATABASE must contain/);
  });
});

describe("retired Google Calendar configuration", () => {
  it("does not require OAuth credentials when only the cleanup key remains", () => {
    baseEnv();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
    delete process.env.CALENDAR_OAUTH_STATE_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "cleanup-test-key";
    expect(validateRuntimeConfig).not.toThrow();
  });

  it("ignores obsolete OAuth settings during startup", () => {
    baseEnv();
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "/obsolete-callback";
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    expect(validateRuntimeConfig).not.toThrow();
  });
});


describe("Auth0 production configuration", () => {
  it("requires Auth0 issuer and API audience instead of Clerk credentials", () => {
    baseEnv();
    process.env.NODE_ENV = "production";
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_AUDIENCE;
    try { validateRuntimeConfig(); } catch (error) {
      expect(String(error)).toContain("AUTH0_DOMAIN");
      expect(String(error)).toContain("AUTH0_AUDIENCE");
      expect(String(error)).not.toContain("CLERK_");
      return;
    }
    throw new Error("Expected missing Auth0 configuration to fail");
  });
});
