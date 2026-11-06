import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { randomBytes } from "node:crypto";
const owner = "11111111-1111-4111-8111-111111111111",
  hash = "a".repeat(64);
async function setup(capacity: number | null = 2) {
  const db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;");
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(name, directory), "utf8"));
  const event = (
    await db.query<{ id: string }>(
      `insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode,ticket_sales_open,publish_at,ticket_capacity)
 values('capacity-test','LOCAL ONLY Capacity',current_date+365,(current_date+365+time '20:00') at time zone 'America/New_York',(current_date+365+time '23:30') at time zone 'America/New_York','America/New_York','Test','Local','published','ticketed',true,now()-interval '1 day',$1) returning id`,
      [capacity],
    )
  ).rows[0].id;
  await db.query("insert into public.ticket_types(event_id,name,price_cents) values($1,'General Admission',1000)", [event]);
  return { db, event };
}
async function rpc<T = Record<string, unknown>>(db: PGlite, sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(`select ${sql} value`, args)).rows[0].value;
}
function gift(db: PGlite, event: string, phone = "+12025550111", name = "Gift Person", email = "gift@example.com") {
  return rpc<{ status: string; order_id: string; ticket_code: string; ticket_token: string }>(db, "public.admin_issue_complimentary_ticket($1,$2,$3,$4,$5,$6,$7,$8)", [
    event,
    name,
    email,
    phone,
    owner,
    randomBytes(32).toString("hex"),
    randomBytes(32).toString("hex"),
    `EST-${randomBytes(6).toString("hex").toUpperCase()}`,
  ]);
}
function init(db: PGlite, phone = "+12025550112") {
  return rpc<{ status: string; order_id: string; event_id: string; ticket_type_id: string; payment_attempt: number; reservation_expires_at: string }>(
    db,
    "public.initialize_ticket_order('capacity-test','Paid Person','paid@example.com',$1,'Instagram',$2)",
    [phone, hash],
  );
}

