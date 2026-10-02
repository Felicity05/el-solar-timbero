import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export type RateLimitScope = "global" | "ip" | "phone";

// Trust only a header overwritten by the hosting proxy.
export function clientIp(headers: Pick<Headers, "get">, config: { vercel?: string; trustedHeader?: string }) {
  const header = config.vercel === "1" ? "x-vercel-forwarded-for" : config.trustedHeader?.trim();
  const value = header ? headers.get(header)?.trim() : undefined;
  if (!value || !isIP(value)) return "unknown";
  // Canonicalize equivalent IPv6 spellings to the same bucket.
  if (isIP(value) === 6) return new URL(`http://[${value}]/`).hostname;
  return value;
}

export function rateLimitKey(scope: RateLimitScope, value: string, secret: string) {
  if (!secret.trim()) throw new Error("Missing rate limit secret");
  return createHmac("sha256", secret).update(`rsvp-rate-limit:v1:${scope}:${value}`).digest("hex");
}
