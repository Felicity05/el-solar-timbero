"use server";
import { randomInt, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAuthClient, requireAdmin } from "../../lib/admin/auth";
import { isAdminId } from "../../lib/admin/auth-config";
import { adminRpc, adminError, AdminDatabaseError } from "../../lib/admin/database";
import { parseAdminEvent, generatedSlugForEvent, type AdminDetail } from "../../lib/admin/events";
import { encryptDoorPin, decryptDoorPin } from "../../lib/admin/door-pin";
import { hashDoorPin, matchesDoorPin } from "../../lib/check-in/security";
import { clientIp, rateLimitKey } from "../../lib/rsvp/rsvp-rate-limit";
import { ticketRpc } from "../../lib/tickets/server";
export type AdminActionState = { error?: string; eventId?: string };

export async function loginAdmin(_state: AdminActionState, data: FormData): Promise<AdminActionState> {
  try {
    const ip = clientIp(await headers(), { vercel: process.env.VERCEL, trustedHeader: process.env.RSVP_TRUSTED_IP_HEADER });
    for (const [scope, value] of [
      ["ip", ip],
      ["global", "all"],
    ] as const) {
      const wait = await ticketRpc("consume_rsvp_rate_limit", { p_scope: scope, p_key_hash: rateLimitKey(scope, `admin-login:${value}`, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "") });
      if (typeof wait !== "number" || wait !== 0) return { error: "Too many sign-in attempts. Please wait and try again." };
    }
    const email = z.email().safeParse(data.get("email"));
    const password = z.string().min(1).max(1024).safeParse(data.get("password"));
    if (!email.success || !password.success) return { error: "Enter your admin email and password." };
    const client = await adminAuthClient();
    const { data: result, error } = await client.auth.signInWithPassword({ email: email.data, password: password.data });
    if (error || !isAdminId(result.user?.id)) {
      await client.auth.signOut();
      return { error: "Unable to sign in with those admin credentials." };
    }
    // Independently verified user, not a decoded session or user-editable metadata.
    await requireAdmin();
  } catch {
    return { error: "Admin sign-in is unavailable. Check the server configuration or try again." };
  }
  redirect("/admin");
}
export async function logoutAdmin() {
  await (await adminAuthClient()).auth.signOut();
  redirect("/admin");
}
export async function saveAdminEvent(id: string | null, _state: AdminActionState, form: FormData): Promise<AdminActionState> {
  await requireAdmin();

  if (id !== null && !z.uuid().safeParse(id).success) return { error: "Invalid event." };
  try {
    // Ignore browser-supplied slugs; rescheduling generates a slug for the new date.
    const current = id ? ((await adminRpc("admin_event_detail", { p_event_id: id })) as AdminDetail | null) : null;
    if (id && !current) return { error: "Event not found." };
    form.set("slug", generatedSlugForEvent(String(form.get("name") ?? ""), String(form.get("event_date") ?? ""), current?.event));
    const parsed = parseAdminEvent(form);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the event fields." };
    let saved;
    try {
      saved = await adminRpc("admin_save_event", { p_event_id: id, p_config: parsed.data });
    } catch (error) {
      if (!(error instanceof AdminDatabaseError) || error.code !== "23505") throw error;
      saved = await adminRpc("admin_save_event", { p_event_id: id, p_config: { ...parsed.data, slug: `${parsed.data.slug}-${randomUUID().replaceAll("-", "").slice(0, 12)}` } });
    }
    const eventId = z.uuid().parse(saved);
    revalidatePath("/admin");
    revalidatePath(`/admin/events/${eventId}`);
    revalidatePath("/");
    return { eventId };
  } catch (error) {
    return { error: adminError(error) };
  }
}
export async function duplicateAdminEvent(id: string): Promise<AdminActionState> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { error: "Invalid event." };
  try {
    const eventId = z.uuid().parse(await adminRpc("admin_duplicate_event", { p_event_id: id }));
    revalidatePath("/admin");
    return { eventId };
  } catch (error) {
    return { error: adminError(error) };
  }
}
export async function generateEventPin(id: string): Promise<{ pin?: string; error?: string }> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { error: "Invalid event." };
  try {
    const pin = String(randomInt(10000000, 100000000));
    const saved = await adminRpc("admin_set_event_pin", { p_event_id: id, p_pin_hash: hashDoorPin(pin), p_pin_ciphertext: encryptDoorPin(pin, id) });
    if (saved !== true) return { error: "Event not found." };
    revalidatePath(`/admin/events/${id}`);
    return { pin };
  } catch (error) {
    return { error: adminError(error) };
  }
}

export async function issueComplimentaryTicket(id: string, _state: ComplimentaryActionState, form: FormData): Promise<ComplimentaryActionState> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { error: "Invalid event." };
  const { validateRsvp } = await import("../../lib/rsvp/rsvp-validation");
  form.set("referralSource", "Other");
  const parsed = validateRsvp(form, false);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the attendee details." };
  try {
    const { issueComplimentary } = await import("../../lib/admin/complimentary");
    const result = await issueComplimentary(id, parsed.data);
    revalidatePath(`/admin/events/${id}`);
    revalidatePath("/");
    return result;
  } catch (error) {
    return { error: adminError(error) };
  }
}
export type ComplimentaryActionState = { error?: string; ticketCode?: string; ticketUrl?: string; alreadyIssued?: boolean; email?: string };

export async function revealEventPin(id: string): Promise<{ pin?: string; error?: string }> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { error: "Invalid event." };
  try {
    const stored = z
      .object({ pin_hash: z.string().nullable(), pin_ciphertext: z.string().nullable() })
      .nullable()
      .parse(await adminRpc("admin_get_event_pin", { p_event_id: id }));
    if (!stored?.pin_hash) return { error: "No PIN has been generated for this event." };
    if (!stored.pin_ciphertext) return { error: "This older PIN cannot be recovered from its hash. Regenerate it once to enable secure Show PIN." };
    const pin = decryptDoorPin(stored.pin_ciphertext, id);
    if (!matchesDoorPin(pin, stored.pin_hash)) throw new Error("Stored PIN does not match verification hash");
    return { pin };
  } catch (error) {
    console.error("[admin]", JSON.stringify({ operation: "pin.reveal", type: error instanceof Error ? error.constructor.name : "Unknown" }));
    return { error: "Unable to display the stored PIN. Check the server session secret or regenerate the PIN." };
  }
}
