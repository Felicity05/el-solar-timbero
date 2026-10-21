import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type Stripe from "stripe";
import { getSupabaseServer } from "../supabase/server";
import { getStripe } from "./stripe";
import { cancelUnpaidOrderPayment, retrieveOrderPayment } from "./payment";
import { ticketUrl } from "./config";
import type { TicketSession, PurchaseStatus, TicketDisplay } from "./types";

export const accessSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const accessHash = (value: string) => createHash("sha256").update(value).digest("hex");
const pendingSchema = z.object({
  status: z.enum(["pending", "recovery_required"]),
  order_id: z.uuid(),
  event_id: z.uuid(),
  ticket_type_id: z.uuid(),
  amount_cents: z.number().int().positive(),
  currency: z.literal("usd"),
  payment_intent_id: z.string().nullable(),
  payment_attempt: z.number().int().nonnegative().optional(),
});
class TicketRpcError extends Error {
  constructor(
    readonly rpc: string,
    readonly code: string,
  ) {
    super("Ticket database operation failed");
  }
}
export async function ticketRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await getSupabaseServer().rpc(name, args);
  if (error) throw new TicketRpcError(name, /^[A-Z0-9_]{1,40}$/.test(error.code ?? "") ? error.code : "UNKNOWN");
  return data;
}
export function ticketFailure(operation: string, error: unknown) {
  const reference = randomUUID();
  // No raw errors, payloads, keys, client secrets or attendee data in logs.
  console.error(
    "[tickets]",
    JSON.stringify({
      operation,
      reference,
      type: error instanceof Error ? error.constructor.name : "Unknown",
      rpc: error instanceof TicketRpcError ? error.rpc : undefined,
      code: error instanceof TicketRpcError ? error.code : undefined,
    }),
  );
  return `We couldn’t complete this request. Please try again. Reference: ${reference}.`;
}
export async function initializePurchase(
  slug: string,
  buyer: {
    name: string;
    phone: string;
    email: string;
    referralSource: string;
  },
  credential: string,
): Promise<TicketSession> {
  // Validate Stripe configuration before reserving a unique order.
  const stripe = getStripe();
  const hash = accessHash(credential);
  const args = {
    p_event_slug: slug,
    p_name: buyer.name,
    p_email: buyer.email,
    p_phone: buyer.phone,
    p_referral_source: buyer.referralSource,
    p_access_hash: hash,
  };
  let data = await ticketRpc("initialize_ticket_order", args);
  if (data?.status === "already_purchased") return { status: "already_purchased" };
  if (data?.status === "closed") return { status: "closed" };
  if (data?.status === "pending_elsewhere")
    return {
      status: "error",
      message: "This unpaid purchase was started in another browser. Purchase recovery is temporarily unavailable. Use the original browser or contact @el_solar_timbero for help.",
    };
  if (!["pending", "recovery_required"].includes(data?.status))
    return {
      status: "error",
      message: data?.status === "closed" ? "Ticket sales are closed for this event." : "This purchase needs assistance. If you already paid, please don’t pay again. Contact @el_solar_timbero.",
    };
  let order = pendingSchema.parse(data);
  let intent = await retrieveOrderPayment({ ...order, status: "pending" }, stripe);
  const owned = order.status === "pending";
  const recoveryAvailable = order.payment_attempt !== undefined;
  if (intent.status === "succeeded") return owned ? { status: "processing", paymentReceived: true } : { status: "already_purchased" };
  if (intent.status === "processing") return owned ? { status: "processing", paymentReceived: false } : { status: "checking" };
  const cardOnly = intent.payment_method_types.length === 1 && intent.payment_method_types[0] === "card";
  if (!owned || intent.status === "canceled" || !cardOnly) {
    // During migration rollout, old databases must remain usable for new buyers.
    // Do not cancel a payment unless the recovery schema is actually installed.
    if (!recoveryAvailable)
      return {
        status: "error",
        message: "This payment session needs recovery, which is temporarily unavailable. Please contact @el_solar_timbero for help.",
      };
    // Never reveal or reuse an unknown browser's client secret or saved card.
    // Stripe cancellation happens first, so the old session cannot charge later.
    intent = await cancelUnpaidOrderPayment({ ...order, status: "pending", payment_intent_id: intent.id }, stripe);
    if (intent.status === "succeeded") return owned ? { status: "processing", paymentReceived: true } : { status: "already_purchased" };
    if (intent.status === "processing") return { status: "checking" };
    if (intent.status !== "canceled") throw new Error("Unconfirmed cancellation");
    const recovered = await ticketRpc("recover_ticket_order", {
      p_order_id: order.order_id,
      p_expected_attempt: order.payment_attempt,
      p_canceled_intent_id: intent.id,
      p_access_hash: hash,
      p_name: buyer.name,
      p_email: buyer.email,
      p_phone: buyer.phone,
      p_referral_source: buyer.referralSource,
    });
    // Another recovery or webhook won the lock. Recheck on the next request;
    // do not cancel that winner's replacement in a retry loop.
    if (recovered !== true) return { status: "checking" };
    data = await ticketRpc("initialize_ticket_order", args);
    if (data?.status === "already_purchased") return { status: "already_purchased" };
    if (data?.status !== "pending") return { status: "checking" };
    order = pendingSchema.parse(data);
    intent = await retrieveOrderPayment({ ...order, status: "pending" }, stripe);
  }
  if (intent.status === "succeeded") return { status: "processing", paymentReceived: true };
  if (intent.status === "processing") return { status: "processing", paymentReceived: false };
  if (intent.status === "canceled" || intent.payment_method_types.length !== 1 || intent.payment_method_types[0] !== "card") {
    throw new Error("Payment session unavailable");
  }
  const attached = await ticketRpc("attach_ticket_payment_intent", {
    p_order_id: order.order_id,
    p_access_hash: hash,
    p_intent_id: intent.id,
    // Preserve the original three-argument RPC on pre-recovery databases. An
    // explicit attempt=0 from the new RPC still requires the guarded signature.
    ...(order.payment_attempt === undefined ? {} : { p_attempt: order.payment_attempt }),
  });
  if (attached !== true) return { status: "checking" };
  if (!intent.client_secret) throw new Error("Missing client secret");
  return {
    status: "ready",
    clientSecret: intent.client_secret,
    amountCents: order.amount_cents,
    currency: order.currency,
  };
}
const purchaseSchema = z.object({
  ticket_token: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  status: z.enum(["pending", "paid", "refunded", "void"]),
  ticket_code: z.string().nullable(),
  ticket_status: z.string().nullable(),
  event_name: z.string(),
  event_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  timezone: z.string(),
  venue_name: z.string(),
  venue_address: z.string(),
  ticket_type: z.string(),
  amount_cents: z.number().int(),
  currency: z.string(),
});
export async function readPurchase(slug: string, credential: string): Promise<PurchaseStatus | null> {
  const data = await ticketRpc("get_ticket_purchase", {
    p_event_slug: slug,
    p_access_hash: accessHash(credential),
  });
  if (data === null) return null;
  const { ticket_token, ...purchase } = purchaseSchema.parse(data);
  return {
    ...purchase,
    ticket_url: ticket_token && purchase.status === "paid" && purchase.ticket_status === "valid" ? ticketUrl(ticket_token) : null,
  };
}
const ticketDisplaySchema = purchaseSchema.omit({ status: true, ticket_status: true }).extend({
  ticket_token: z.string().regex(/^[a-f0-9]{64}$/),
  ticket_code: z.string(),
});
export async function readTicket(token: string): Promise<TicketDisplay | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const data = await ticketRpc("get_ticket_by_token", { p_token: token });
  if (data === null) return null;
  const { ticket_token, ...ticket } = ticketDisplaySchema.parse(data);
  return { ...ticket, ticket_url: ticketUrl(ticket_token) };
}
export async function fulfillStripeEvent(event: Stripe.Event) {
  if (!["payment_intent.succeeded", "payment_intent.payment_failed"].includes(event.type)) return;
  const intent = event.data.object as Stripe.PaymentIntent;
  // Ignore unrelated account payments. Partial/forged association must fail, not be acknowledged.
  if (!intent.metadata.order_id) return;
  const ids = z.object({ order_id: z.uuid(), event_id: z.uuid(), ticket_type_id: z.uuid() }).parse(intent.metadata);
  if (event.type === "payment_intent.succeeded" && (intent.status !== "succeeded" || intent.amount_received !== intent.amount)) throw new Error("Payment incomplete");
  await ticketRpc("process_ticket_payment", {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_order_id: ids.order_id,
    p_event_id: ids.event_id,
    p_ticket_type_id: ids.ticket_type_id,
    p_intent_id: intent.id,
    p_amount: intent.amount,
    p_currency: intent.currency,
    p_payment_status: intent.status,
    p_ticket_token: randomBytes(32).toString("hex"),
    p_ticket_code: `EST-${randomBytes(6).toString("hex").toUpperCase()}`,
  });
}
