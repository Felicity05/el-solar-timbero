import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const hash = "a".repeat(64);
async function fixture() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;");
  const files = readdirSync(migrationDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    if (f.includes("paid_ticket")) {
      await db.exec(`insert into public.rsvps(event_slug,name,email,phone,referral_source,gift_card_disclaimer_accepted,disclaimer_version,contact_id,event_id,submitted_name,submitted_email,submitted_phone)
       select slug,'Historical Person','old@example.com','+12025550110','Instagram',true,'2026-10-12-v1',
       (select id from public.contacts where phone='+12025550110'),id,'Historical Person','old@example.com','+12025550110'
       from public.events where slug='cuban-night-social-2026-10-12'`);
    }
    // Create the contact for the historical fixture immediately after normalization.
    await db.exec(readFileSync(new URL(f, migrationDir), "utf8"));
    if (f.includes("normalize_recurring")) await db.exec("insert into public.contacts(name,email,phone) values('Historical Person','old@example.com','+12025550110')");
  }
  await db.exec(`insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode,ticket_sales_open)
    values('paid-test','LOCAL ONLY Ticket',current_date+365,(current_date+365)::timestamp at time zone 'UTC',
    (current_date+366)::timestamp at time zone 'UTC','UTC','Test','LOCAL ONLY','published','ticketed',true);
    insert into public.ticket_types(event_id,name,price_cents) select id,'General Admission',1000 from public.events where slug='paid-test';`);
  return db;
}
async function init(db: PGlite, phone = "+12025550111", access = hash, name = "Test Buyer", email = "buyer@example.com") {
  const r = await db.query<{
    value: {
      status: string;
      order_id: string;
      event_id: string;
      ticket_type_id: string;
      amount_cents: number;
      currency: string;
    };
  }>("select public.initialize_ticket_order('paid-test',$1,$2,$3,'Instagram',$4) value", [name, email, phone, access]);
  return r.rows[0].value;
}
async function fulfill(db: PGlite, o: Awaited<ReturnType<typeof init>>, id: string, type = "payment_intent.succeeded", amount = 1000) {
  return db.query("select public.process_ticket_payment($1,$2,$3,$4,$5,'pi_localtest',$6,'usd',$7,$8,$9) value", [
    id,
    type,
    o.order_id,
    o.event_id,
    o.ticket_type_id,
    amount,
    type.endsWith("succeeded") ? "succeeded" : "requires_payment_method",
    randomBytes(32).toString("hex"),
    `EST-${randomBytes(6).toString("hex").toUpperCase()}`,
  ]);
}
test("ticket migration preserves historical RSVP and enforces purchase/fulfillment invariants", async () => {
  const db = await fixture();
  try {
    const history = await db.query("select * from public.rsvps where phone='+12025550110'");
    assert.equal(history.rows.length, 1);
    const o = await init(db);
    assert.equal(o.status, "pending");
    assert.equal(o.amount_cents, 1000);
    assert.equal(o.currency, "usd");
    assert.equal((await init(db)).order_id, o.order_id);
    assert.equal((await init(db, "+12025550111", "b".repeat(64))).status, "recovery_required");
    assert.equal((await db.query("select * from public.orders")).rows.length, 1);
    const profile = (await db.query("select * from public.contacts where phone='+12025550111'")).rows;
    await init(db, "+12025550111", hash, "Changed Name", "changed@example.com");
    assert.deepEqual((await db.query("select * from public.contacts where phone='+12025550111'")).rows, profile);
    await db.query("select public.attach_ticket_payment_intent($1,$2,'pi_localtest')", [o.order_id, hash]);
    await assert.rejects(fulfill(db, o, "evt_wrong", "payment_intent.succeeded", 999));
    assert.equal((await db.query("select * from public.stripe_events")).rows.length, 0, "bad amount rolls back dedupe marker");
    assert.equal((await db.query("select * from public.tickets")).rows.length, 0);
    await fulfill(db, o, "evt_failed", "payment_intent.payment_failed");
    assert.equal((await db.query("select * from public.tickets")).rows.length, 0);
    await fulfill(db, o, "evt_success");
    await fulfill(db, o, "evt_success");
    await fulfill(db, o, "evt_success_second");
    const tickets = await db.query<{ ticket_token: string; ticket_code: string }>("select * from public.tickets");
    assert.equal(tickets.rows.length, 1);
    assert.match(tickets.rows[0].ticket_token, /^[a-f0-9]{64}$/);
    assert.match(tickets.rows[0].ticket_code, /^EST-[A-F0-9]{12}$/);
    assert.equal((await init(db)).status, "already_purchased");
    assert.deepEqual((await db.query("select * from public.contacts where phone='+12025550111'")).rows, profile);
    assert.deepEqual((await db.query("select * from public.rsvps where phone='+12025550110'")).rows, history.rows);
    const status = await db.query<{ value: { ticket_code: string } }>("select public.get_ticket_purchase('paid-test',$1) value", [hash]);
    assert.equal(status.rows[0].value.ticket_code, tickets.rows[0].ticket_code);
    assert.equal((await db.query<{ value: null }>("select public.get_ticket_purchase('paid-test',$1) value", ["b".repeat(64)])).rows[0].value, null);
    await assert.rejects(db.exec("insert into public.orders select * from public.orders"));
    await assert.rejects(db.exec("insert into public.tickets select * from public.tickets"));
    await assert.rejects(db.exec("insert into public.ticket_types(event_id,name,price_cents) select event_id,'Extra',1000 from public.ticket_types"));
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const table of ["contacts", "events", "rsvps", "ticket_types", "orders", "tickets", "stripe_events"]) {
        const allowed = await db.query<{ ok: boolean }>("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') ok", [role, `public.${table}`]);
        assert.equal(allowed.rows[0].ok, false, `${role} ${table}`);
      }
      if (role !== "service_role") {
        await db.exec(`set role ${role}`);
        await assert.rejects(init(db));
        await assert.rejects(db.query("select public.get_ticket_purchase('paid-test',$1)", [hash]));
        await assert.rejects(fulfill(db, o, "evt_forbidden"));
        await db.exec("reset role");
      }
    }
  } finally {
    await db.close();
  }
});
test("ticket discovery/sales checks are enforced server-side; RSVP stays separate", async () => {
  const db = await fixture();
  try {
    const discovery = async () =>
      (
        await db.query<{
          events: { slug: string; admission_mode: string; price_cents: number; open: boolean; sales_closed: boolean }[];
        }>("select public.get_available_rsvp_events() events")
      ).rows[0].events;
    assert.equal((await discovery()).find((e) => e.slug === "paid-test")?.price_cents, 1000);
    await db.exec("update public.events set ticket_sales_open=false where slug='paid-test'");
    assert.equal((await init(db)).status, "closed");
    assert.equal((await discovery()).find((e) => e.slug === "paid-test")?.sales_closed, true);
    assert.equal((await discovery()).find((e) => e.slug === "paid-test")?.open, false);
    await db.exec("update public.events set ticket_sales_open=true,status='completed' where slug='paid-test'");
    assert.equal((await init(db)).status, "closed");
    await db.exec("update public.events set status='published' where slug='paid-test'; update public.ticket_types set sales_end_at=now()-interval '1 day'");
    assert.equal((await init(db)).status, "closed");
    await db.exec("update public.ticket_types set sales_end_at=null,active=false");
    assert.equal((await init(db)).status, "closed");
    await db.exec("update public.ticket_types set active=true; update public.events set admission_mode='rsvp',ticket_sales_open=false,rsvp_open=true where slug='paid-test'");
    assert.equal((await init(db)).status, "closed");
    assert.equal((await db.query<{ v: string }>("select public.submit_normalized_rsvp('paid-test','Test Buyer','buyer@example.com','+12025550111','Instagram',false,null) v")).rows[0].v, "success");
    await db.exec("update public.events set admission_mode='ticketed',ticket_sales_open=true where slug='paid-test'");
    assert.equal((await db.query<{ v: string }>("select public.submit_normalized_rsvp('paid-test','Test Buyer','buyer@example.com','+12025550111','Instagram',false,null) v")).rows[0].v, "closed");
    assert.equal((await db.query<{ v: { open: boolean } }>("select public.get_rsvp_event('paid-test') v")).rows[0].v.open, false);
  } finally {
    await db.close();
  }
});

