"use server";
import { headers } from "next/headers";
import { validateRsvp } from "@/lib/rsvp/rsvp-validation";
import { accessSchema, initializePurchase, readPurchase, ticketFailure, ticketRpc } from "@/lib/tickets/server";
import { clientIp, rateLimitKey } from "@/lib/rsvp/rsvp-rate-limit";
import type { TicketSession, PurchaseStatus } from "@/lib/tickets/types";

export async function initializeTicket(eventSlug: string, credential: string, formData: FormData): Promise<TicketSession> {
  if (!accessSchema.safeParse(credential).success || formData.get("website")) {
    return { status: "error", message: "Please refresh and try again." };
  }
  const buyer = validateRsvp(formData, false);
  if (!buyer.success) return { status: "error", message: buyer.error.issues[0]?.message ?? "Check your attendee details." };
  try {
    const ip = clientIp(await headers(), { vercel: process.env.VERCEL, trustedHeader: process.env.RSVP_TRUSTED_IP_HEADER });
    for (const [scope, value] of [["global", "all"], ["ip", ip], ["phone", buyer.data.phone]] as const) {
      const retry = await ticketRpc("consume_rsvp_rate_limit", {
        p_scope: scope, p_key_hash: rateLimitKey(scope, value, process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""),
      });
      if (typeof retry !== "number") throw new Error("Rate limiter unavailable");
      if (retry > 0) return { status: "error", message: "Too many attempts. Please wait a few minutes and try again." };
    }
    return await initializePurchase(eventSlug, buyer.data, credential);
  } catch (error) { return { status: "error", message: ticketFailure("initialize", error) }; }
}
export async function ticketStatus(eventSlug: string, credential: string): Promise<PurchaseStatus | null> {
  if (!accessSchema.safeParse(credential).success) return null;
  try { return await readPurchase(eventSlug, credential); }
  catch (error) { ticketFailure("status", error); return null; }
}
