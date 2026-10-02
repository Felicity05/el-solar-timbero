import { validateRsvp } from "./rsvp-validation";
import { disclaimerVersion, type RsvpField, type RsvpState } from "./rsvp";
import type { RateLimitScope } from "./rsvp-rate-limit";

export const eventSlug = "cuban-night-social-2026-10-12";
type RsvpRow = {
  name: string; phone: string; email: string; referral_source: string;
  gift_card_disclaimer_accepted: true; event_slug: string; disclaimer_version: string;
};
type Dependencies = {
  consume: (scope: RateLimitScope, value: string) => Promise<number>;
  insert: (row: RsvpRow) => Promise<{ error: { code?: string; message?: string } | null }>;
};

function limited(seconds: number): RsvpState {
  const minutes = Math.ceil(seconds / 60);
  return { status: "error", message: `Too many RSVP attempts. Please try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}. Your details are still here.` };
}

// The action supplies server-only dependencies; this flow can be tested directly.
export async function processRsvp(formData: FormData, ip: string, dependencies: Dependencies): Promise<RsvpState> {
  try {
    // Count invalid requests and honeypot hits too. Failed protection never fails open.
    const globalWait = await dependencies.consume("global", "all-events");
    if (globalWait > 0) return limited(globalWait);
    const ipWait = await dependencies.consume("ip", ip);
    if (ipWait > 0) return limited(ipWait);
    // Reject populated honeypots, including repeated field values and Files.
    if (formData.getAll("website").some(value => value !== "")) {
      return { status: "error", message: "We couldn’t submit your RSVP. Please try again." };
    }
    const result = validateRsvp(formData);
    if (!result.success) {
      const errors: Partial<Record<RsvpField, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as RsvpField;
        errors[field] ??= issue.message;
      }
      return { status: "error", message: "Please check the highlighted fields.", errors };
    }
    const phoneWait = await dependencies.consume("phone", `${eventSlug}:${result.data.phone}`);
    if (phoneWait > 0) return limited(phoneWait);
    const { error } = await dependencies.insert({
      name: result.data.name, phone: result.data.phone, email: result.data.email,
      referral_source: result.data.referralSource,
      gift_card_disclaimer_accepted: result.data.giftCardDisclaimerAccepted,
      event_slug: eventSlug, disclaimer_version: disclaimerVersion,
    });
    if (error?.code === "23505" && error.message?.includes('"rsvps_event_phone_key"')) {
      return { status: "duplicate" };
    }
    if (error) {
      console.error("RSVP insert failed", { code: error.code });
      return { status: "error", message: "We couldn’t save your RSVP. Please try again, or contact @elsolartimbero on Instagram." };
    }
    return { status: "success" };
  } catch {
    console.error("RSVP submission protection or database unavailable");
    return { status: "error", message: "We couldn’t connect to save your RSVP. Your details are still here—please try again shortly." };
  }
}
