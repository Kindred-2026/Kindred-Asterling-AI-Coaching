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
    DATABASE_PROVIDER: "mongo",
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

describe("PostgreSQL runtime configuration", () => {
  it("accepts PostgreSQL without requiring MongoDB credentials", () => {
    baseEnv();
    process.env.DATABASE_PROVIDER = "postgres";
    process.env.POSTGRES_URL = "postgresql://db.example/kindred";
    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_DATABASE;
    expect(validateRuntimeConfig).not.toThrow();
  });

  it("rejects non-PostgreSQL connection URLs", () => {
    baseEnv();
    process.env.DATABASE_PROVIDER = "postgres";
    process.env.POSTGRES_URL = "https://db.example/kindred";
    expect(validateRuntimeConfig).toThrow(/POSTGRES_URL must use/);
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

describe("OpenAI base URL validation", () => {
  function openaiBaseEnv(): void {
    baseEnv();
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-4";
  }

  function openaiProductionBaseEnv(): void {
    openaiBaseEnv();
    process.env.NODE_ENV = "production";
    process.env.APP_PUBLIC_URL = "https://app.example.com";
    process.env.SUBSCRIPTION_OWNER_IDS = "owner1,owner2";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "test@example.com";
    process.env.AUTH0_DOMAIN = "auth.example.com";
    process.env.AUTH0_AUDIENCE = "https://api.example.com";
  }

  it("rejects invalid URL format for OPENAI_BASE_URL", () => {
    openaiBaseEnv();
    process.env.OPENAI_BASE_URL = "not-a-url";
    expect(validateRuntimeConfig).toThrow(/OPENAI_BASE_URL must be a valid URL/);
  });

  it("rejects non-HTTP URL schemes", () => {
    openaiBaseEnv();
    process.env.OPENAI_BASE_URL = "ftp://api.openai.com/v1";
    expect(validateRuntimeConfig).toThrow(/must use HTTP or HTTPS/);
  });

  it.each([
    "http://api.openai.com/v1",
    "http://127.0.0.1:8080/v1",
  ])("rejects non-HTTPS OPENAI_BASE_URL in production: %s", (url) => {
    openaiProductionBaseEnv();
    process.env.OPENAI_BASE_URL = url;
    expect(validateRuntimeConfig).toThrow(/must use HTTPS in production/);
  });

  it("accepts HTTPS OPENAI_BASE_URL in production", () => {
    openaiProductionBaseEnv();
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    expect(validateRuntimeConfig).not.toThrow();
  });

  it("accepts local HTTP OPENAI_BASE_URL outside production", () => {
    openaiBaseEnv();
    process.env.NODE_ENV = "development";
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:8080/v1";
    expect(validateRuntimeConfig).not.toThrow();
  });

  it("uses default OpenAI endpoint when OPENAI_BASE_URL is unset", () => {
    openaiProductionBaseEnv();
    delete process.env.OPENAI_BASE_URL;
    expect(validateRuntimeConfig).not.toThrow();
  });
});
