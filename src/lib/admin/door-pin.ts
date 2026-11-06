import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { z } from "zod";

const format = /^v1\.([a-f0-9]{24})\.([a-f0-9]{32})\.([a-f0-9]{12,24})$/;
function key(secret: string) {
  if (secret.length < 32) throw new Error("Door session secret missing");
  // Domain separation: the PIN encryption key differs from the session HMAC key.
  return Buffer.from(hkdfSync("sha256", secret, "el-solar-timbero", "admin-door-pin-encryption:v1", 32));
}
function context(eventId: string) {
  return Buffer.from(`event-door-pin:${z.uuid().parse(eventId).toLowerCase()}`);
}
export function encryptDoorPin(pin: string, eventId: string, secret = process.env.CHECK_IN_SESSION_SECRET ?? "") {
  if (!/^\d{6,12}$/.test(pin)) throw new Error("Invalid PIN");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv, { authTagLength: 16 });
  cipher.setAAD(context(eventId));
  const ciphertext = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return `v1.${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${ciphertext.toString("hex")}`;
}
export function decryptDoorPin(value: string, eventId: string, secret = process.env.CHECK_IN_SESSION_SECRET ?? "") {
  const parsed = format.exec(value);
  if (!parsed) throw new Error("Invalid encrypted PIN");
  const [, iv, tag, ciphertext] = parsed;
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "hex"), { authTagLength: 16 });
  decipher.setAAD(context(eventId));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const pin = Buffer.concat([decipher.update(Buffer.from(ciphertext, "hex")), decipher.final()]).toString("utf8");
  if (!/^\d{6,12}$/.test(pin)) throw new Error("Invalid decrypted PIN");
  return pin;
}
