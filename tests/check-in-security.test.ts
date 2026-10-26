import { test } from "node:test";
import assert from "node:assert/strict";
import { createDoorSession, validDoorSession, matchesDoorPin, doorCredential, doorSessionSeconds } from "../src/lib/check-in/security";
const config = { pin: "12345678", secret: "s".repeat(64), eventSlug: "door-event", siteUrl: "https://elsolartimbero.com" };
test("door sessions expire, reject tampering and bind PIN, secret and event", () => {
  const now = Date.now();
  const cookie = createDoorSession(config, now);
  assert.ok(validDoorSession(cookie, config, now));
  assert.notEqual(cookie, createDoorSession(config, now));
  assert.ok(!validDoorSession(cookie, config, now + doorSessionSeconds * 1000));
  for (const changed of [{ pin: "87654321" }, { secret: "t".repeat(64) }, { eventSlug: "other" }]) {
    assert.ok(!validDoorSession(cookie, { ...config, ...changed }, now));
  }
  for (const bad of [undefined, "", `${cookie}x`, cookie.replace(/.$/, cookie.endsWith("a") ? "b" : "a"), "not-a-cookie"]) {
    assert.ok(!validDoorSession(bad, config, now));
  }
  assert.ok(matchesDoorPin("12345678", config.pin));
  assert.ok(!matchesDoorPin("1234567", config.pin));
});
test("scanner accepts sold QR URLs and codes without navigating or accepting foreign credentials", () => {
  const token = "a".repeat(64);
  for (const host of ["elsolartimbero.com", "www.elsolartimbero.com"]) {
    for (const query of ["", "?view=card"]) {
      assert.equal(doorCredential(`https://${host}/tickets/${token}${query}`, config.siteUrl), token);
    }
  }
  assert.equal(doorCredential("est-abcdef012345", config.siteUrl), "EST-ABCDEF012345");
  assert.equal(doorCredential(`http://localhost:3000/tickets/${token}?view=card`, "http://localhost:3000"), token);
  for (const bad of [
    token,
    "EST-123",
    `https://evil.com/tickets/${token}`,
    `https://elsolartimbero.com.evil.com/tickets/${token}`,
    `https://evil@elsolartimbero.com/tickets/${token}`,
    `http://elsolartimbero.com/tickets/${token}`,
    "javascript:alert(1)",
  ]) {
    assert.equal(doorCredential(bad, config.siteUrl), null);
  }
});
