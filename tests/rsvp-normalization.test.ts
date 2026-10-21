import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const legacy = readFileSync(new URL("../supabase/migrations/20260929170927_create_rsvps.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261019160523_normalize_recurring_events.sql", import.meta.url), "utf8");
const slug = "cuban-night-social-2026-10-12";

async function fixture() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(legacy);
  // Model Supabase projects that automatically grant new public tables access.
  await db.exec("alter default privileges in schema public grant all on tables to anon, authenticated, service_role;");
  return db;
}

async function seed(db: PGlite, phone: string, event = slug, name = "María Pérez") {
  await db.query(
    `insert into public.rsvps
    (event_slug, name, email, phone, referral_source, gift_card_disclaimer_accepted, disclaimer_version, created_at)
    values ($1, $2, 'shared@example.com', $3, 'Instagram', true, '2026-10-12-v1', '2026-10-01T12:00:00Z')`,
    [event, name, phone],
  );
}

test("normalization preserves every legacy value, snapshots, identity and server-only access", async () => {
  const db = await fixture();
  try {
    await seed(db, "+12015550123");
    await seed(db, "+12015550124", slug, "Other Person");
    const before = await db.query("select * from public.rsvps order by id");
    await db.exec(migration);
    const after = await db.query(`select id, event_slug, name, email, phone, referral_source,
      gift_card_disclaimer_accepted, disclaimer_version, created_at from public.rsvps order by id`);
    assert.deepEqual(after.rows, before.rows);
    const verification = await db.query<{
      count: number;
    }>(`select count(*)::int as count from public.rsvps r
      join public.contacts c on c.id = r.contact_id join public.events e on e.id = r.event_id
      where c.phone = r.phone and e.slug = r.event_slug and r.submitted_name = r.name
        and r.submitted_email = r.email and r.submitted_phone = r.phone`);
    assert.equal(verification.rows[0].count, 2);
    const event = await db.query("select event_date::text, starts_at, ends_at, timezone, status, rsvp_open from public.events");
    assert.deepEqual(event.rows[0], {
      event_date: "2026-10-12",
      starts_at: new Date("2026-10-13T00:00:00Z"),
      ends_at: new Date("2026-10-13T03:30:00Z"),
      timezone: "America/New_York",
      status: "completed",
      rsvp_open: false,
    });
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const table of ["contacts", "events", "rsvps"]) {
        const grants = await db.query<{ allowed: boolean }>(
          `select
          has_table_privilege($1, $2, 'SELECT') or has_table_privilege($1, $2, 'INSERT') or
          has_table_privilege($1, $2, 'UPDATE') or has_table_privilege($1, $2, 'DELETE') as allowed`,
          [role, `public.${table}`],
        );
        assert.equal(grants.rows[0].allowed, false);
      }
    }
    const rls = await db.query<{
      relrowsecurity: boolean;
    }>(`select relrowsecurity from pg_class
      where oid in ('public.contacts'::regclass, 'public.events'::regclass, 'public.rsvps'::regclass)`);
    assert.equal(rls.rows.length, 3);
    assert.ok(rls.rows.every((row) => row.relrowsecurity));
    await assert.rejects(db.exec("insert into public.contacts (name,email,phone) select name,email,phone from public.contacts limit 1"), (e: { code?: string }) => e.code === "23505");
    await assert.rejects(db.exec("delete from public.contacts"), (e: { code?: string }) => e.code === "23001" || e.code === "23503");
    await assert.rejects(db.exec("delete from public.events"), (e: { code?: string }) => e.code === "23001" || e.code === "23503");
    // Existing event/phone constraint cannot mask failure of the new pair constraint.
    await db.exec("alter table public.rsvps drop constraint rsvps_event_phone_key");
    await assert.rejects(
      db.exec(`insert into public.rsvps
      (event_slug,name,email,phone,referral_source,gift_card_disclaimer_accepted,disclaimer_version,
       contact_id,event_id,submitted_name,submitted_email,submitted_phone)
      select event_slug,name,email,phone,referral_source,gift_card_disclaimer_accepted,disclaimer_version,
       contact_id,event_id,submitted_name,submitted_email,submitted_phone from public.rsvps limit 1`),
      (e: { code?: string; constraint?: string }) => e.code === "23505" && e.constraint === "rsvps_contact_event_key",
    );
    await db.exec("update public.contacts set name = 'Current Name', email = 'new@example.com'");
    const snapshots = await db.query<{ submitted_email: string }>("select submitted_email from public.rsvps");
    assert.ok(snapshots.rows.every((row) => row.submitted_email === "shared@example.com"));
    await assert.rejects(db.exec("update public.events set timezone = 'Invalid/Zone'"), (e: { code?: string }) => e.code === "23514");
    await assert.rejects(db.exec("update public.events set rsvp_open = true"), (e: { code?: string }) => e.code === "23514");
  } finally {
    await db.close();
  }
});