test("complimentary issuance reuses contact, creates one zero-dollar ticket, claims one email and remains check-in compatible", async () => {
  const { db, event } = await setup();
  try {
    const first = await gift(db, event);
    assert.equal(first.status, "issued");
    assert.match(first.ticket_token, /^[a-f0-9]{64}$/);
    const duplicate = await gift(db, event, "+12025550111", "Changed Name", "changed@example.com");
    assert.equal(duplicate.status, "already_issued");
    assert.equal(duplicate.ticket_token, first.ticket_token);
    assert.equal((await db.query("select * from public.contacts")).rows.length, 1);
    assert.equal((await db.query("select * from public.orders")).rows.length, 1);
    assert.equal((await db.query("select * from public.tickets")).rows.length, 1);
    const order = (
      await db.query<{ order_kind: string; amount_cents: number; stripe_payment_intent_id: null; complimentary_issued_by: string; submitted_email: string }>("select * from public.orders")
    ).rows[0];
    assert.equal(order.order_kind, "complimentary");
    assert.equal(order.amount_cents, 0);
    assert.equal(order.stripe_payment_intent_id, null);
    assert.equal(order.complimentary_issued_by, owner);
    assert.equal(order.submitted_email, "gift@example.com");
    const claimed = await rpc<{ ticket_token: string; amount_cents: number }>(db, "public.claim_complimentary_ticket_email($1)", [first.order_id]);
    assert.equal(claimed.ticket_token, first.ticket_token);
    assert.equal(claimed.amount_cents, 0);
    const recipients = await rpc<{ name: string; email: string; phone: string; ticket_code: string; email_attempted_at: string | null; checked_in_at: string | null }[]>(
      db,
      "public.admin_list_complimentary_recipients($1)",
      [event],
    );
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0].name, "Gift Person");
    assert.equal(recipients[0].email, "gift@example.com");
    assert.equal(recipients[0].phone, "+12025550111");
    assert.equal(recipients[0].ticket_code, first.ticket_code);
    assert.ok(recipients[0].email_attempted_at);
    assert.equal(recipients[0].checked_in_at, null);
    assert.ok(!JSON.stringify(recipients).includes(first.ticket_token));
    assert.deepEqual(await rpc(db, "public.admin_list_complimentary_recipients($1)", [owner]), []);

    assert.equal(await rpc(db, "public.claim_complimentary_ticket_email($1)", [first.order_id]), null);
    const display = await rpc<{ amount_cents: number }>(db, "public.get_ticket_by_token($1)", [first.ticket_token]);
    assert.equal(display.amount_cents, 0);
    assert.ok(!JSON.stringify(display).includes("gift@example.com"));
    assert.equal((await rpc<{ status: string }>(db, "public.validate_door_ticket('capacity-test',$1)", [first.ticket_token])).status, "valid");
    assert.equal((await rpc<{ status: string }>(db, "public.check_in_door_ticket('capacity-test',$1)", [first.ticket_token])).status, "checked_in");
    const checkedRecipients = await rpc<{ checked_in_at: string | null }[]>(db, "public.admin_list_complimentary_recipients($1)", [event]);
    assert.ok(checkedRecipients[0].checked_in_at);
    assert.equal(
      new Date(checkedRecipients[0].checked_in_at!).getTime(),
      new Date((await db.query<{ checked_in_at: string }>("select checked_in_at from public.tickets")).rows[0].checked_in_at).getTime(),
    );
    const detail = await rpc<{ metrics: { tickets_sold: number; complimentary_tickets: number; gross_revenue_cents: number; checked_in: number; tickets_issued: number } }>(
      db,
      "public.admin_event_detail($1)",
      [event],
    );
    assert.equal(detail.metrics.tickets_sold, 0);
    assert.equal(detail.metrics.complimentary_tickets, 1);
    assert.equal(detail.metrics.gross_revenue_cents, 0);
    assert.equal(detail.metrics.checked_in, 1);
    assert.equal(detail.metrics.tickets_issued, 1);
  } finally {
    await db.close();
  }
});
test("paid holds and free tickets share capacity; sold-out discovery remains visible and owners can finish their last place", async () => {
  const { db, event } = await setup();
  try {
    await gift(db, event);
    const order = await init(db);
    assert.equal(order.status, "pending");
    assert.ok(order.reservation_expires_at);
    const remaining = Date.parse(order.reservation_expires_at) - Date.now();
    assert.ok(remaining > 290000 && remaining <= 300000, `Expected a five-minute hold, got ${remaining}ms`);
    assert.equal((await init(db, "+12025550113")).status, "capacity_full");
    assert.equal((await gift(db, event, "+12025550114")).status, "capacity_full");
    assert.equal((await db.query("select * from public.contacts")).rows.length, 2, "no unused contacts created for rejected sold-out requests");
    assert.equal((await init(db)).order_id, order.order_id);
    assert.equal(await rpc(db, "public.check_ticket_reservation('capacity-test',$1)", [hash]), "open");
    const events = await rpc<{ slug: string; sold_out: boolean; open: boolean }[]>(db, "public.get_available_rsvp_events()");
    assert.equal(events.find((e) => e.slug === "capacity-test")?.sold_out, true);
    assert.equal(events.find((e) => e.slug === "capacity-test")?.open, false);
    await assert.rejects(db.query("update public.events set ticket_capacity=1 where id=$1", [event]), (e: { code?: string }) => e.code === "P2003");
    const copy = await rpc<string>(db, "public.admin_duplicate_event($1)", [event]);
    assert.equal((await db.query<{ ticket_capacity: number }>("select ticket_capacity from public.events where id=$1", [copy])).rows[0].ticket_capacity, 2);
    assert.equal(await rpc(db, "public.event_ticket_allocated($1)", [copy]), 0);
    assert.equal((await gift(db, event, "+12025550112")).status, "purchase_in_progress");
  } finally {
    await db.close();
  }
});
test("expired checkout remains allocated until canceled; stale releases/webhooks cannot oversell or resurrect old attempts", async () => {
  const { db, event } = await setup(1);
  try {
    const order = await init(db);
    await rpc(db, "public.attach_ticket_payment_intent($1,$2,'pi_expired',0)", [order.order_id, hash]);
    await db.query("update public.orders set reservation_expires_at=clock_timestamp()-interval '1 minute' where id=$1", [order.order_id]);
    assert.equal((await init(db, "+12025550113")).status, "capacity_full");
    assert.equal(await rpc(db, "public.check_ticket_reservation('capacity-test',$1)", [hash]), "expired");
    assert.equal(await rpc(db, "public.release_ticket_reservation($1,99,'pi_expired')", [order.order_id]), false);
    assert.equal(await rpc(db, "public.release_ticket_reservation($1,0,'pi_wrong')", [order.order_id]), false);
    assert.equal(await rpc(db, "public.release_ticket_reservation($1,0,'pi_expired')", [order.order_id]), true);
    assert.equal(await rpc(db, "public.release_ticket_reservation($1,0,'pi_expired')", [order.order_id]), false);
    assert.equal(await rpc(db, "public.attach_ticket_payment_intent($1,$2,'pi_expired',0)", [order.order_id, hash]), false);
    const newer = await init(db);
    assert.equal(newer.order_id, order.order_id);
    assert.equal(newer.payment_attempt, 1);
    await assert.rejects(
      rpc(db, "public.process_ticket_payment('evt_late','payment_intent.succeeded',$1,$2,$3,'pi_expired',1000,'usd','succeeded',$4,'EST-123456ABCDEF')", [
        order.order_id,
        order.event_id,
        order.ticket_type_id,
        "a".repeat(64),
      ]),
    );
    assert.equal((await db.query("select * from public.tickets")).rows.length, 0);
    const other = await init(db, "+12025550113");
    assert.equal(other.status, "capacity_full");
    assert.equal(await rpc(db, "public.event_ticket_allocated($1)", [event]), 1);
  } finally {
    await db.close();
  }
});
test("released unpaid order can become complimentary without creating a second order or accepting a Stripe fulfillment", async () => {
  const { db, event } = await setup(1);
  try {
    const order = await init(db);
    await rpc(db, "public.attach_ticket_payment_intent($1,$2,'pi_canceled',0)", [order.order_id, hash]);
    await db.query("update public.orders set reservation_expires_at=clock_timestamp()-interval '1 minute' where id=$1", [order.order_id]);
    await rpc(db, "public.release_ticket_reservation($1,0,'pi_canceled')", [order.order_id]);
    const free = await gift(db, event, "+12025550112");
    assert.equal(free.status, "issued");
    assert.equal(free.order_id, order.order_id);
    assert.equal((await db.query("select * from public.orders")).rows.length, 1);
    assert.equal((await db.query("select * from public.tickets")).rows.length, 1);
    await assert.rejects(
      rpc(db, "public.process_ticket_payment('evt_forged','payment_intent.succeeded',$1,$2,$3,'pi_canceled',0,'usd','succeeded',$4,'EST-123456ABCDEF')", [
        order.order_id,
        order.event_id,
        order.ticket_type_id,
        "b".repeat(64),
      ]),
    );
    assert.equal(await rpc(db, "public.event_ticket_allocated($1)", [event]), 1);
    for (const role of ["anon", "authenticated"])
      for (const fn of [
        "admin_issue_complimentary_ticket(uuid,text,text,text,uuid,text,text,text)",
        "claim_complimentary_ticket_email(uuid)",
        "get_expired_ticket_reservations(text)",
        "release_ticket_reservation(uuid,integer,text)",
        "check_ticket_reservation(text,text)",
      ])
        assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, `public.${fn}`])).rows[0].allowed, false);
  } finally {
    await db.close();
  }
});

