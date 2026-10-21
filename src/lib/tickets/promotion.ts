import { z } from "zod";
import { rsvpSchema, validateRsvp } from "../rsvp/rsvp-validation";

export const ticketDisclaimerVersion = "2026-10-26-ticket-gift-card-v1";
export const ticketGiftCardDisclaimer =
  "I understand that my ticket purchase includes a $15 Guantanamera gift card. Guantanamera is responsible for issuing and managing the gift card, and my phone number may be shared with Guantanamera to fulfill this offer.";
export const ticketGiftCardNote = "Your admission ticket QR code is separate from any gift-card redemption instructions provided by Guantanamera.";

export function validateTicketAttendee(data: FormData, version: string | null) {
  const attendee = validateRsvp(data, false);
  if (!attendee.success) {
    return attendee;
  }
  return rsvpSchema
    .extend({ giftCardDisclaimerAccepted: z.boolean(), displayedDisclaimerVersion: z.string().nullable() })
    .superRefine((value, ctx) => {
      if (version !== null && (version !== ticketDisclaimerVersion || !value.giftCardDisclaimerAccepted || value.displayedDisclaimerVersion !== version)) {
        ctx.addIssue({ code: "custom", path: ["giftCardDisclaimerAccepted"], message: "Please acknowledge the current gift-card offer before purchasing your ticket." });
      }
    })
    .safeParse({ ...attendee.data, displayedDisclaimerVersion: typeof data.get("displayed_disclaimer_version") === "string" ? data.get("displayed_disclaimer_version") : null });
}
