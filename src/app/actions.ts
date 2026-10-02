"use server";

import { headers } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { clientIp, rateLimitKey } from "@/lib/rsvp-rate-limit";
import { processRsvp } from "@/lib/rsvp-submit";
import type { RsvpState } from "@/lib/rsvp";

export async function submitRsvp(_previous: RsvpState, formData: FormData): Promise<RsvpState> {
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
    async insert(row) {
      return getSupabaseServer().from("rsvps").insert(row);
    },
  });
}