test("scheduled is distinct from immediate publication and becomes publicly visible at release even before sales begin", async () => {
  const { db, event } = await setup(null);
  try {
    const { adminEventSchema, parseAdminEvent, adminPublicationStatus } = await import("../src/lib/admin/events");
    const config = {
      description: "",
      slug: "capacity-test",
      name: "Schedule test",
      event_date: "2033-01-20",
      venue_name: "Venue",
      venue_address: "Address",
      starts_at_local: "2033-01-20T20:00",
      ends_at_local: "2033-01-20T23:30",
      publish_at_local: "2033-01-10T10:00",
      timezone: "America/New_York",
      status: "published",
      admission_mode: "ticketed",
      rsvp_open: false,
      ticket_sales_open: true,
      gift_card_disclaimer_version: "",
      ticket_name: "General Admission",
      ticket_description: "",
      price_cents: 1000,
      ticket_active: true,
      ticket_capacity: null,
      sales_start_local: "2033-01-12T10:00",
      sales_end_local: "",
    };
    assert.ok(adminEventSchema.safeParse({ ...config, status: "scheduled" }).success);
    const form = new FormData();
    for (const [key, value] of Object.entries(config)) if (typeof value === "string") form.set(key, value);
    form.set("status", "scheduled");
    form.set("price", "10");
    form.set("ticket_active", "on");
    form.set("ticket_sales_open", "on");
    const parsed = parseAdminEvent(form);
    assert.ok(parsed.success);
    assert.equal(parsed.data.status, "published");
    assert.equal(parsed.data.publication_mode, "scheduled");
    await rpc(db, "public.admin_save_event($1,$2::jsonb)", [event, JSON.stringify(parsed.data)]);
    assert.equal(adminPublicationStatus({ status: "published", publish_at: "2033-01-10T15:00:00Z" }, "2033-01-09T15:00:00Z"), "scheduled");
    assert.equal(adminPublicationStatus({ status: "published", publish_at: "2033-01-10T15:00:00Z" }, "2033-01-10T15:00:00Z"), "published");
    assert.equal(
      (await rpc<{ slug: string }[]>(db, "public.get_available_rsvp_events()")).some((e) => e.slug === "capacity-test"),
      false,
    );
    await assert.rejects(rpc(db, "public.admin_save_event($1,$2::jsonb)", [event, JSON.stringify({ ...config, publication_mode: "published" })]), (e: { code?: string }) => e.code === "P2002");
    await db.exec(`create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql volatile as $$select '2033-01-10T15:00:00Z'::timestamptz$$`);
    const migration = readFileSync(new URL("../supabase/migrations/20261104195243_complimentary_tickets_and_event_capacity.sql", import.meta.url), "utf8");
    await db.exec("create or replace function public.get_available_rsvp_events()" + migration.split("create or replace function public.get_available_rsvp_events()")[1].split("$$;")[0] + "$$;");
    const visible = (await rpc<{ slug: string; open: boolean; sales_not_started: boolean }[]>(db, "public.get_available_rsvp_events()")).find((e) => e.slug === "capacity-test");
    assert.ok(visible);
    assert.equal(visible.open, false);
    assert.equal(visible.sales_not_started, true);
  } finally {
    await db.close();
  }
});