test("unpaid recovery rotates one order atomically and rejects stale attempts and paid recovery", async () => {
  const db = await fixture();
  try {
    const o = await init(db);
    const nextHash = "b".repeat(64);
    await db.query("select public.attach_ticket_payment_intent($1,$2,'pi_old')", [o.order_id, hash]);
    const recover = async (attempt: number, access: string) =>
      (await db.query<{ ok: boolean }>("select public.recover_ticket_order($1,$2,'pi_old',$3,'New Buyer','new@example.com','+12025550111','Instagram') ok", [o.order_id, attempt, access])).rows[0].ok;
    assert.equal(await recover(0, nextHash), true);
    assert.equal(await recover(0, "c".repeat(64)), false, "a stale recovery cannot steal the new attempt");
    assert.equal((await db.query<{ ok: boolean }>("select public.attach_ticket_payment_intent($1,$2,'pi_old',0) ok", [o.order_id, hash])).rows[0].ok, false);
    assert.equal(
      (await db.query<{ ok: boolean }>("select public.attach_ticket_payment_intent($1,$2,'pi_old',0) ok", [o.order_id, nextHash])).rows[0].ok,
      false,
      "attempt check protects even the same credential",
    );
    assert.equal((await db.query("select * from public.orders")).rows.length, 1);
    const current = (
      await db.query<{
        payment_attempt: number;
        submitted_name: string;
        stripe_payment_intent_id: null;
      }>("select * from public.orders")
    ).rows[0];
    assert.equal(current.payment_attempt, 1);
    assert.equal(current.stripe_payment_intent_id, null);
    assert.equal(current.submitted_name, "New Buyer");
    assert.equal((await db.query<{ value: null }>("select public.get_ticket_purchase('paid-test',$1) value", [hash])).rows[0].value, null);
    await db.query("select public.attach_ticket_payment_intent($1,$2,'pi_localtest',1)", [o.order_id, nextHash]);
    const failed = await db.query<{ value: string }>(
      "select public.process_ticket_payment('evt_old_failed','payment_intent.payment_failed',$1,$2,$3,'pi_old',1000,'usd','requires_payment_method',$4,$5) value",
      [o.order_id, o.event_id, o.ticket_type_id, "f".repeat(64), "EST-FFFFFFFFFFFF"],
    );
    assert.equal(failed.rows[0].value, "superseded");
    await fulfill(db, o, "evt_recovered_paid");
    await fulfill(db, o, "evt_recovered_paid");
    assert.equal((await db.query("select * from public.tickets")).rows.length, 1);
    assert.equal(await recover(1, hash), false);
    assert.equal((await init(db)).status, "already_purchased");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(recover(1, hash));
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("ticket display reads require opaque credentials, expose no attendee data and never mutate admission state", async () => {
  const db = await fixture();
  try {
    const o = await init(db);
    const purchase = async () => (await db.query<{ value: Record<string, unknown> }>("select public.get_ticket_purchase('paid-test',$1) value", [hash])).rows[0].value;
    const byToken = async (token: string) => (await db.query<{ value: Record<string, unknown> | null }>("select public.get_ticket_by_token($1) value", [token])).rows[0].value;
    assert.equal((await purchase()).ticket_token, null);
    await db.query("select public.attach_ticket_payment_intent($1,$2,'pi_localtest')", [o.order_id, hash]);
    await fulfill(db, o, "evt_qr_paid");
    const before = (await db.query<{ ticket_token: string; checked_in_at: null }>("select * from public.tickets where order_id=$1", [o.order_id])).rows[0];
    assert.match(before.ticket_token, /^[a-f0-9]{64}$/);
    const display = await byToken(before.ticket_token);
    assert.ok(display);
    assert.equal(display.ticket_token, before.ticket_token);
    assert.equal((await purchase()).ticket_token, before.ticket_token);
    for (const field of [
      "name",
      "email",
      "phone",
      "submitted_name",
      "submitted_email",
      "submitted_phone",
      "contact_id",
      "order_id",
      "event_id",
      "ticket_type_id",
      "stripe_payment_intent_id",
      "checked_in_at",
    ])
      assert.ok(!(field in display));
    await fulfill(db, o, "evt_qr_paid");
    await fulfill(db, o, "evt_qr_distinct_delivery");
    assert.deepEqual((await db.query("select * from public.tickets where order_id=$1", [o.order_id])).rows[0], before);
    for (const token of ["invalid", "EST-123456ABCDEF", "0".repeat(64)]) assert.equal(await byToken(token), null);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(byToken(before.ticket_token));
      await db.exec("reset role");
    }
    await db.query("update public.tickets set status='refunded' where order_id=$1", [o.order_id]);
    assert.equal(await byToken(before.ticket_token), null);
    assert.equal((await purchase()).ticket_token, null);
    assert.equal(before.checked_in_at, null);
  } finally {
    await db.close();
  }
});

for (const [date, timezone, noonUTC] of [
  ["2031-07-04", "America/New_York", "2031-07-04T16:00:00Z"],
  ["2031-01-04", "America/New_York", "2031-01-04T17:00:00Z"],
  ["2031-07-04", "Asia/Tokyo", "2031-07-04T03:00:00Z"],
] as const)
  test(`noon cutoff is authoritative in ${timezone} on ${date}`, async () => {
    const db = await fixture();
    try {
      await db.query(
        `update public.events set event_date=$1::date, timezone=$2,
      starts_at=($1::date+time '20:00') at time zone $2,ends_at=($1::date+time '23:00') at time zone $2 where slug='paid-test'`,
        [date, timezone],
      );
      await db.exec("update public.ticket_types set sales_end_at=null");
      const deadline = (await db.query<{ deadline: string }>("select sales_end_at::text deadline from public.ticket_types")).rows[0].deadline;
      assert.equal(new Date(deadline).toISOString(), new Date(noonUTC).toISOString());
      // Isolated test database clock only. Production RPCs accept no caller time.
      await db.exec(`create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql volatile as $$select current_setting('test.now')::timestamptz$$`);
      const setTime = async (value: string) => db.query("select set_config('test.now',$1,false)", [value]);
      await setTime(new Date(Date.parse(noonUTC) - 1).toISOString());
      assert.equal((await init(db)).status, "pending");
      const count = async () => Number((await db.query<{ n: number }>("select count(*)::int n from public.orders")).rows[0].n);
      assert.equal(await count(), 1);
      await setTime(noonUTC);
      assert.equal((await init(db, "+12025550112", "b".repeat(64))).status, "closed");
      assert.equal((await init(db)).status, "closed", "pending orders cannot reinitialize after noon");
      assert.equal(await count(), 1);
      assert.equal((await db.query("select * from public.contacts where phone='+12025550112'")).rows.length, 0);
      const discovered = (await db.query<{ events: { slug: string; open: boolean; sales_closed: boolean }[] }>("select public.get_available_rsvp_events() events")).rows[0].events.find(
        (e) => e.slug === "paid-test",
      );
      assert.equal(discovered?.open, false);
      assert.equal(discovered?.sales_closed, true);
      await setTime(new Date(Date.parse(noonUTC) + 1).toISOString());
      assert.equal((await init(db, "+12025550112", "b".repeat(64))).status, "closed");
      // Neither a NULL nor a later configured end may bypass the hard cap.
      await db.exec("update public.ticket_types set sales_end_at='2040-01-01Z'");
      assert.equal(new Date((await db.query<{ v: string }>("select sales_end_at::text v from public.ticket_types")).rows[0].v).toISOString(), new Date(noonUTC).toISOString());
    } finally {
      await db.close();
    }
  });
