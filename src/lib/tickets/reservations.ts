import "server-only";
import { z } from "zod";
import { getStripe } from "./stripe";
import { cancelUnpaidOrderPayment, type PendingOrder } from "./payment";
import { ticketRpc, ticketFailure } from "./server";

const reservationSchema = z.object({
  order_id: z.uuid(),
  event_id: z.uuid(),
  ticket_type_id: z.uuid(),
  amount_cents: z.number().int().positive(),
  currency: z.literal("usd"),
  payment_intent_id: z.string().nullable(),
  payment_attempt: z.number().int().nonnegative(),
  payment_attempt_started_at: z.string(),
  status: z.literal("pending"),
});
// No timer alone releases inventory. The old payment must be irreversibly canceled
// before the database compare-and-swap can make its place available again.
export async function cleanupExpiredReservations(slug: string) {
  try {
    const rows = z.array(reservationSchema).parse(await ticketRpc("get_expired_ticket_reservations", { p_event_slug: slug }));
    if (!rows.length) return;
    const stripe = getStripe();
    await Promise.all(
      rows.map(async (order) => {
        try {
          if (!order.payment_intent_id && Date.parse(order.payment_attempt_started_at) < Date.now() - 23 * 60 * 60 * 1000) throw new Error("Ambiguous old payment requires reconciliation");
          const intent = await cancelUnpaidOrderPayment(order as PendingOrder, stripe);
          if (intent.status !== "canceled") return; // Succeeded/processing keeps its place for webhook fulfillment.
          await ticketRpc("release_ticket_reservation", { p_order_id: order.order_id, p_expected_attempt: order.payment_attempt, p_canceled_intent_id: intent.id });
        } catch (error) {
          ticketFailure("reservation.cleanup", error);
        }
      }),
    );
  } catch (error) {
    ticketFailure("reservation.cleanup", error);
  }
}

export async function cancelCheckout(slug: string, credential: string): Promise<"canceled" | "paid" | "processing"> {
  const { accessHash } = await import("./server");
  const args = { p_event_slug: slug, p_access_hash: accessHash(credential) };
  const data = await ticketRpc("get_ticket_checkout_for_cancellation", args);
  if (data === null || data?.status === "canceled") return "canceled";
  if (data?.status === "paid") return "paid";
  const order = reservationSchema.parse(data);
  if (!order.payment_intent_id && Date.parse(order.payment_attempt_started_at) < Date.now() - 23 * 60 * 60 * 1000) throw new Error("Ambiguous old payment requires reconciliation");
  const intent = await cancelUnpaidOrderPayment(order, getStripe());
  if (intent.status === "succeeded") return "paid";
  if (intent.status === "processing") return "processing";
  if (intent.status !== "canceled") throw new Error("Stripe cancellation not confirmed");
  const released = await ticketRpc("cancel_ticket_checkout", { ...args, p_expected_attempt: order.payment_attempt, p_canceled_intent_id: intent.id });
  if (released !== true) throw new Error("Cancellation changed concurrently; check payment status");
  return "canceled";
}