test("explicit checkout cancellation requires its capability and attempt, releases once and permits a fresh purchase on the same order", async () => {
  const { db, event } = await setup(1);
  try {
    const order = await init(db);
    await rpc(db, "public.attach_ticket_payment_intent($1,$2,'pi_cancel',0)", [order.order_id, hash]);
    assert.equal(await rpc(db, "public.get_ticket_checkout_for_cancellation('capacity-test',$1)", ["b".repeat(64)]), null);
    assert.equal(await rpc(db, "public.cancel_ticket_checkout('capacity-test',$1,0,'pi_cancel')", ["b".repeat(64)]), false);
    assert.equal(await rpc(db, "public.cancel_ticket_checkout('capacity-test',$1,99,'pi_cancel')", [hash]), false);
    assert.deepEqual(
      await Promise.all([rpc(db, "public.cancel_ticket_checkout('capacity-test',$1,0,'pi_cancel')", [hash]), rpc(db, "public.cancel_ticket_checkout('capacity-test',$1,0,'pi_cancel')", [hash])]),
      [true, true],
    );
    assert.equal(await rpc(db, "public.event_ticket_allocated($1)", [event]), 0);
    const next = await init(db);
    assert.equal(next.order_id, order.order_id);
    assert.equal(next.payment_attempt, 1);
    assert.equal(await rpc(db, "public.cancel_ticket_checkout('capacity-test',$1,0,'pi_cancel')", [hash]), false);
    assert.equal((await db.query("select * from public.orders")).rows.length, 1);
  } finally {
    await db.close();
  }
});
