import { z } from "zod";
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const adminEventSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    venue_name: z.string().trim().min(1).max(300),
    venue_address: z.string().trim().min(1).max(1000),
    starts_at_local: localDateTime,
    ends_at_local: localDateTime,
    publish_at_local: localDateTime,
    timezone: z.string().trim().min(1).max(100),
    status: z.enum(["draft", "published", "cancelled", "completed"]),
    admission_mode: z.enum(["rsvp", "ticketed"]),
    rsvp_open: z.boolean(),
    ticket_sales_open: z.boolean(),
    gift_card_disclaimer_version: z.string().trim().max(100),
    ticket_name: z.string().trim().max(200),
    ticket_description: z.string().trim().max(2000),
    price_cents: z.number().int().positive().max(100000000),
    ticket_active: z.boolean(),
    sales_start_local: z.union([localDateTime, z.literal("")]),
    sales_end_local: z.union([localDateTime, z.literal("")]),
  })
  .superRefine((event, ctx) => {
    if (event.admission_mode === "ticketed" && !event.ticket_name) ctx.addIssue({ code: "custom", path: ["ticket_name"], message: "Enter a ticket type name." });
    if (event.rsvp_open && (event.status !== "published" || event.admission_mode !== "rsvp"))
      ctx.addIssue({ code: "custom", path: ["rsvp_open"], message: "RSVP can open only for a published RSVP event." });
  });
export function priceCents(value: string) {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) return NaN;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function parseAdminEvent(data: FormData) {
  const fields = Object.fromEntries(
    [
      "slug",
      "name",
      "description",
      "event_date",
      "venue_name",
      "venue_address",
      "starts_at_local",
      "ends_at_local",
      "publish_at_local",
      "timezone",
      "status",
      "admission_mode",
      "gift_card_disclaimer_version",
      "ticket_name",
      "ticket_description",
      "sales_start_local",
      "sales_end_local",
    ].map((key) => [key, typeof data.get(key) === "string" ? data.get(key) : ""]),
  );
  const start = String(data.get("start_time") ?? "");
  const end = String(data.get("end_time") ?? "");
  const date = String(fields.event_date);
  if (start || end) {
    fields.starts_at_local = `${date}T${start}`;
    const endDay = new Date(`${date}T00:00:00Z`);
    if (end <= start) endDay.setUTCDate(endDay.getUTCDate() + 1);
    fields.ends_at_local = `${Number.isNaN(endDay.getTime()) ? "" : endDay.toISOString().slice(0, 10)}T${end}`;
  }
  return adminEventSchema.safeParse({
    ...fields,
    rsvp_open: data.get("rsvp_open") === "on",
    ticket_sales_open: data.get("ticket_sales_open") === "on",
    ticket_active: data.get("ticket_active") === "on",
    price_cents: fields.admission_mode === "ticketed" ? priceCents(String(data.get("price") ?? "")) : 1000,
  });
}
export type AdminEvent = {
  display_status?: string;
  id: string;
  slug: string;
  name: string;
  description: string | null;
  event_date: string;
  venue_name: string;
  venue_address: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: "draft" | "published" | "cancelled" | "completed";
  admission_mode: "rsvp" | "ticketed";
  rsvp_open: boolean;
  ticket_sales_open: boolean;
  publish_at: string;
  gift_card_disclaimer_version: string | null;
  has_check_in_pin: boolean;
};
export type AdminTicketType = { name: string; description: string | null; price_cents: number; currency: string; active: boolean; sales_start_at: string | null; sales_end_at: string | null };
export type AdminDetail = {
  event: AdminEvent;
  ticket_type: AdminTicketType | null;
  metrics: { tickets_sold: number; gross_revenue_cents: number; checked_in: number; not_checked_in: number; rsvps: number };
};
export function localInput(value: string | null, timezone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(value),
  );
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export type AdminFormOptions = { timezones?: string[]; disclaimer_versions: string[]; ticket_names: string[] };
export function eventSlug(name: string, date: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90)
    .replace(/-$/g, "");
  return `${normalized || "event"}-${date}`;
}
export function timezoneOptions(...extra: string[]) {
  return [...new Set(["UTC", ...Intl.supportedValuesOf("timeZone"), ...extra])].sort();
}

export function generatedSlugForEvent(name: string, date: string, current?: { slug: string; event_date: string }) {
  return current && current.event_date === date && !/^draft-[a-f0-9]{32}$/.test(current.slug) ? current.slug : eventSlug(name, date);
}

export function groupAdminEvents<T extends Pick<AdminEvent, "id" | "event_date" | "starts_at" | "ends_at" | "status">>(events: T[], now: string) {
  const upcoming: T[] = [],
    past: T[] = [];
  const timestamp = Date.parse(now);
  for (const event of events) (event.status === "completed" || Date.parse(event.ends_at) <= timestamp ? past : upcoming).push(event);
  const byDate = (a: T, b: T) => a.event_date.localeCompare(b.event_date) || Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id);
  upcoming.sort(byDate);
  past.sort((a, b) => byDate(b, a));
  return { upcoming, past };
}
