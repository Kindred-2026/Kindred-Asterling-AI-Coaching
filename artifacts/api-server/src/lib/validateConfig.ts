import { ANTHROPIC_EFFORTS } from "./ai/anthropicProvider";

export function validateRuntimeConfig(): void {
  const missing: string[] = [];
  const requireValue = (name: string) => {
    if (!process.env[name]?.trim()) missing.push(name);
  };

  requireValue("PORT");
  const databaseProvider = (process.env.DATABASE_PROVIDER || "mongo").trim().toLowerCase();
  if (databaseProvider === "mongo") {
    requireValue("MONGODB_URI");
    requireValue("MONGODB_DATABASE");
    const uri = process.env.MONGODB_URI?.trim();
    if (uri && !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
      throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://");
    }
    const databaseName = process.env.MONGODB_DATABASE?.trim();
    if (databaseName && !/^[A-Za-z0-9_-]{1,63}$/.test(databaseName)) {
      throw new Error(
        "MONGODB_DATABASE must contain only letters, numbers, underscores, or hyphens",
      );
    }
  } else if (databaseProvider === "postgres") {
    requireValue("POSTGRES_URL");
    const uri = process.env.POSTGRES_URL?.trim();
    if (uri && !/^postgres(?:ql):\/\//i.test(uri)) {
      throw new Error("POSTGRES_URL must use postgres:// or postgresql://");
    }
  } else {
    throw new Error("DATABASE_PROVIDER must be either mongo or postgres");
  }
  const aiProvider = (process.env.AI_PROVIDER || "ollama").toLowerCase();
  if (aiProvider === "ollama") {
    requireValue("OLLAMA_BASE_URL");
    requireValue("OLLAMA_MODEL");
  } else if (aiProvider === "anthropic") {
    requireValue("ANTHROPIC_API_KEY");
    const effort = process.env.ANTHROPIC_EFFORT?.trim().toLowerCase();
    if (effort && !ANTHROPIC_EFFORTS.includes(effort as never)) {
      throw new Error(
        `ANTHROPIC_EFFORT must be one of: ${ANTHROPIC_EFFORTS.join(", ")}`,
      );
    }
    validateBaseUrl("ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY");
  } else if (aiProvider === "openai") {
    requireValue("OPENAI_API_KEY");
    requireValue("OPENAI_MODEL");
    validateBaseUrl("OPENAI_BASE_URL", "OPENAI_API_KEY");
  } else if (!["disabled", "none", "off"].includes(aiProvider)) {
    throw new Error(
      "AI_PROVIDER must be one of: anthropic, ollama, openai, disabled",
    );
  }

  if (process.env.NODE_ENV === "production") {
    // An unset AI_PROVIDER falls back to Ollama, which production never runs.
    requireValue("AI_PROVIDER");
    requireValue("APP_PUBLIC_URL");
    requireValue("SUBSCRIPTION_OWNER_IDS");
    requireValue("RESEND_API_KEY");
    requireValue("RESEND_FROM_EMAIL");
    requireValue("AUTH0_DOMAIN");
    requireValue("AUTH0_AUDIENCE");
  }

  if (process.env.HELCIM_PAYMENTS_ENABLED === "true") {
    for (const name of [
      "HELCIM_API_KEY",
      "HELCIM_WEBHOOK_SECRET",
      "HELCIM_CUSTOMER_REFERENCE_SECRET",
      "HELCIM_YEARLY_PLAN_ID",
      "HELCIM_YEARLY_CHECKOUT_URL",
      "HELCIM_LIFETIME_CHECKOUT_URL",
      "HELCIM_LIFETIME_INVOICE_PREFIX",
      "HELCIM_PORTAL_URL",
    ]) {
      requireValue(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required runtime configuration: ${[...new Set(missing)].join(", ")}`,
    );
  }
}

function validateBaseUrl(name: string, credentialName: string): void {
  const value = process.env[name]?.trim();
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(
      `${name} must use HTTPS in production (${credentialName} would be sent over plaintext)`,
    );
  }
}
