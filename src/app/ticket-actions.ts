"use server";
import { headers } from "next/headers";
import { validateRsvp } from "@/lib/rsvp/rsvp-validation";
import { validateTicketAttendee } from "@/lib/tickets/promotion";
import { getAvailableRsvpEvents } from "@/lib/rsvp/rsvp-event";
import { accessSchema, initializePurchase, readPurchase, ticketFailure, ticketRpc } from "@/lib/tickets/server";
import { clientIp, rateLimitKey } from "@/lib/rsvp/rsvp-rate-limit";
import type { TicketSession, PurchaseStatus } from "@/lib/tickets/types";

export async function initializeTicket(eventSlug: string, credential: string, formData: FormData): Promise<TicketSession> {
  if (!accessSchema.safeParse(credential).success || formData.get("website")) {
    return { status: "error", message: "Please refresh and try again." };
  }
  const buyer = validateRsvp(formData, false);
  if (!buyer.success)
    return {
      status: "error",
      message: buyer.error.issues[0]?.message ?? "Check your attendee details.",
    };
  try {
    const ip = clientIp(await headers(), {
      vercel: process.env.VERCEL,
      trustedHeader: process.env.RSVP_TRUSTED_IP_HEADER,
    });
    for (const [scope, value] of [
      ["global", "all"],
      ["ip", ip],
      ["phone", buyer.data.phone],
    ] as const) {
      const retry = await ticketRpc("consume_rsvp_rate_limit", {
        p_scope: scope,
        p_key_hash: rateLimitKey(scope, value, process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""),
      });
      if (typeof retry !== "number") throw new Error("Rate limiter unavailable");
      if (retry > 0)
        return {
          status: "error",
          message: "Too many attempts. Please wait a few minutes and try again.",
        };
    }
    const event = (await getAvailableRsvpEvents()).find((item) => item.slug === eventSlug && item.admission_mode === "ticketed");
    if (!event || (!event.open && !event.sold_out)) {
      return { status: "closed" };
    }
    const submission = validateTicketAttendee(formData, event.disclaimer_version);
    if (!submission.success) {
      return { status: "error", message: submission.error.issues[0]?.message ?? "Please acknowledge the gift-card offer." };
    }
    return await initializePurchase(eventSlug, { ...submission.data, disclaimerVersion: event.disclaimer_version }, credential);
  } catch (error) {
    return { status: "error", message: ticketFailure("initialize", error) };
  }
}
export async function ticketStatus(eventSlug: string, credential: string): Promise<PurchaseStatus | null> {
  if (!accessSchema.safeParse(credential).success) return null;
  try {
    return await readPurchase(eventSlug, credential);
  } catch (error) {
    ticketFailure("status", error);
    return null;
  }
}

// Read-only availability check immediately before Stripe confirmation; price and
// order creation still belong to the existing transactional initialization RPC.
export async function checkTicketSales(slug: string, credential?: string): Promise<"open" | "closed" | "unavailable" | "expired" | "sold_out"> {
  try {
    if (credential && accessSchema.safeParse(credential).success) {
      const { accessHash } = await import("@/lib/tickets/server");
      const status = await ticketRpc("check_ticket_reservation", { p_event_slug: slug, p_access_hash: accessHash(credential) });
      if (["open", "closed", "expired"].includes(status)) return status;
      throw new Error("Invalid reservation response");
    }
    const { getAvailableRsvpEvents } = await import("@/lib/rsvp/rsvp-event");
    const event = (await getAvailableRsvpEvents()).find((item) => item.slug === slug && item.admission_mode === "ticketed");
    if (event?.open) return "open";
    return event?.sold_out ? "sold_out" : "closed";
  } catch (error) {
    ticketFailure("sales.check", error);
    return "unavailable";
  }
}

export async function cancelTicketCheckout(eventSlug: string, credential: string): Promise<"canceled" | "paid" | "processing" | "error"> {
  if (!accessSchema.safeParse(credential).success) return "error";
  try {
    const { cancelCheckout } = await import("@/lib/tickets/reservations");
    return await cancelCheckout(eventSlug, credential);
  } catch (error) {
    ticketFailure("checkout.cancel", error);
    return "error";
  }
}
