import { randomUUID } from "node:crypto";

export type RsvpOperation = "event.discovery" | "event.lookup" | "rate_limit" | "rsvp.submit";
type DiagnosticContext = {
  operation: RsvpOperation | "client.config";
  stage: "configuration" | "transport" | "rpc" | "response_validation" | "unexpected_result";
  code?: string;
  status?: number;
  rpc?: string;
  host?: string;
  keyType?: string;
  issues?: Array<{ path: string; code: string }>;
};

const hints: Record<string, string> = {
  "42501": "RPC permission denied. Check the API URL/key belong to the same stack and the server key authenticates as service_role. Do not grant browser/table access.",
  PGRST202: "RPC missing from the API schema cache. Verify the required migration is installed on this database and reload the PostgREST schema cache.",
  PGRST301: "JWT authentication failed. Verify the server key belongs to the selected Supabase stack.",
  PGRST303: "JWT authentication failed or expired. Verify the selected stack's server key.",
  MISSING_URL: "Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in the active server environment.",
  INVALID_URL: "The Supabase URL must be a valid HTTP(S) URL without credentials.",
  MISSING_KEY: "Set SUPABASE_SERVICE_ROLE_KEY to this stack's server credential; never a browser key.",
  BROWSER_KEY: "A browser/publishable/anon key cannot execute the server-only RSVP RPCs. Use this stack's server credential.",
  INVALID_RESPONSE: "RPC JSON does not match the expected response. Check issue paths against the function definition; nullable fields must still be present.",
  TRANSPORT: "Could not reach Supabase. Check the API origin, local containers, networking and request timeout.",
};

export class RsvpDiagnosticError extends Error {
  constructor(
    public readonly reference: string,
    public readonly operation: DiagnosticContext["operation"],
    public readonly stage: DiagnosticContext["stage"],
  ) {
    super("RSVP service unavailable");
    this.name = "RsvpDiagnosticError";
  }
}

// Only deliberately selected metadata enters logs. Never spread an exception,
// request, response, headers, SQL error details, URL query, or attendee data here.
export function reportRsvpFailure(context: DiagnosticContext): RsvpDiagnosticError {
  const reference = randomUUID();
  const code = context.code && /^[A-Z0-9_]{1,40}$/.test(context.code) ? context.code : "UNKNOWN";
  console.error("[rsvp]", {
    event: "rsvp.failure",
    reference,
    operation: context.operation,
    stage: context.stage,
    code,
    status: context.status,
    rpc: context.rpc,
    host: context.host,
    keyType: context.keyType,
    issues: context.issues,
    hint: hints[code] ?? "Inspect the named operation/stage and database definition. Raw database messages are deliberately omitted.",
  });
  return new RsvpDiagnosticError(reference, context.operation, context.stage);
}

export function rsvpDebug(context: { operation: RsvpOperation; stage: "start" | "complete"; rpc: string; status?: number; durationMs?: number }) {
  if (process.env.RSVP_DEBUG === "true") console.info("[rsvp]", { event: "rsvp.debug", ...context });
}

export function diagnosticReference(error: unknown): string {
  return error instanceof RsvpDiagnosticError ? ` Reference: ${error.reference}.` : "";
}
