"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import { validateRsvp } from "@/lib/rsvp-validation";
import { disclaimerVersion, type RsvpField, type RsvpState } from "@/lib/rsvp";

// Trusted event configuration, not a browser-supplied hidden field.
const eventSlug = "cuban-night-social-2026-10-12";

export async function submitRsvp(_previous: RsvpState, formData: FormData): Promise<RsvpState> {
  // This endpoint is intentionally public. Every request is untrusted.
  if (formData.get("website")) return { status: "error", message: "We couldn’t submit your RSVP. Please try again." };
  const result = validateRsvp(formData);
  if (!result.success) {
    const errors: Partial<Record<RsvpField, string>> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as RsvpField;
      errors[field] ??= issue.message;
    }
    return { status: "error", message: "Please check the highlighted fields.", errors };
  }

  try {
    const { error } = await getSupabaseServer().from("rsvps").insert({
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      referral_source: result.data.referralSource,
      gift_card_disclaimer_accepted: result.data.giftCardDisclaimerAccepted,
      event_slug: eventSlug,
      disclaimer_version: disclaimerVersion,
    });
    // The unique event/phone constraint handles simultaneous submissions atomically.
    // Never upsert: anonymous visitors must not overwrite somebody else's RSVP.
    if (error?.code === "23505") return { status: "duplicate" };
    if (error) {
      console.error("RSVP insert failed", { code: error.code });
      return { status: "error", message: "We couldn’t save your RSVP. Please try again, or contact @elsolartimbero on Instagram." };
    }
    return { status: "success" };
  } catch {
    // Do not log personal information, form payloads, or database secrets.
    console.error("RSVP database unavailable");
    return { status: "error", message: "We couldn’t connect to save your RSVP. Your details are still here—please try again shortly." };
  }
}
