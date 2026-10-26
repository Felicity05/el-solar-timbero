import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { invalidDoorReasons } from "./invalid-reasons";
import { doorCookieName, validDoorSession, type DoorConfig } from "./security";

export function doorConfig(): DoorConfig {
  const pin = process.env.CHECK_IN_PIN ?? "";
  const secret = process.env.CHECK_IN_SESSION_SECRET ?? "";
  const eventSlug = process.env.CHECK_IN_EVENT_SLUG ?? "";
  const siteUrl = process.env.SITE_URL ?? "";
  const site = new URL(siteUrl);
  if (
    !/^\d{6,12}$/.test(pin) ||
    secret.length < 32 ||
    !/^[a-z0-9][a-z0-9-]{0,199}$/.test(eventSlug) ||
    site.username ||
    site.password ||
    (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname)))
  ) {
    throw new Error("Door configuration unavailable");
  }
  return { pin, secret, eventSlug, siteUrl };
}
export async function doorAuthenticated(config: DoorConfig) {
  return validDoorSession((await cookies()).get(doorCookieName)?.value, config);
}
const details = {
  ticket_code: z.string().regex(/^EST-[A-F0-9]{12}$/),
  ticket_type: z.string(),
  event_name: z.string(),
  checked_in_at: z.string().nullable(),
  timezone: z.string(),
};
export const doorResultSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("invalid"), reason: z.enum(invalidDoorReasons).default("unknown") }), z.object({ status: z.enum(["valid", "checked_in", "already_checked_in"]), ...details })]);
export type DoorResult = z.infer<typeof doorResultSchema> | { status: "unauthorized" } | { status: "error"; message: string };
