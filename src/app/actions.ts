"use server";

import { headers } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { clientIp, rateLimitKey } from "@/lib/rsvp-rate-limit";
import { processRsvp } from "@/lib/rsvp-submit";
import type { RsvpState } from "@/lib/rsvp";
import { RSVP_OPEN } from "@/lib/rsvp-config";
import { getCurrentRsvpEvent } from "@/lib/rsvp-event";

export async function submitRsvp(_previous: RsvpState, formData: FormData): Promise<RsvpState> {
  if (!RSVP_OPEN) {
    return { status: "error", message: "RSVPs are now closed. ¡Nos vemos esta noche en El Solar!" };
  }
  const event = await getCurrentRsvpEvent();
  if (!event?.open) return { status: "error", message: "RSVPs are now closed for this event." };
  const ip = clientIp(await headers(), {
    vercel: process.env.VERCEL,
    trustedHeader: process.env.RSVP_TRUSTED_IP_HEADER,
  });
  return processRsvp(formData, ip, {
    async consume(scope, value) {
      // HMAC prevents recovering phone/IP values from the counter table.
      const key = rateLimitKey(scope, value, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
      const { data, error } = await getSupabaseServer().rpc("consume_rsvp_rate_limit", {
        p_scope: scope, p_key_hash: key,
      });
      if (error || !Number.isInteger(data) || data < 0) throw new Error("Rate limiter unavailable");
      return data as number;
    },
    async submit(row) {
      return getSupabaseServer().rpc("submit_normalized_rsvp", {
        p_event_slug: row.event_slug, p_name: row.name, p_email: row.email,
        p_phone: row.phone, p_referral_source: row.referral_source,
        p_disclaimer_accepted: row.gift_card_disclaimer_accepted,
        p_displayed_disclaimer_version: row.disclaimer_version,
      });
    },
  }, event);
}
