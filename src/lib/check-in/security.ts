import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const doorSessionSeconds = 4 * 60 * 60;
export const doorCookieName = "el_solar_door";
export type DoorConfig = { pinHash: string; secret: string; eventSlug: string; siteUrl: string };
export function hashDoorPin(pin: string) {
  if (!/^\d{6,12}$/.test(pin)) throw new Error("Invalid PIN format");
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pin, salt, 64).toString("hex")}`;
}
export function matchesDoorPin(input: string, pinHash: string) {
  if (!/^\d{6,12}$/.test(input) || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(pinHash)) return false;
  const [, salt, hash] = pinHash.split("$");
  return timingSafeEqual(scryptSync(input, salt, 64), Buffer.from(hash, "hex"));
}
function signature(value: string, config: DoorConfig) {
  return createHmac("sha256", config.secret).update(`door-v2:${config.pinHash}:${config.eventSlug}:${value}`).digest("hex");
}
export function createDoorSession(config: DoorConfig, now = Date.now()) {
  const value = `${Math.floor(now / 1000) + doorSessionSeconds}.${randomBytes(16).toString("hex")}`;
  return `${value}.${signature(value, config)}`;
}
export function validDoorSession(cookie: string | undefined, config: DoorConfig, now = Date.now()) {
  if (!cookie || !/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(cookie)) return false;
  const [expires, nonce, mac] = cookie.split(".");
  const seconds = Math.floor(now / 1000);
  if (Number(expires) <= seconds || Number(expires) > seconds + doorSessionSeconds) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(`${expires}.${nonce}`, config), "hex"));
}
// Read a credential, never navigate/fetch a scanned URL. Accept already-sold
// canonical/non-www URLs, with or without the existing ?view=card query.
export function doorCredential(input: string, siteUrl: string): string | null {
  if (input.length > 2048) return null;
  const value = input.trim();
  if (/^EST-[A-F0-9]{12}$/i.test(value)) return value.toUpperCase();
  try {
    const url = new URL(value),
      site = new URL(siteUrl);
    if (
      url.username ||
      url.password ||
      (url.origin !== site.origin && !(url.protocol === "https:" && site.protocol === "https:" && url.hostname.replace(/^www\./, "") === site.hostname.replace(/^www\./, "") && url.port === site.port))
    )
      return null;
    const match = url.pathname.match(/^\/tickets\/([a-f0-9]{64})\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
