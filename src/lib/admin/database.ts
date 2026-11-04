import "server-only";
import { requireAdmin } from "./auth";
import { getSupabaseServer } from "../supabase/server";
export class AdminDatabaseError extends Error {
  constructor(readonly code: string) {
    super("Admin database request failed");
  }
}
export async function adminRpc(name: string, args?: Record<string, unknown>) {
  await requireAdmin();
  const { data, error } = await getSupabaseServer().rpc(name, args);
  if (error) throw new AdminDatabaseError(error.code);
  return data;
}
export function adminError(error: unknown) {
  if (error instanceof AdminDatabaseError) {
    if (error.code === "23P01") return "This publication window overlaps another published ticketed event. Publish after that event ends, or save as a draft.";
    if (error.code === "23505") return "That event slug is already in use. Choose a different slug.";
    if (["22023", "23514", "22007", "22008"].includes(error.code)) return "Check the event dates, timezone, publication time and sales window. Admission mode cannot change after registrations exist.";
  }
  console.error("[admin]", JSON.stringify({ operation: "mutation", type: error instanceof Error ? error.constructor.name : "Unknown" }));
  return "Unable to save this change. Please try again.";
}
