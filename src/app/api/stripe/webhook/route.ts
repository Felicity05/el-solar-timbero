import { getStripe } from "@/lib/tickets/stripe";
import { fulfillStripeEvent, ticketFailure } from "@/lib/tickets/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    ticketFailure("webhook.configuration", new Error("Webhook secret missing"));
    return Response.json({ error: "Webhook unavailable" }, { status: 503 });
  }
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });
  let event;
  try {
    // MUST remain raw text: parsing JSON first invalidates signature verification.
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch { return Response.json({ error: "Invalid signature" }, { status: 400 }); }
  const liveAllowed = process.env.STRIPE_LIVE_MODE === "true" && process.env.NODE_ENV === "production";
  if (event.livemode && !liveAllowed) return Response.json({ error: "Live mode disabled" }, { status: 400 });
  try {
    await fulfillStripeEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    ticketFailure("webhook.fulfillment", error);
    return Response.json({ error: "Fulfillment failed; retry required" }, { status: 500 });
  }
}
