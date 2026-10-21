import "server-only";
function siteOrigin() {
  const raw = process.env.SITE_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);
  if (!raw) throw new Error("SITE_URL is required for ticket payments");
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("SITE_URL must be HTTPS (HTTP allowed on localhost only)");
  }
  return url.origin;
}

export function ticketReturnUrl() {
  return `${siteOrigin()}/ticket/return`;
}
export function ticketUrl(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid ticket credential");
  return `${siteOrigin()}/tickets/${token}`;
}
