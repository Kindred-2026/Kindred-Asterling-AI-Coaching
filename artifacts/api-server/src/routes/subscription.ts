import { Router, type IRouter, type Request } from "express";
import {
  DatabaseLeaseUnavailableError,
  and,
  eq,
  isNull,
  withDatabaseLease,
} from "@workspace/db";
import {
  db,
  usersTable,
  subscriptionsTable,
  processedWebhooksTable,
  entitlementAuditTable,
} from "@workspace/db";
import {
  GetSubscriptionStatusResponse,
  CreateCheckoutBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { resolveSubscription } from "../lib/subscriptionService";
import { logger } from "../lib/logger";
import {
  checkoutUrl,
  createHelcimCustomer,
  getHelcimCustomerEmail,
  isCheckoutConfigured,
  parseHelcimEvent,
  verifyCustomerReference,
  verifyHelcimWebhook,
  type HelcimEventType,
  type SubscriptionStatus,
} from "../lib/helcimClient";

const allowedEvents = new Set<HelcimEventType>([
  "checkout.completed",
  "subscription.created",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.expired",
  "invoice.paid",
  "invoice.payment_failed",
]);

function periodEnd(data: Record<string, unknown>): Date | null {
  const raw =
    data.currentPeriodEnd ??
    data.current_period_end ??
    data.periodEnd ??
    data.period_end ??
    data.renewalDate ??
    data.dateBilling;
  if (!raw) return null;
  const value = new Date(raw as string | number);
  return Number.isNaN(value.getTime()) ? null : value;
}

function statusFor(
  type: HelcimEventType,
  end: Date | null,
): SubscriptionStatus {
  if (type === "invoice.payment_failed") return "past_due";
  if (type === "subscription.expired") return "expired";
  if (type === "subscription.cancelled")
    return end && end.getTime() > Date.now()
      ? "cancel_at_period_end"
      : "cancelled";
  return "active";
}

const router: IRouter = Router();

router.get(
  "/subscription/status",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.user!;
    const status = await resolveSubscription(
      { id: user.id, email: user.email, emailVerified: user.emailVerified },
      { forceRefresh: true },
    );
    res.json(
      GetSubscriptionStatusResponse.parse({ ...status, subscribeUrl: null }),
    );
  },
);

router.post(
  "/subscription/checkout",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = CreateCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!isCheckoutConfigured()) {
      res.status(503).json({ error: "Checkout is not configured yet." });
      return;
    }
    const base =
      parsed.data.planType === "yearly"
        ? process.env.HELCIM_YEARLY_CHECKOUT_URL
        : process.env.HELCIM_LIFETIME_CHECKOUT_URL;
    if (!base) {
      res.status(503).json({
        error: `No checkout URL configured for ${parsed.data.planType} plan.`,
      });
      return;
    }

    try {
      const customerId = await withDatabaseLease(
        "helcim-checkout",
        req.user!.id,
        60_000,
        async () => {
          const [existing] = await db
            .select()
            .from(subscriptionsTable)
            .where(eq(subscriptionsTable.userId, req.user!.id))
            .limit(1);
          if (existing?.paymentCustomerId) return existing.paymentCustomerId;
          const created = await createHelcimCustomer({
            id: req.user!.id,
            email: req.user!.email ?? null,
          });
          await db
            .insert(subscriptionsTable)
            .values({
              userId: req.user!.id,
              email: req.user!.email,
              status: "pending",
              paymentCustomerId: created,
              lastCheckedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: subscriptionsTable.userId,
              set: {
                paymentCustomerId: created,
                email: req.user!.email,
                status: "pending",
                lastCheckedAt: new Date(),
              },
              setWhere: isNull(subscriptionsTable.paymentCustomerId),
            });
          const [saved] = await db
            .select({ id: subscriptionsTable.paymentCustomerId })
            .from(subscriptionsTable)
            .where(eq(subscriptionsTable.userId, req.user!.id));
          if (!saved?.id)
            throw new Error("Unable to persist Helcim customer ID");
          return saved.id;
        },
      );
      res.json({ checkoutUrl: checkoutUrl(base, customerId) });
    } catch (err) {
      if (err instanceof DatabaseLeaseUnavailableError) {
        res.status(409).json({ error: "Checkout is already being prepared." });
        return;
      }
      logger.error(
        { err, userId: req.user!.id },
        "Helcim checkout initiation failed",
      );
      res.status(502).json({ error: "Unable to initiate checkout." });
    }
  },
);

