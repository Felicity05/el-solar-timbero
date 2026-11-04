import { test } from "node:test";
import assert from "node:assert/strict";
import { adminAuthConfig, isAdminId } from "../src/lib/admin/auth-config";
import { priceCents, localInput, parseAdminEvent, eventSlug, timezoneOptions, generatedSlugForEvent, groupAdminEvents } from "../src/lib/admin/events";
test("admin authorization is exact verified user UUID; price parsing is decimal-exact", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.ok(isAdminId(id, id));
  assert.ok(!isAdminId(undefined, id));
  assert.ok(!isAdminId("22222222-2222-4222-8222-222222222222", id));
  assert.ok(!isAdminId(id, ""));
  assert.equal(priceCents("10"), 1000);
  assert.equal(priceCents("10.01"), 1001);
  for (const invalid of ["1e3", "-10", "1.111", "", "Infinity"]) assert.ok(Number.isNaN(priceCents(invalid)));
  assert.equal(localInput("2031-11-10T01:00:00Z", "America/New_York"), "2031-11-09T20:00");
  assert.equal(parseAdminEvent(new FormData()).success, false);
});
test("admin auth refuses secret/service keys in the publishable-key setting", () => {
  const previous = { ...process.env };
  try {
    process.env.SUPABASE_URL = "http://localhost:54321";
    for (const key of ["sb_secret_not-public", "sk_live_never-public", "rk_live_never-public", `eyJ0.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`]) {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
      assert.throws(() => adminAuthConfig());
    }
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
    assert.equal(adminAuthConfig().key, "sb_publishable_fixture");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});

test("generated slugs, timezone choices and time-only fields preserve local calendar dates", () => {
  assert.equal(eventSlug("¡El Sólár Timbero!", "2033-01-09"), "el-solar-timbero-2033-01-09");
  assert.ok(timezoneOptions("US/Eastern").includes("America/New_York"));
  assert.ok(timezoneOptions("US/Eastern").includes("US/Eastern"));
  assert.equal(new Set(timezoneOptions("UTC")).size, timezoneOptions("UTC").length);
  const form = new FormData();
  const values = {
    slug: "event-2032-12-31",
    name: "Test",
    event_date: "2032-12-31",
    venue_name: "Venue",
    venue_address: "Address",
    timezone: "America/New_York",
    status: "draft",
    admission_mode: "ticketed",
    ticket_name: "General Admission",
    price: "10",
    publish_at_local: "2032-12-01T10:00",
    start_time: "20:00",
    end_time: "01:30",
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  const parsed = parseAdminEvent(form);
  assert.ok(parsed.success);
  assert.equal(parsed.data.starts_at_local, "2032-12-31T20:00");
  assert.equal(parsed.data.ends_at_local, "2033-01-01T01:30");
  form.set("end_time", "23:30");
  const sameDay = parseAdminEvent(form);
  assert.ok(sameDay.success);
  assert.equal(sameDay.data.ends_at_local, "2032-12-31T23:30");
});

test("rescheduling and duplicated drafts generate new date slugs while name-only edits preserve the slug", () => {
  const original = { slug: "original-event-2033-01-09", event_date: "2033-01-09" };
  assert.equal(generatedSlugForEvent("Updated name", "2033-01-09", original), original.slug);
  assert.equal(generatedSlugForEvent("Updated name", "2033-01-10", original), "updated-name-2033-01-10");
  assert.equal(generatedSlugForEvent("Event", "2033-01-09", { ...original, slug: `draft-${"a".repeat(32)}` }), "event-2033-01-09");
});

test("admin events show nearest dates first and ended/completed events separately newest first", () => {
  const event = (id: string, date: string, status = "published", ends_at = `${date}T23:00:00Z`) => ({
    id,
    event_date: date,
    starts_at: `${date}T20:00:00Z`,
    ends_at,
    status: status as "published" | "completed" | "draft",
  });
  const input = [
    event("later", "2033-01-20"),
    event("oldest", "2032-12-01"),
    event("nearest", "2033-01-10", "draft"),
    event("recent", "2033-01-09"),
    event("completed", "2033-01-10", "completed"),
    event("ongoing", "2033-01-09", "published", "2033-01-10T03:00:00Z"),
  ];
  const result = groupAdminEvents(input, "2033-01-10T01:00:00Z");
  assert.deepEqual(
    result.upcoming.map((e) => e.id),
    ["ongoing", "nearest", "later"],
  );
  assert.deepEqual(
    result.past.map((e) => e.id),
    ["completed", "recent", "oldest"],
  );
  assert.equal(input[0].id, "later");
  assert.deepEqual(groupAdminEvents([], "2033-01-10T01:00:00Z"), { upcoming: [], past: [] });
  assert.equal(groupAdminEvents([event("boundary", "2033-01-09")], "2033-01-09T23:00:00Z").past.length, 1);
});
