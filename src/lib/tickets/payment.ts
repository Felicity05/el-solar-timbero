import type Stripe from "stripe";

export type PendingOrder = {
  status: "pending";
  order_id: string;
  event_id: string;
  ticket_type_id: string;
  amount_cents: number;
  currency: string;
  payment_intent_id: string | null;
  payment_attempt?: number;
};
// The current Stripe API removed payment_method_types. Scope compatibility to
// creation so this MVP can explicitly select cards without changing SDK versions.
export const cardPaymentApiVersion = "2026-08-26.dahlia";

// Kept independent of Next/Supabase so retry and tampering behavior can be tested.
export async function retrieveOrderPayment(order: PendingOrder, stripe: Pick<Stripe, "paymentIntents">) {
  const params: Stripe.PaymentIntentCreateParams & { payment_method_types: ["card"] } = {
    amount: order.amount_cents,
    currency: order.currency,
    payment_method_types: ["card"],
    metadata: {
      order_id: order.order_id,
      event_id: order.event_id,
      ticket_type_id: order.ticket_type_id,
    },
  };
  const intent = order.payment_intent_id
    ? await stripe.paymentIntents.retrieve(order.payment_intent_id)
    : await stripe.paymentIntents.create(params, {
        idempotencyKey: `ticket-order:${order.order_id}:v1${order.payment_attempt ? `:attempt:${order.payment_attempt}` : ""}`,
        apiVersion: cardPaymentApiVersion,
      });
  if (
    intent.amount !== order.amount_cents ||
    intent.currency !== order.currency ||
    intent.metadata.order_id !== order.order_id ||
    intent.metadata.event_id !== order.event_id ||
    intent.metadata.ticket_type_id !== order.ticket_type_id
  )
    throw new Error("Payment association mismatch");
  return intent;
}

export async function cancelUnpaidOrderPayment(order: PendingOrder, stripe: Pick<Stripe, "paymentIntents">) {
  let intent = await retrieveOrderPayment(order, stripe);
  if (intent.status === "canceled" || intent.status === "succeeded" || intent.status === "processing") return intent;
  if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
    throw new Error("Payment cannot safely be restarted");
  }
  try {
    intent = await stripe.paymentIntents.cancel(intent.id, {
      cancellation_reason: "abandoned",
    });
  } catch (error) {
    // A concurrent confirmation/cancellation can win. Read Stripe again; never
    // rotate database ownership based on an earlier, stale unpaid status.
    const current = await retrieveOrderPayment({ ...order, payment_intent_id: intent.id }, stripe);
    if (!["canceled", "succeeded", "processing"].includes(current.status)) throw error;
    intent = current;
  }
  return intent;
}

export async function paymentForOrder(order: PendingOrder, stripe: Pick<Stripe, "paymentIntents">) {
  const intent = await retrieveOrderPayment(order, stripe);
  if (intent.status === "canceled") throw new Error("Payment unavailable");
  // Stripe does not let dynamic-method intents switch to explicit methods.
  // Never replace one silently or expose its noncompliant payment session.
  // Already processing/succeeded payments must still finish via the webhook.
  if (!["succeeded", "processing"].includes(intent.status) && (intent.payment_method_types.length !== 1 || intent.payment_method_types[0] !== "card")) {
    throw new Error("Existing payment session is not card-only; reconciliation required");
  }
  if (!intent.client_secret) throw new Error("Missing client secret");
  return intent;
}
