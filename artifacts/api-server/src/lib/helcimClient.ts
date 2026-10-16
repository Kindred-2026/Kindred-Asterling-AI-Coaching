import crypto from "node:crypto";
import { logger } from "./logger";
import { ProviderRequestError, providerHttpError } from "./retry";

const API_ROOT = "https://api.helcim.com/v2";

function apiKey(): string {
  const value = process.env.HELCIM_API_KEY;
  if (!value) throw new Error("HELCIM_API_KEY is not configured");
  return value;
}

export function isHelcimConfigured(): boolean {
  return Boolean(process.env.HELCIM_API_KEY);
}

export function isCheckoutConfigured(): boolean {
  return Boolean(
    process.env.HELCIM_API_KEY && process.env.HELCIM_CUSTOMER_REFERENCE_SECRET,
  );
}

/** A non-PII, authenticated merchant customerCode. */
export function signedCustomerReference(userId: string): string {
  const secret = process.env.HELCIM_CUSTOMER_REFERENCE_SECRET;
  if (!secret)
    throw new Error("HELCIM_CUSTOMER_REFERENCE_SECRET is not configured");
  const encoded = Buffer.from(userId).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url")
    .slice(0, 22);
  return `ka_${encoded}.${signature}`;
}

export function verifyCustomerReference(value: string): string | null {
  if (!value.startsWith("ka_") || !process.env.HELCIM_CUSTOMER_REFERENCE_SECRET)
    return null;
  const [encoded, supplied] = value.slice(3).split(".");
  if (!encoded || !supplied) return null;
  const expected = crypto
    .createHmac("sha256", process.env.HELCIM_CUSTOMER_REFERENCE_SECRET)
    .update(encoded)
    .digest("base64url")
    .slice(0, 22);
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return null;
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export async function createHelcimCustomer(user: {
  id: string;
  email: string | null;
}): Promise<string> {
  const customerCode = signedCustomerReference(user.id);
  const response = await fetch(`${API_ROOT}/customers`, {
    method: "POST",
    headers: {
      "api-token": apiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      customerCode,
      contactName: user.email ?? `Kindred user ${user.id}`,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`Helcim customer creation failed (${response.status})`);
  const json = (await response.json()) as Record<string, unknown>;
  const data = (json.data ?? json) as Record<string, unknown>;
  const id = data.customerCode ?? data.customerId ?? data.id;
  if (typeof id !== "string" && typeof id !== "number")
    throw new Error("Helcim customer response did not include an ID");
  return String(id);
}

export function checkoutUrl(base: string, customerId: string): string {
  const url = new URL(base);
  // Helcim calls its immutable merchant customer identifier customerCode.
  url.searchParams.set("customerCode", customerId);
  return url.toString();
}

export function verifyHelcimWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
): boolean {
  const secret = process.env.HELCIM_WEBHOOK_SECRET;
  const id = headers["webhook-id"],
    timestamp = headers["webhook-timestamp"],
    signature = headers["webhook-signature"];
  if (
    !secret ||
    !id ||
    !timestamp ||
    !signature ||
    !Number.isFinite(Number(timestamp))
  )
    return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto
    .createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();
  return signature.split(" ").some((item) => {
    const [version, encoded] = item.split(",");
    if (version !== "v1" || !encoded) return false;
    const candidate = Buffer.from(encoded, "base64");
    return (
      candidate.length === expected.length &&
      crypto.timingSafeEqual(candidate, expected)
    );
  });
}

export const subscriptionStatuses = [
  "pending",
  "active",
  "past_due",
  "cancel_at_period_end",
  "cancelled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type HelcimEventType =
  | "checkout.completed"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "subscription.expired"
  | "invoice.paid"
  | "invoice.payment_failed";

export interface HelcimWebhookEvent {
  eventType: HelcimEventType;
  customerId?: string;
  customerEmail?: string;
  subscriptionId?: string;
  occurredAt: Date;
  data: Record<string, unknown>;
}

export function parseHelcimEvent(
  body: Record<string, unknown>,
): HelcimWebhookEvent {
  const data = (body.data ?? {}) as Record<string, unknown>;
  const customer = (data.customer ?? body.customer ?? {}) as Record<
    string,
    unknown
  >;
  const rawDate =
    body.createdAt ?? body.timestamp ?? data.occurredAt ?? data.updatedAt;
  const occurredAt = rawDate
    ? new Date(rawDate as string | number)
    : new Date();
  return {
    eventType: String(
      body.eventType ?? body.event_type ?? body.type ?? "",
    ) as HelcimEventType,
    customerId:
      String(
        customer.customerCode ??
          customer.id ??
          data.customerCode ??
          data.customerId ??
          "",
      ) || undefined,
    customerEmail:
      String(customer.email ?? data.customerEmail ?? data.email ?? "") ||
      undefined,
    subscriptionId:
      String(data.subscriptionId ?? data.subscription_id ?? data.id ?? "") ||
      undefined,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    data,
  };
}

export async function getHelcimCustomerEmail(
  customerId: string,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_.-]{1,256}$/.test(customerId)) return null;
  try {
    const response = await fetch(
      `${API_ROOT}/customers/${encodeURIComponent(customerId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as { data?: { email?: string } };
    return json.data?.email ?? null;
  } catch (err) {
    logger.error({ err }, "Helcim customer lookup failed");
    return null;
  }
}

export type HelcimCancellationOutcome =
  | "cancelled"
  | "already_gone"
  | "not_customer_subscription";

function helcimRequestHeaders(): Record<string, string> {
  return { "api-token": apiKey(), Accept: "application/json" };
}

/**
 * Stops a customer's recurring billing by deleting the Helcim subscription.
 * The stored ID can come from a webhook's generic `data.id`, so it is first
 * confirmed to be a subscription belonging to `customerCode`; another
 * customer's subscription is never deleted. A missing one is already stopped.
 */
export async function cancelHelcimSubscription(
  subscriptionId: string,
  customerCode: string | null,
): Promise<HelcimCancellationOutcome> {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(subscriptionId)) {
    throw new ProviderRequestError(
      "Helcim subscription ID is malformed",
      null,
      false,
    );
  }
  const url = `${API_ROOT}/subscriptions/${encodeURIComponent(subscriptionId)}`;
  const lookup = await fetch(url, {
    headers: helcimRequestHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (lookup.status === 404) return "already_gone";
  if (!lookup.ok)
    throw providerHttpError("Helcim subscription lookup", lookup.status);
  const json = (await lookup.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const body = json.data ?? json;
  const subscription = (Array.isArray(body) ? (body[0] ?? {}) : body) as Record<
    string,
    unknown
  >;
  const owners = [subscription.customerCode, subscription.customerId]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map(String);
  // If Helcim does not say who owns it, cancel anyway: leaving a user billed
  // after they deleted their account is the worse failure.
  if (customerCode && owners.length > 0 && !owners.includes(customerCode)) {
    return "not_customer_subscription";
  }
  const response = await fetch(url, {
    method: "DELETE",
    headers: helcimRequestHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return "already_gone";
  if (!response.ok)
    throw providerHttpError("Helcim subscription cancellation", response.status);
  return "cancelled";
}
