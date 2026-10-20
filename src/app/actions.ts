"use server";

import { headers } from "next/headers";
import { callRsvpRpc } from "@/lib/rsvp-rpc";
import { diagnosticReference, reportRsvpFailure } from "@/lib/rsvp-diagnostics";
import { clientIp, rateLimitKey } from "@/lib/rsvp-rate-limit";
import { processRsvp } from "@/lib/rsvp-submit";
import type { RsvpState } from "@/lib/rsvp";
import { RSVP_OPEN } from "@/lib/rsvp-config";
import { getRsvpEventForSubmission } from "@/lib/rsvp-event";

export async function submitRsvp(eventSlug: string, _previous: RsvpState, formData: FormData): Promise<RsvpState> {
  if (!RSVP_OPEN) {
    return { status: "error", message: "RSVPs are now closed. ¡Nos vemos esta noche en El Solar!" };
  }
  let event;
  try { event = await getRsvpEventForSubmission(eventSlug); }
  catch (error) { return { status: "error", message: "We couldn’t load this event. Please try again shortly." + diagnosticReference(error) }; }
  if (!event?.open) return { status: "error", message: "RSVPs are now closed for this event." };
  const ip = clientIp(await headers(), {
    vercel: process.env.VERCEL,
    trustedHeader: process.env.RSVP_TRUSTED_IP_HEADER,
  });
  return processRsvp(formData, ip, {
    async consume(scope, value) {
      // HMAC prevents recovering phone/IP values from the counter table.
      const key = rateLimitKey(scope, value, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
      const data = await callRsvpRpc("rate_limit", "consume_rsvp_rate_limit", {
        p_scope: scope, p_key_hash: key,
      });
      if (typeof data !== "number" || !Number.isInteger(data) || data < 0) throw reportRsvpFailure({
        operation: "rate_limit", rpc: "consume_rsvp_rate_limit", stage: "response_validation", code: "INVALID_RESPONSE",
      });
      return data as number;
    },
    async submit(row) {
      const data = await callRsvpRpc("rsvp.submit", "submit_normalized_rsvp", {
        p_event_slug: row.event_slug, p_name: row.name, p_email: row.email,
        p_phone: row.phone, p_referral_source: row.referral_source,
        p_disclaimer_accepted: row.gift_card_disclaimer_accepted,
        p_displayed_disclaimer_version: row.disclaimer_version,
      });
      return { data, error: null };
    },
  }, event);
}