test("optional promotion disclaimer pairs allow non-promotion RSVPs without changing historical consent", async () => {
  const db = await fixture();
  try {
    await seed(db, "+12015550123");
    await db.exec(migration);
    await db.exec(`insert into public.events
      (slug,name,event_date,venue_name,venue_address,starts_at,ends_at,timezone)
      values ('no-promotion', 'El Solar Timbero', '2026-10-26', 'Guantanamera',
        '939 8th Ave, New York, NY 10019', '2026-10-26T20:00:00-04',
        '2026-10-26T23:30:00-04', 'America/New_York')`);
    const insert = `insert into public.rsvps
      (event_slug,name,email,phone,contact_id,event_id,submitted_name,submitted_email,submitted_phone,
       referral_source,gift_card_disclaimer_accepted,disclaimer_version)
      select e.slug,r.name,r.email,r.phone,r.contact_id,e.id,r.submitted_name,r.submitted_email,
        r.submitted_phone,r.referral_source,$1,$2
      from public.rsvps r cross join public.events e
      where r.event_slug = $3 and e.slug = 'no-promotion'`;
    for (const pair of [
      [true, null],
      [null, "2026-10-12-v1"],
      [false, null],
      [false, "2026-10-12-v1"],
      [true, ""],
      [true, " untrimmed "],
    ]) {
      await assert.rejects(db.query(insert, [...pair, slug]), (e: { code?: string }) => e.code === "23514");
    }
    await db.query(insert, [null, null, slug]);
    const pairs = await db.query(`select event_slug,gift_card_disclaimer_accepted,disclaimer_version
      from public.rsvps order by event_slug`);
    assert.deepEqual(pairs.rows, [
      {
        event_slug: slug,
        gift_card_disclaimer_accepted: true,
        disclaimer_version: "2026-10-12-v1",
      },
      {
        event_slug: "no-promotion",
        gift_card_disclaimer_accepted: null,
        disclaimer_version: null,
      },
    ]);
    const columns = await db.query<{
      is_nullable: string;
      column_default: string | null;
    }>(`select is_nullable,column_default
      from information_schema.columns where table_schema = 'public' and table_name = 'rsvps'
      and column_name in ('gift_card_disclaimer_accepted','disclaimer_version')`);
    assert.equal(columns.rows.length, 2);
    assert.ok(columns.rows.every((row) => row.is_nullable === "YES" && row.column_default === null));
    const constraints = await db.query<{
      conname: string;
    }>(`select conname from pg_constraint
      where conrelid = 'public.rsvps'::regclass and conname in ('rsvps_event_phone_key','rsvps_contact_event_key')`);
    assert.equal(constraints.rows.length, 2);
    await db.exec("set role service_role");
    await assert.rejects(db.query(insert, [null, null, slug]), (e: { code?: string }) => e.code === "42501");
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});

test("event dates identify local calendar days while names and dates may repeat", async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    await db.exec("set timezone = 'Asia/Tokyo'");
    const insert = `insert into public.events
      (slug, name, event_date, venue_name, venue_address, starts_at, ends_at, timezone)
      values ($1, 'El Solar Timbero — Cuban Night Social', $2, 'Guantanamera',
        '939 8th Ave, New York, NY 10019', $3, $4, $5)`;
    // Both October instants are the following UTC day; event_date stays local.
    await db.query(insert, ["october-26", "2026-10-26", "2026-10-27T00:00:00Z", "2026-10-27T03:30:00Z", "America/New_York"]);
    await db.query(insert, ["october-26-second", "2026-10-26", "2026-10-27T00:00:00Z", "2026-10-27T03:30:00Z", "America/New_York"]);
    // After DST ends, New York is UTC-05; an overnight event uses its start date.
    await db.query(insert, ["november-2", "2026-11-02", "2026-11-03T01:00:00Z", "2026-11-03T07:00:00Z", "America/New_York"]);
    for (const sessionZone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      await db.query("select set_config('TimeZone', $1, false)", [sessionZone]);
      const dates = await db.query<{
        event_date: string;
        matches: boolean;
      }>(`select event_date::text,
        event_date = (starts_at at time zone timezone)::date as matches
        from public.events order by event_date, slug`);
      assert.deepEqual(
        dates.rows.map((row) => row.event_date),
        ["2026-10-12", "2026-10-26", "2026-10-26", "2026-11-02"],
      );
      assert.ok(dates.rows.every((row) => row.matches));
    }
    for (const [date, code] of [
      [null, "23502"],
      ["infinity", "23514"],
      ["2026-10-27", "23514"],
    ]) {
      await assert.rejects(db.query(insert, ["invalid-date", date, "2026-10-27T00:00:00Z", "2026-10-27T03:30:00Z", "America/New_York"]), (e: { code?: string }) => e.code === code);
    }
    // Date, start instant, and timezone edits must remain consistent.
    for (const update of ["event_date = '2026-10-27'", "timezone = 'Asia/Tokyo'"]) {
      await assert.rejects(db.exec(`update public.events set ${update} where slug = 'october-26'`), (e: { code?: string }) => e.code === "23514");
    }
    await assert.rejects(db.exec("update public.events set starts_at = '2026-10-25T20:00:00-04' where slug = 'october-26'"), (e: { code?: string }) => e.code === "23514");
    await db.exec(`update public.events set event_date = '2026-10-27',
      starts_at = '2026-10-27T20:00:00-04', ends_at = '2026-10-28T01:00:00-04'
      where slug = 'october-26'`);
    const rescheduled = await db.query<{ event_date: string }>("select event_date::text from public.events where slug = 'october-26'");
    assert.equal(rescheduled.rows[0].event_date, "2026-10-27");
  } finally {
    await db.close();
  }
});

