export const referralSources = [
  "Instagram", "WhatsApp", "Friend / Word of mouth", "Guantanamera", "Dance class / studio", "Other",
] as const;

export type RsvpField = "name" | "phone" | "email" | "referralSource" | "giftCardDisclaimerAccepted";
export type RsvpState = {
  status: "idle" | "error" | "success" | "duplicate";
  message?: string;
  errors?: Partial<Record<RsvpField, string>>;
};

export const disclaimerVersion = "2026-10-12-v1";
export const giftCardDisclaimer = "I understand that my phone number may be shared with Guantanamera in connection with the promotional e-gift-card offer for this event.";
