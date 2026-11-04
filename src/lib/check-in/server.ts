import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { ticketRpc } from "../tickets/server";
import { invalidDoorReasons } from "./invalid-reasons";
import { doorCookieName, validDoorSession, type DoorConfig } from "./security";

export async function doorConfig(): Promise<DoorConfig> {
  const secret = process.env.CHECK_IN_SESSION_SECRET ?? "";
  const siteUrl = process.env.SITE_URL ?? "";
  const site = new URL(siteUrl);
  if (secret.length < 32 || site.username || site.password || (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1"].includes(site.hostname))))
    throw new Error("Door configuration unavailable");
  const event = z
    .object({ slug: z.string(), pin_hash: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/) })
    .nullable()
    .parse(await ticketRpc("get_active_door_event", {}));
  if (!event) throw new Error("No active event with a door PIN");
  return { secret, siteUrl, pinHash: event.pin_hash, eventSlug: event.slug };
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
export const doorResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("invalid"), reason: z.enum(invalidDoorReasons).default("unknown") }),
  z.object({ status: z.enum(["valid", "checked_in", "already_checked_in"]), ...details }),
]);
export type DoorResult = z.infer<typeof doorResultSchema> | { status: "unauthorized" } | { status: "error"; message: string };
