import "server-only";

// Optional emergency override. Event availability normally comes from the DB.
export const RSVP_OPEN = process.env.RSVP_ENABLED !== "false";