test("normalization seeds the event safely when there are no RSVPs", async () => {
  const db = await fixture();
  try {
    await db.exec(migration);
    const counts = await db.query(
      "select (select count(*)::int from public.rsvps) as rsvps, (select count(*)::int from public.contacts) as contacts, (select count(*)::int from public.events) as events",
    );
    assert.deepEqual(counts.rows[0], { rsvps: 0, contacts: 0, events: 1 });
  } finally {
    await db.close();
  }
});

for (const scenario of ["duplicate", "dirty", "historical-disclaimer", "unknown-event", "existing-target"] as const) {
  test(`normalization aborts and rolls back without losing history: ${scenario}`, async () => {
    const db = await fixture();
    try {
      await seed(db, "+12015550123");
      if (scenario === "duplicate") {
        await db.exec("alter table public.rsvps drop constraint rsvps_event_phone_key");
        await seed(db, "+12015550123", slug, "Changed Name");
      } else if (scenario === "dirty") {
        await db.exec("alter table public.rsvps drop constraint rsvps_phone_check; update public.rsvps set phone = '2015550123'");
      } else if (scenario === "historical-disclaimer") {
        await db.exec(`alter table public.rsvps alter column gift_card_disclaimer_accepted drop not null,
          alter column disclaimer_version drop not null;
          update public.rsvps set gift_card_disclaimer_accepted = null, disclaimer_version = null`);
      } else if (scenario === "unknown-event") {
        await seed(db, "+12015550123", "unreviewed-event");
      } else {
        await db.exec("create table public.contacts (sentinel text)");
      }
      const before = await db.query("select * from public.rsvps order by id");
      await assert.rejects(db.exec(migration));
      await db.exec("rollback");
      assert.deepEqual((await db.query("select * from public.rsvps order by id")).rows, before.rows);
      const remaining = await db.query<{ events: string | null }>("select to_regclass('public.events') as events");
      assert.equal(remaining.rows[0].events, null);
      const columns = await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'rsvps' and column_name = 'contact_id'");
      assert.equal(columns.rows.length, 0);
    } finally {
      await db.close();
    }
  });
}
