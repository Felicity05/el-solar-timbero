// Phone matching is NOT authentication. Persist only this random capability,
// never attendee data, Stripe client secrets, or card details. It stays out of URLs.
const memory = new Map<string, string>();
const valid = (value: string | null | undefined): value is string => !!value && /^[a-f0-9]{64}$/.test(value);
function read(storage: "localStorage" | "sessionStorage", key: string) {
  try { return window[storage].getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Private/storage-disabled browsers can use this tab. */ }
  try { sessionStorage.setItem(key, value); } catch { /* Memory is the final fallback. */ }
}
export function existingCredential(slug: string) {
  const key = `el-solar-purchase:${slug}`;
  // Keep this tab’s selected attendee when another tab selects someone else.
  const value = [read("sessionStorage", key), read("localStorage", key), memory.get(key)].find(valid);
  if (!value) return null;
  // Adopt existing tab-only credentials without invalidating existing purchases.
  save(key, value);
  return value;
}
export async function purchaseCredential(slug: string, normalizedPhone: string) {
  if (!/^\+[1-9][0-9]{1,14}$/.test(normalizedPhone)) throw new Error("A normalized attendee phone is required");
  // A browser can enter more than one person's details over time. Never reuse
  // another attendee's capability: orders enforce UNIQUE(event_id, access_hash).
  // Hash the storage lookup key so it contains no plaintext phone number.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedPhone));
  const identity = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const key = `el-solar-purchase:${slug}:attendee:${identity}`;
  let value = [read("localStorage", key), read("sessionStorage", key), memory.get(key)].find(valid);
  if (!value) {
    value = Array.from(crypto.getRandomValues(new Uint8Array(32)),
      b => b.toString(16).padStart(2, "0")).join("");
  }
  save(key, value);
  // Confirmation/Stripe return reads the capability for the selected attendee.
  // Existing event-only credentials still work for saved confirmations until a
  // different purchase starts; they are never adopted for an unknown attendee.
  save(`el-solar-purchase:${slug}`, value);
  return value;
}
