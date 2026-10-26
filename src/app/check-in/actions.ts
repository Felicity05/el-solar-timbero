"use server";
import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createDoorSession, doorCookieName, doorCredential, doorSessionSeconds, matchesDoorPin } from "@/lib/check-in/security";
import { doorAuthenticated, doorConfig, doorResultSchema, type DoorResult } from "@/lib/check-in/server";
import { ticketFailure, ticketRpc } from "@/lib/tickets/server";
import { clientIp } from "@/lib/rsvp/rsvp-rate-limit";

export async function unlockDoor(pin: string): Promise<{ status: "ok" | "error"; message?: string }> {
  try {
    const config = doorConfig();
    const ip = clientIp(await headers(), { vercel: process.env.VERCEL, trustedHeader: process.env.RSVP_TRUSTED_IP_HEADER });
    for (const [scope, value] of [
      ["ip", ip],
      ["global", "all"],
    ]) {
      const key = createHmac("sha256", config.secret).update(`door-pin:${scope}:${value}`).digest("hex");
      const result = await ticketRpc("consume_rsvp_rate_limit", { p_scope: scope, p_key_hash: key });
      if (typeof result !== "number" || result !== 0) {
        return { status: "error", message: "Too many attempts. Please wait before trying again." };
      }
    }
    if (typeof pin !== "string" || pin.length > 12 || !matchesDoorPin(pin, config.pin)) {
      return { status: "error", message: "Incorrect PIN." };
    }
    (await cookies()).set(doorCookieName, createDoorSession(config), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/check-in",
      maxAge: doorSessionSeconds,
    });
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: ticketFailure("door_login", error) };
  }
}

export async function lockDoor() {
  (await cookies()).set(doorCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/check-in", maxAge: 0 });
}

async function operate(input: string, rpc: string): Promise<DoorResult> {
  try {
    const config = doorConfig();
    if (!(await doorAuthenticated(config))) {
      return { status: "unauthorized" };
    }
    const credential = typeof input === "string" ? doorCredential(input, config.siteUrl) : null;
    if (!credential) {
      return { status: "invalid", reason: "invalid_format" };
    }
    return doorResultSchema.parse(await ticketRpc(rpc, { p_event_slug: config.eventSlug, p_credential: credential }));
  } catch (error) {
    return { status: "error", message: ticketFailure("door_ticket", error) };
  }
}

export async function validateDoorTicket(input: string) {
  return operate(input, "validate_door_ticket");
}

export async function admitDoorTicket(input: string) {
  return operate(input, "check_in_door_ticket");
}
