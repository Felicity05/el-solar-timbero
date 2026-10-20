import "server-only";
import { z } from "zod";
import { getSupabaseServer } from "./supabase/server";
import { disclaimerVersion } from "./rsvp";
import { eventSlug, RSVP_OPEN } from "./rsvp-config";

const eventSchema = z.object({
  slug: z.string(), name: z.string(), event_date: z.string(),
  starts_at: z.string(), ends_at: z.string(), timezone: z.string(),
  venue_name: z.string(), venue_address: z.string(), open: z.boolean(),
  disclaimer_version: z.string().nullable(),
});
export type RsvpEvent = z.infer<typeof eventSchema>;
export async function getCurrentRsvpEvent(): Promise<RsvpEvent | null> {
  if (!RSVP_OPEN || !eventSlug) return null;
  try {
    const { data, error } = await getSupabaseServer().rpc("get_rsvp_event", { p_event_slug: eventSlug });
    const parsed = eventSchema.safeParse(data);
    if (error || !parsed.success || parsed.data.slug !== eventSlug) return null;
    if (parsed.data.disclaimer_version !== null && parsed.data.disclaimer_version !== disclaimerVersion) return null;
    return parsed.data;
  } catch { return null; }
}
