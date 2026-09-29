import { test } from "node:test";
import assert from "node:assert/strict";
import { rsvpSchema, validateRsvp } from "../src/lib/rsvp-validation";
import { referralSources } from "../src/lib/rsvp";

function submission(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "  María Pérez  ", phone: "(201) 555-0123", email: " MARIA@example.com ", referralSource: "Instagram", giftCardDisclaimerAccepted: "on", ...overrides })) data.set(key, value);
  return data;
}

test("normalizes contact details and only allows RSVP fields", () => {
  const result = validateRsvp(submission({ gift_card_eligible: "true", created_at: "2000-01-01", disclaimer_version: "forged", event_slug: "invented-event", id: "forged" }));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data, { name: "María Pérez", phone: "+12015550123", email: "maria@example.com", referralSource: "Instagram", giftCardDisclaimerAccepted: true });
});

test("equivalent phone formats normalize to the same duplicate key", () => {
  const results = ["2015550123", "+1 201 555 0123", "(201) 555-0123"].map(phone => validateRsvp(submission({ phone })));
  for (const result of results) {
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.phone, "+12015550123");
  }
});

test("accepts international numbers with a country code", () => {
  const result = validateRsvp(submission({ phone: "+44 20 7946 0018" }));
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.phone, "+442079460018");
});

test("schema requires literal boolean true, not a truthy substitute", () => {
  const input = { name: "María", phone: "2015550123", email: "maria@example.com", referralSource: "Instagram", giftCardDisclaimerAccepted: true };
  assert.equal(rsvpSchema.safeParse(input).success, true);
  for (const value of [false, "false", "true", "on", 1, null, undefined]) {
    assert.equal(rsvpSchema.safeParse({ ...input, giftCardDisclaimerAccepted: value }).success, false);
  }
  for (const value of ["false", "true", "1", ""]) {
    assert.equal(validateRsvp(submission({ giftCardDisclaimerAccepted: value })).success, false);
  }
});

test("referral choices match exactly and phone is required after trimming", () => {
  for (const referralSource of referralSources) assert.equal(validateRsvp(submission({ referralSource })).success, true);
  for (const referralSource of ["instagram", " Instagram ", "Friend"]) assert.equal(validateRsvp(submission({ referralSource })).success, false);
  for (const phone of ["", "   "]) assert.equal(validateRsvp(submission({ phone })).success, false);
});

test("schema output excludes server/database-controlled values", () => {
  const parsed = rsvpSchema.parse({ name: "María", phone: "2015550123", email: "maria@example.com", referralSource: "Instagram", giftCardDisclaimerAccepted: true, event_slug: "forged", disclaimer_version: "forged", created_at: "2000-01-01", id: "forged" });
  assert.deepEqual(Object.keys(parsed).sort(), ["name", "phone", "email", "referralSource", "giftCardDisclaimerAccepted"].sort());
});

for (const [field, value] of Object.entries({ name: "   ", phone: "123", email: "bad-email", referralSource: "Forged choice", giftCardDisclaimerAccepted: "false" })) {
  test(`rejects invalid ${field}`, () => assert.equal(validateRsvp(submission({ [field]: value })).success, false));
  test(`requires ${field}`, () => {
    const data = submission(); data.delete(field);
    assert.equal(validateRsvp(data).success, false);
  });
}

test("rejects phone extensions, embedded prose, oversized names, and binary input", () => {
  for (const phone of ["2015550123 ext 22", "call me at 2015550123"]) assert.equal(validateRsvp(submission({ phone })).success, false);
  assert.equal(validateRsvp(submission({ name: "x".repeat(101) })).success, false);
  const data = submission(); data.set("email", new Blob(["x"]), "email.txt");
  assert.equal(validateRsvp(data).success, false);
});
