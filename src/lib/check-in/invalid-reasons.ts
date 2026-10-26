// Controlled staff-facing copy only; never show raw database errors or credentials.
export const invalidDoorReasons = ["invalid_format", "not_found", "wrong_event", "event_unavailable", "unpaid", "refunded", "void", "unknown"] as const;
export const invalidDoorMessages: Record<(typeof invalidDoorReasons)[number], string> = {
  invalid_format: "This QR or ticket code is not recognized. Scan a ticket from this website, or enter its EST ticket code.",
  not_found: "No ticket was found for this QR or ticket code. Check the code or ask the attendee for their original ticket.",
  wrong_event: "This ticket is for a different event. It cannot be used for the configured door event.",
  event_unavailable: "This event is not currently available for ticket check-in. Ask the organizer to check the event configuration.",
  unpaid: "The order for this ticket is not marked as paid. Ask the organizer to verify the payment.",
  refunded: "This ticket or its payment has been refunded. It cannot be used for admission.",
  void: "This ticket or its order has been voided. It cannot be used for admission.",
  unknown: "This ticket could not be validated. Ask the organizer to verify its event and payment status.",
};
