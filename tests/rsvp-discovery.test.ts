import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const files = [
  "20260929170927_create_rsvps.sql", "20261019160523_normalize_recurring_events.sql",
  "20261019203757_normalized_rsvp_submission.sql", "20261020021415_discover_available_rsvp_events.sql",
];

test("discovery returns all eligible events in stable upcoming order with restricted execution", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    for (const file of files) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    for (const [slug, status, open, days] of [
      ["later", "published", true, 3], ["next", "published", true, 1],
      ["closed", "published", false, 1], ["draft", "draft", false, 1],
      ["completed", "completed", false, 1], ["past", "published", true, -1],
    ] as const) {
      await db.query(`insert into public.events (slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,rsvp_open)
        values ($1,'Same Event Name',(now() at time zone 'UTC')::date+$4::int,
        ((now() at time zone 'UTC')::date+$4::int)::timestamp at time zone 'UTC',
        ((now() at time zone 'UTC')::date+$4::int+1)::timestamp at time zone 'UTC',
        'UTC','Test Venue','Test Address',$2,$3)`, [slug, status, open, days]);
    }
    await db.exec("set role service_role");
    const result = await db.query<{ events: Array<{ slug: string; disclaimer_version: string | null }> }>("select public.get_available_rsvp_events() as events");
    assert.deepEqual(result.rows[0].events.map(event => event.slug), ["next", "later"]);
    assert.ok(result.rows[0].events.every(event => Object.hasOwn(event, "disclaimer_version") && event.disclaimer_version === null));
    await assert.rejects(db.exec("select * from public.events"), (e: { code?: string }) => e.code === "42501");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.exec("select public.get_available_rsvp_events()"), (e: { code?: string }) => e.code === "42501");
    }
    await db.exec("reset role; update public.events set rsvp_open=false; set role service_role");
    const empty = await db.query<{ events: unknown[] }>("select public.get_available_rsvp_events() as events");
    assert.deepEqual(empty.rows[0].events, []);
  } finally { await db.close(); }
});
