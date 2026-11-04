import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { hashDoorPin, matchesDoorPin, createDoorSession, validDoorSession } from "../src/lib/check-in/security";

async function database() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role");
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(name, directory), "utf8"));
  return db;
}
const config = {
  slug: "admin-test",
  name: "LOCAL ONLY Admin Event",
  event_date: "2031-11-09",
  description: "Test description",
  venue_name: "Test Venue",
  venue_address: "Test Address",
  starts_at_local: "2031-11-09T20:00",
  ends_at_local: "2031-11-09T23:30",
  timezone: "America/New_York",
  publish_at_local: "2025-01-01T00:00",
  status: "published",
  admission_mode: "ticketed",
  rsvp_open: false,
  ticket_sales_open: true,
  gift_card_disclaimer_version: "",
  ticket_name: "General Admission",
  ticket_description: "Test",
  price_cents: 1000,
  ticket_active: true,
  sales_start_local: "",
  sales_end_local: "",
};
async function save(db: PGlite, value = config, id: string | null = null) {
  return (await db.query<{ value: string }>("select public.admin_save_event($1,$2::jsonb) value", [id, JSON.stringify(value)])).rows[0].value;
}
test("admin configuration CRUD, scheduled publication, one ticketed window and configuration-only duplication", async () => {
  const db = await database();
  try {
    const id = await save(db);
    let detail = (
      await db.query<{ value: { event: { name: string; status: string; has_check_in_pin: boolean }; metrics: { tickets_sold: number }; ticket_type: { price_cents: number } } }>(
        "select public.admin_event_detail($1) value",
        [id],
      )
    ).rows[0].value;
    const options = (await db.query<{ value: { ticket_names: string[]; disclaimer_versions: string[] } }>("select public.admin_event_form_options() value")).rows[0].value;
    assert.ok(options.ticket_names.includes("General Admission"));
    const historicalVersion = (await db.query<{ version: string }>("select gift_card_disclaimer_version version from public.events where slug='cuban-night-social-2026-10-12'")).rows[0].version;
    assert.ok(options.disclaimer_versions.includes(historicalVersion));
    assert.equal(detail.ticket_type.price_cents, 1000);
    assert.equal(detail.metrics.tickets_sold, 0);
    await save(db, { ...config, name: "Edited Name" }, id);
    detail = (await db.query<{ value: typeof detail }>("select public.admin_event_detail($1) value", [id])).rows[0].value;
    assert.equal(detail.event.name, "Edited Name");
    await assert.rejects(save(db, { ...config, slug: "overlap" }), (e: { code?: string }) => e.code === "23P01");
    const next = await save(db, {
      ...config,
      slug: "future-event",
      event_date: "2031-11-16",
      starts_at_local: "2031-11-16T20:00",
      ends_at_local: "2031-11-16T23:30",
      publish_at_local: "2031-11-10T00:00",
    });
    const discovered = (await db.query<{ value: { slug: string }[] }>("select public.get_available_rsvp_events() value")).rows[0].value;
    assert.deepEqual(
      discovered.filter((e) => [config.slug, "future-event"].includes(e.slug)).map((e) => e.slug),
      [config.slug],
    );
    const futureOrder = (
      await db.query<{ value: { status: string } }>("select public.initialize_ticket_order('future-event','Test Buyer','test@example.com','+12025550188','Instagram',repeat('a',64)) value")
    ).rows[0].value;
    assert.equal(futureOrder.status, "closed");
    assert.equal((await db.query("select * from public.orders")).rows.length, 0);
    const hash = hashDoorPin("12345678");
    await db.query("select public.admin_set_event_pin($1,$2)", [id, hash]);
    const copy = (await db.query<{ value: string }>("select public.admin_duplicate_event($1) value", [id])).rows[0].value;
    const duplicated = (await db.query<{ value: typeof detail }>("select public.admin_event_detail($1) value", [copy])).rows[0].value;
    assert.equal(duplicated.event.status, "draft");
    assert.match((await db.query<{ slug: string }>("select slug from public.events where id=$1", [copy])).rows[0].slug, /^draft-[a-f0-9]{32}$/);
    assert.equal(duplicated.event.has_check_in_pin, false);
    assert.equal(duplicated.ticket_type.price_cents, 1000);
    for (const table of ["orders", "tickets", "rsvps"]) assert.equal((await db.query(`select * from public.${table} where event_id=$1`, [copy])).rows.length, 0);
    assert.ok(!JSON.stringify(duplicated).includes(hash));
    // Advance the database clock exactly to the scheduled boundary.
    await db.exec(`create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql volatile as $$select '2031-11-10T05:00:00Z'::timestamptz$$`);
    // PGlite caches SQL-function plans: recompile after replacing its test clock.
    await db.exec(
      `${readFileSync(new URL("../supabase/migrations/20261102221255_admin_v1_scheduling_and_door_pins.sql", import.meta.url), "utf8")
        .split("create or replace function public.get_available_rsvp_events()")[1]
        .split("$$;")[0]
        .replace(/^/, "create or replace function public.get_available_rsvp_events()")}$$;`,
    );
    const visible = (await db.query<{ value: { slug: string }[] }>("select public.get_available_rsvp_events() value")).rows[0].value;
    assert.ok(visible.some((e) => e.slug === "future-event"));
    assert.ok(!visible.some((e) => e.slug === config.slug));
    assert.ok(next);
    for (const role of ["anon", "authenticated"]) {
      for (const fn of [
        "admin_list_events()",
        "admin_event_form_options()",
        "admin_event_detail(uuid)",
        "admin_save_event(uuid,jsonb)",
        "admin_duplicate_event(uuid)",
        "admin_set_event_pin(uuid,text)",
        "get_active_door_event()",
      ]) {
        assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, `public.${fn}`])).rows[0].allowed, false);
      }
    }
    assert.equal((await db.query<{ allowed: boolean }>("select has_table_privilege('service_role','public.events','SELECT,INSERT,UPDATE,DELETE') allowed")).rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
test("active event PIN hashes and four-hour sessions follow publication and regeneration", async () => {
  const db = await database();
  try {
    const id = await save(db);
    const first = hashDoorPin("12345678");
    await db.query("select public.admin_set_event_pin($1,$2)", [id, first]);
    const active = (await db.query<{ value: { slug: string; pin_hash: string } }>("select public.get_active_door_event() value")).rows[0].value;
    assert.equal(active.slug, config.slug);
    assert.ok(matchesDoorPin("12345678", active.pin_hash));
    const context = { eventSlug: active.slug, pinHash: active.pin_hash, secret: "s".repeat(64), siteUrl: "http://localhost:3000" };
    const cookie = createDoorSession(context);
    assert.ok(validDoorSession(cookie, context));
    const second = hashDoorPin("87654321");
    await db.query("select public.admin_set_event_pin($1,$2)", [id, second]);
    assert.ok(!validDoorSession(cookie, { ...context, pinHash: second }));
    assert.ok(!matchesDoorPin("12345678", second));
    await save(db, { ...config, publish_at_local: "2030-01-01T00:00" }, id);
    assert.equal((await db.query<{ value: null }>("select public.get_active_door_event() value")).rows[0].value, null);
    await save(db, { ...config, status: "completed" }, id);
    const next = await save(db, { ...config, slug: "next-door-event", event_date: "2031-11-16", starts_at_local: "2031-11-16T20:00", ends_at_local: "2031-11-16T23:30" });
    await db.query("select public.admin_set_event_pin($1,$2)", [next, second]);
    const nextActive = (await db.query<{ value: { slug: string; pin_hash: string } }>("select public.get_active_door_event() value")).rows[0].value;
    assert.equal(nextActive.slug, "next-door-event");
    assert.ok(matchesDoorPin("87654321", nextActive.pin_hash));
    assert.ok(!matchesDoorPin("12345678", nextActive.pin_hash));
    assert.ok(!validDoorSession(cookie, { ...context, eventSlug: nextActive.slug, pinHash: nextActive.pin_hash }));
  } finally {
    await db.close();
  }
});

test("scheduled RSVP visibility, transactional rejection, and timezone validation", async () => {
  const db = await database();
  try {
    const free = { ...config, slug: "scheduled-rsvp", admission_mode: "rsvp", rsvp_open: true, publish_at_local: "2030-01-01T10:00" };
    const id = await save(db, free);
    assert.equal((await db.query<{ value: null }>("select public.get_rsvp_event('scheduled-rsvp') value")).rows[0].value, null);
    assert.equal(
      (await db.query<{ value: string }>("select public.submit_normalized_rsvp('scheduled-rsvp','Test Buyer','test@example.com','+12025550188','Instagram',false,null) value")).rows[0].value,
      "closed",
    );
    assert.equal((await db.query("select * from public.contacts")).rows.length, 0);
    await save(db, { ...free, publish_at_local: "2025-01-01T10:00" }, id);
    assert.equal(
      (await db.query<{ value: string }>("select public.submit_normalized_rsvp('scheduled-rsvp','Test Buyer','test@example.com','+12025550188','Instagram',false,null) value")).rows[0].value,
      "success",
    );
    await assert.rejects(save(db, { ...free, admission_mode: "ticketed" }, id), (e: { code?: string }) => e.code === "22023");
    await assert.rejects(save(db, { ...config, slug: "bad-zone", status: "draft", timezone: "Not/AZone" }), (e: { code?: string }) => e.code === "22023");
    await assert.rejects(
      save(db, { ...config, slug: "bad-dst", status: "draft", event_date: "2031-03-09", starts_at_local: "2031-03-09T02:30", ends_at_local: "2031-03-09T04:00" }),
      (e: { code?: string }) => e.code === "22023",
    );
  } finally {
    await db.close();
  }
});

test("duplicated drafts publish two local calendar days after copying and keep manual publication edits when rescheduled", async () => {
  const db = await database();
  try {
    const id = await save(db, { ...config, status: "draft" });
    const copy = (await db.query<{ id: string }>("select public.admin_duplicate_event($1) id", [id])).rows[0].id;
    const defaults = (
      await db.query<{ status: string; correct_day: boolean; correct_time: boolean; inherited: boolean }>(
        `select status,
   (publish_at at time zone timezone)::date=((statement_timestamp() at time zone timezone)::date+2) correct_day,
   date_trunc('minute',publish_at at time zone timezone)::time=date_trunc('minute',statement_timestamp() at time zone timezone)::time correct_time,
   publish_at=(select publish_at from public.events where id=$2) inherited from public.events where id=$1`,
        [copy, id],
      )
    ).rows[0];
    assert.equal(defaults.status, "draft");
    assert.ok(defaults.correct_day);
    assert.ok(defaults.correct_time);
    assert.equal(defaults.inherited, false);
    await save(
      db,
      { ...config, status: "draft", slug: "edited-copy", publish_at_local: "2031-10-01T10:00", event_date: "2031-11-16", starts_at_local: "2031-11-16T20:00", ends_at_local: "2031-11-16T23:30" },
      copy,
    );
    assert.equal(
      (await db.query<{ local: string }>("select to_char(publish_at at time zone timezone,'YYYY-MM-DD HH24:MI') local from public.events where id=$1", [copy])).rows[0].local,
      "2031-10-01 10:00",
    );
  } finally {
    await db.close();
  }
});
