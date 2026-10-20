import "server-only";
import { createClient } from "@supabase/supabase-js";
import { reportRsvpFailure } from "../rsvp/rsvp-diagnostics";

export function getSupabaseConnectionInfo() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  let host = "unconfigured";
  try { host = new URL(url ?? "").host; } catch { /* No raw invalid URL in logs. */ }
  return { host, keyType: key.startsWith("sb_secret_") ? "secret"
    : key.startsWith("sb_publishable_") ? "publishable"
    : key.startsWith("eyJ") ? "legacy_jwt" : "unknown" };
}

export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url) throw reportRsvpFailure({ operation: "client.config", stage: "configuration", code: "MISSING_URL" });
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) throw new Error();
  } catch { throw reportRsvpFailure({ operation: "client.config", stage: "configuration", code: "INVALID_URL" }); }
  if (!key) throw reportRsvpFailure({ operation: "client.config", stage: "configuration", code: "MISSING_KEY", host: parsedUrl.host });
  let browserKey = key.startsWith("sb_publishable_");
  if (key.startsWith("eyJ")) {
    try {
      // Diagnostic classification only. Actual signature/authorization is checked
      // by Supabase, never trusted from locally decoded claims.
      const role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
      browserKey = browserKey || role === "anon" || role === "authenticated";
    } catch { /* Let Supabase authenticate unknown key formats. */ }
  }
  if (browserKey) throw reportRsvpFailure({ operation: "client.config", stage: "configuration", code: "BROWSER_KEY", host: parsedUrl.host });

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" }) },
  });
}