router.post("/payment/webhook", async (req, res): Promise<void> => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const body = rawBody
    ? rawBody.toString("utf8")
    : JSON.stringify(req.body ?? {});
  const webhookId = req.header("webhook-id");
  const timestamp = req.header("webhook-timestamp");
  const signature = req.header("webhook-signature");
  if (!webhookId || !timestamp || !signature) {
    res.json({ received: true });
    return;
  }
  try {
    const event = parseHelcimEvent(req.body);
    if (!allowedEvents.has(event.eventType) || !event.customerId)
      throw new Error("Unsupported or uncorrelated Helcim event");
    const customerId = event.customerId;
    if (
      !verifyHelcimWebhook(body, {
        "webhook-id": webhookId,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
      })
    ) {
      throw new InvalidWebhookSignatureError();
    }
    const referencedUser = verifyCustomerReference(customerId);
    const [knownSubscription] = await db
      .select({ userId: subscriptionsTable.userId })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.paymentCustomerId, customerId))
      .limit(1);
    const fallbackEmail =
      !knownSubscription &&
      !referencedUser &&
      process.env.HELCIM_EMAIL_MIGRATION_FALLBACK === "true"
        ? (event.customerEmail ?? (await getHelcimCustomerEmail(customerId)))
        : null;
    const result = await db.transaction(async (tx) => {
      // Claim first, but the claim rolls back with every other effect on failure.
      const [claim] = await tx
        .insert(processedWebhooksTable)
        .values({ webhookId, eventType: event.eventType })
        .onConflictDoNothing({ target: processedWebhooksTable.webhookId })
        .returning();
      if (!claim) return "duplicate" as const;
      let [subscription] = await tx
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.paymentCustomerId, customerId))
        .limit(1);

      // Controlled migration only: signed customer reference, then explicitly-enabled legacy email matching.
      if (!subscription) {
        let userId = referencedUser;
        if (fallbackEmail) {
          const legacyUserIds = await tx.findUsersByEmail(fallbackEmail.trim(), 2);
          userId = legacyUserIds.length === 1 ? legacyUserIds[0]! : null;
        }
        if (!userId) throw new Error("No internal user for Helcim customer");
        const [user] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        if (!user) throw new Error("Referenced internal user does not exist");
        [subscription] = await tx
          .insert(subscriptionsTable)
          .values({
            userId: user.id,
            email: user.email,
            status: "pending",
            paymentCustomerId: customerId,
          })
          .onConflictDoUpdate({
            target: subscriptionsTable.userId,
            set: { paymentCustomerId: customerId },
            setWhere: isNull(subscriptionsTable.paymentCustomerId),
          })
          .returning();
      }
      if (!subscription) throw new Error("Unable to correlate subscription");

      const end = periodEnd(event.data);
      const status = statusFor(event.eventType, end);
      const reordered = Boolean(
        subscription.providerEventAt &&
        event.occurredAt <= subscription.providerEventAt,
      );
      if (!reordered) {
        await tx
          .update(subscriptionsTable)
          .set({
            status,
            paymentSubscriptionId:
              event.subscriptionId ?? subscription.paymentSubscriptionId,
            currentPeriodEnd: end,
            providerEventAt: event.occurredAt,
            lastCheckedAt: new Date(),
          })
          .where(
            and(
              eq(subscriptionsTable.userId, subscription.userId),
              eq(subscriptionsTable.paymentCustomerId, customerId),
            ),
          );
      }
      await tx.insert(entitlementAuditTable).values({
        userId: subscription.userId,
        action: `helcim_${event.eventType}`,
        metadata: {
          webhookId,
          customerId: event.customerId,
          subscriptionId: event.subscriptionId,
          status,
          reordered,
          occurredAt: event.occurredAt.toISOString(),
        },
      });
      return reordered ? ("reordered" as const) : ("processed" as const);
    });
    logger.info({ webhookId, result }, "Helcim webhook handled");
    res.json({ received: true });
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    logger.error({ err, webhookId }, "Helcim webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

class InvalidWebhookSignatureError extends Error {}

export default router;
