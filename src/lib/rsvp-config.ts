import "server-only";

// Trusted server configuration only. Missing configuration keeps registration closed.
export const RSVP_OPEN = process.env.RSVP_ENABLED === "true";
export const eventSlug = process.env.RSVP_EVENT_SLUG?.trim() ?? "";
