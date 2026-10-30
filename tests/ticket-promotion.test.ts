import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketGiftCardDisclaimer, validateTicketAttendee } from "../src/lib/tickets/promotion";

const ticketDisclaimerVersion = "2026-10-26-ticket-gift-card-v1"; // Historical test fixture only.

test("ticket promotion requires exact-version acknowledgment and preserves non-promotion validation", () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Test Buyer", email: "TEST@example.com", phone: "2015550123", referralSource: "Instagram" })) data.set(key, value);
  assert.equal(validateTicketAttendee(data, null).success, true);
  assert.equal(validateTicketAttendee(data, ticketDisclaimerVersion).success, false);
  data.set("displayed_disclaimer_version", ticketDisclaimerVersion);
  data.set("giftCardDisclaimerAccepted", "false");
  assert.equal(validateTicketAttendee(data, ticketDisclaimerVersion).success, false);
  data.set("giftCardDisclaimerAccepted", "on");
  const valid = validateTicketAttendee(data, ticketDisclaimerVersion);
  assert.equal(valid.success, true);
  if (valid.success) assert.equal(valid.data.phone, "+12015550123");
  data.set("displayed_disclaimer_version", "2026-10-12-v1");
  assert.equal(validateTicketAttendee(data, ticketDisclaimerVersion).success, false);
  assert.equal(validateTicketAttendee(data, "unsupported").success, false);
  assert.ok(ticketGiftCardDisclaimer.includes("$15"));
  assert.ok(ticketGiftCardDisclaimer.includes("Guantanamera is responsible"));
});

test("recurring ticket acknowledgment uses the selected event version rather than the October version", () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Test Buyer", email: "buyer@example.com", phone: "2015550123", referralSource: "Instagram" })) data.set(key, value);
  const version = "2026-11-09-v1";
  assert.equal(validateTicketAttendee(data, version).success, false);
  data.set("displayed_disclaimer_version", version);
  assert.equal(validateTicketAttendee(data, version).success, false);
  data.set("giftCardDisclaimerAccepted", "on");
  assert.equal(validateTicketAttendee(data, version).success, true);
  data.set("displayed_disclaimer_version", ticketDisclaimerVersion);
  assert.equal(validateTicketAttendee(data, version).success, false);
});
