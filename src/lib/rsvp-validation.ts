import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { z } from "zod";
import { referralSources } from "./rsvp";

export const rsvpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.")
      .max(100, "Use 100 characters or fewer.")
      .regex(/^[^\p{Cc}]+$/u, "Enter your name without control characters."),
  phone: z.string().trim().min(1, "Enter your phone number.")
      .max(40, "Enter a valid phone number.")
      .transform((value, ctx) => {
          const phone = parsePhoneNumberFromString(value, { defaultCountry: "US", extract: false });
          if (!phone?.isValid() || phone.ext) {
            ctx.addIssue({ code: "custom", message: "Enter a valid phone number. Include + and the country code for numbers outside the US." });
            return z.NEVER;
          }
          return phone.number;
        }),
  email: z.string().trim().toLowerCase().max(254, "Use an email address under 255 characters.")
      .email("Enter a valid email address."),
  referralSource: z.enum(referralSources, { error: "Choose how you heard about us." }),
  giftCardDisclaimerAccepted: z.literal(true, { error: "Please acknowledge the phone-sharing notice to RSVP." }),
});

export function validateRsvp(formData: FormData) {
  // Explicitly select permitted input; never spread a request into a database row.
  return rsvpSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    referralSource: formData.get("referralSource"),
    // Native checked checkboxes send "on"; unchecked checkboxes send nothing.
    // Never use Boolean(value): even the string "false" would become true.
    giftCardDisclaimerAccepted: formData.get("giftCardDisclaimerAccepted") === "on",
  });
}
