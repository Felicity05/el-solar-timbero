import "server-only";
import { getSupabaseServer, getSupabaseConnectionInfo } from "../supabase/server";
import { reportRsvpFailure, RsvpDiagnosticError, rsvpDebug, type RsvpOperation } from "./rsvp-diagnostics";

export async function callRsvpRpc(operation: RsvpOperation, rpc: string, args?: Record<string, unknown>): Promise<unknown> {
  const started = Date.now();
  rsvpDebug({ operation, rpc, stage: "start" });
  try {
    const { data, error, status } = await getSupabaseServer().rpc(rpc, args);
    if (error) throw reportRsvpFailure({ operation, rpc, stage: status === 0 ? "transport" : "rpc",
      status, code: status === 0 ? "TRANSPORT" : error.code, ...getSupabaseConnectionInfo() });
    rsvpDebug({ operation, rpc, stage: "complete", status, durationMs: Date.now() - started });
    return data;
  } catch (error) {
    if (error instanceof RsvpDiagnosticError) throw error;
    throw reportRsvpFailure({ operation, rpc, stage: "transport", code: "TRANSPORT", ...getSupabaseConnectionInfo() });
  }
}
