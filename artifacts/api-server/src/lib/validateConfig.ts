export function validateRuntimeConfig(): void {
  const missing: string[] = [];
  const requireValue = (name: string) => {
    if (!process.env[name]?.trim()) missing.push(name);
  };

  requireValue("MONGODB_URI");
  requireValue("MONGODB_DATABASE");
  requireValue("PORT");
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
  const aiProvider = (process.env.AI_PROVIDER || "ollama").toLowerCase();
  if (aiProvider === "ollama") {
    requireValue("OLLAMA_BASE_URL");
    requireValue("OLLAMA_MODEL");
  } else if (aiProvider === "openai") {
    requireValue("OPENAI_API_KEY");
    requireValue("OPENAI_MODEL");
  } else if (!["disabled", "none", "off"].includes(aiProvider)) {
    throw new Error(
      "AI_PROVIDER must be one of: ollama, openai, disabled",
    );
  }

  if (process.env.NODE_ENV === "production") {
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

  // Calendar OAuth is retired. Retain CALENDAR_TOKEN_ENCRYPTION_KEY only
  // for best-effort revocation of existing connections; it is not a startup gate.

  if (missing.length > 0) {
    throw new Error(
      `Missing required runtime configuration: ${[...new Set(missing)].join(", ")}`,
    );
  }
}
