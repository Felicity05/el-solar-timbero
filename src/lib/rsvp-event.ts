import "server-only";
import { z } from "zod";
import { callRsvpRpc } from "./rsvp-rpc";
import { reportRsvpFailure } from "./rsvp-diagnostics";
import { disclaimerVersion } from "./rsvp";
import { RSVP_OPEN } from "./rsvp-config";

const eventSchema = z.object({
  slug: z.string(), name: z.string(), event_date: z.string(),
  starts_at: z.string(), ends_at: z.string(), timezone: z.string(),
  venue_name: z.string(), venue_address: z.string(), open: z.boolean(),
  disclaimer_version: z.string().nullable(),
});
export type RsvpEvent = z.infer<typeof eventSchema>;
function supported(event: RsvpEvent) {
  return event.disclaimer_version === null || event.disclaimer_version === disclaimerVersion;
}

export async function getAvailableRsvpEvents(): Promise<RsvpEvent[]> {
  if (!RSVP_OPEN) return [];
  const data = await callRsvpRpc("event.discovery", "get_available_rsvp_events");
  const parsed = z.array(eventSchema).safeParse(data);
  if (!parsed.success) throw reportRsvpFailure({ operation: "event.discovery", rpc: "get_available_rsvp_events",
    stage: "response_validation", code: "INVALID_RESPONSE",
    issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), code: issue.code })),
  });
  return parsed.data.filter(event => event.open && supported(event));
}

// The event rendered with the form stays bound to that form. Never re-select
// another event at submit time, even if the upcoming event order changes.
export async function getRsvpEventForSubmission(slug: string): Promise<RsvpEvent | null> {
  if (!RSVP_OPEN || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return null;
  const data = await callRsvpRpc("event.lookup", "get_rsvp_event", { p_event_slug: slug });
  if (data === null) return null;
  const parsed = eventSchema.safeParse(data);
  if (!parsed.success) throw reportRsvpFailure({ operation: "event.lookup", rpc: "get_rsvp_event",
    stage: "response_validation", code: "INVALID_RESPONSE",
    issues: parsed.error.issues.map(issue => ({ path: issue.path.join("."), code: issue.code })),
  });
  return parsed.data.slug === slug && supported(parsed.data) ? parsed.data : null;
}
