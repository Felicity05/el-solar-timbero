// Local Supabase/PostgreSQL only. No URLs/keys/db push. Cleans its own fixtures.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
const exec = promisify(execFile);
const docker = process.env.LOCAL_DOCKER_BIN || "/Applications/Docker.app/Contents/Resources/bin/docker";
const container = "supabase_db_el-solar-timbero";
const prefix = "local-ticket-integration-";
const phone = "+12025550181",
  other = "+12025550182",
  hash = "d".repeat(64);
const lit = (v) => {
  if (v === null) {
    return "null";
  }
  if (typeof v === "number") {
    return String(v);
  }
  return `'${String(v).replaceAll("'", "''")}'`;
};
async function sql(query) {
  const { stdout } = await exec(docker, ["exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", query]);
  return stdout.trim().split("\n").at(-1);
}
async function init(number = phone, access = hash) {
  return JSON.parse(await sql(`set role service_role; select public.initialize_ticket_order('${prefix}event','Local Buyer','local@example.com',${lit(number)},'Instagram',${lit(access)})`));
}
const historySql = "select count(*)::text||':'||coalesce(md5(jsonb_agg(to_jsonb(r) order by id)::text),'empty') from public.rsvps r where event_slug='cuban-night-social-2026-10-12'";
const before = await sql(historySql);
assert.equal(await sql(`select count(*) from public.contacts where phone in (${lit(phone)},${lit(other)})`), "0", "Choose unused local fixture numbers");
let order;
async function fulfill(id, amount = 1000, type = "payment_intent.succeeded") {
  return sql(
    `set role service_role; select public.process_ticket_payment(${lit(id)},${lit(type)},${lit(order.order_id)},${lit(order.event_id)},${lit(order.ticket_type_id)},'pi_concurrentlocal',${amount},'usd',${lit(type.endsWith("succeeded") ? "succeeded" : "requires_payment_method")},${lit(randomBytes(32).toString("hex"))},${lit(`EST-${randomBytes(6).toString("hex").toUpperCase()}`)})`,
  );
}
try {
  await sql(`insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode,ticket_sales_open)
 values('${prefix}event','LOCAL ONLY Ticket concurrency',current_date+365,(current_date+365)::timestamp at time zone 'UTC',(current_date+366)::timestamp at time zone 'UTC','UTC','Test','LOCAL ONLY','published','ticketed',true);
 insert into public.ticket_types(event_id,name,price_cents) select id,'General Admission',1000 from public.events where slug='${prefix}event'`);
  const results = await Promise.all(Array.from({ length: 8 }, () => init()));
  assert.equal(new Set(results.map((o) => o.order_id)).size, 1);
  order = results[0];
  assert.equal(order.amount_cents, 1000);
  assert.equal(await sql(`select tt.sales_end_at=((e.event_date+time '17:00') at time zone 'America/New_York') from public.ticket_types tt join public.events e on e.id=tt.event_id where e.id=${lit(order.event_id)}`), "t");
  console.log("PASS local PostgreSQL enforces the 5 PM Eastern ticket sales deadline");
  assert.equal(await sql(`select count(*) from public.contacts where phone=${lit(phone)}`), "1");
  assert.equal(await sql(`select count(*) from public.orders where event_id=${lit(order.event_id)}`), "1");
  console.log("PASS 8 concurrent initializations: one contact, one pending order, authoritative $10 USD");
  assert.equal((await init()).order_id, order.order_id);
  console.log("PASS pending order is reused");
  const otherBrowser = await init(phone, "e".repeat(64));
  assert.equal(otherBrowser.status, order.payment_attempt === undefined ? "pending_elsewhere" : "recovery_required");
  assert.equal(otherBrowser.client_secret, undefined);
  console.log("PASS phone match does not reveal another browser payment client secret, before or after recovery migration");
  await sql(`set role service_role; select public.attach_ticket_payment_intent(${lit(order.order_id)},${lit(hash)},'pi_concurrentlocal')`);
  await assert.rejects(fulfill(`${prefix}wrong`, 999));
  assert.equal(await sql(`select count(*) from public.stripe_events where stripe_event_id='${prefix}wrong'`), "0");
  console.log("PASS amount mismatch rolls back event marker and fulfillment");
  await fulfill(`${prefix}failed`, 1000, "payment_intent.payment_failed");
  assert.equal(await sql(`select count(*) from public.tickets where order_id=${lit(order.order_id)}`), "0");
  console.log("PASS failed payment never creates a ticket");
  await Promise.all(Array.from({ length: 8 }, () => fulfill(`${prefix}success`)));
  await Promise.all(Array.from({ length: 4 }, (_, i) => fulfill(`${prefix}other-success-${i}`)));
  assert.equal(await sql(`select count(*) from public.tickets where order_id=${lit(order.order_id)}`), "1");
  console.log("PASS simultaneous repeated AND distinct success events produce exactly one ticket");
  assert.equal((await init()).status, "already_purchased");
  console.log("PASS paid order never opens another payment");
  const emailClaims = await Promise.all(Array.from({ length: 8 }, () => sql(`select public.claim_ticket_email(${lit(order.order_id)},'pi_concurrentlocal')::text`)));
  const claimedEmails = emailClaims.filter((value) => value && value !== "null");
  assert.equal(claimedEmails.length, 1, "one durable email claim under concurrency");
  const email = JSON.parse(claimedEmails[0]);
  assert.equal(email.amount_cents, 1000);
  assert.match(email.ticket_token, /^[a-f0-9]{64}$/);
  assert.equal(await sql(`select email_sent_at is null from public.tickets where order_id=${lit(order.order_id)}`), "t");
  assert.equal(await sql(`select public.mark_ticket_email_sent(${lit(order.order_id)})`), "t");
  assert.equal(await sql(`select public.claim_ticket_email(${lit(order.order_id)},'pi_concurrentlocal') is null`), "t");
  console.log("PASS concurrent/duplicate email claims permit one send; email failure preserves the paid ticket");

  assert.equal(JSON.parse(await sql(`set role service_role; select coalesce(public.get_ticket_purchase('${prefix}event','${"e".repeat(64)}')::text,'null')`)), null);
  console.log("PASS confirmation requires private purchase credential");
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(sql(`set role ${role};select public.initialize_ticket_order('${prefix}event','Test Name','test@example.com',${lit(other)},'Instagram',${lit(hash)})`));
  }
  for (const role of ["anon", "authenticated", "service_role"])
    assert.equal(
      await sql(
        `select count(*) from (values('public.orders'),('public.tickets'),('public.ticket_types'),('public.stripe_events')) t(n) where has_table_privilege('${role}',n,'SELECT,INSERT,UPDATE,DELETE')`,
      ),
      "0",
    );
  console.log("PASS RLS/grants: no browser RPC execution or direct table CRUD");
  await sql(`update public.events set ticket_sales_open=false where id=${lit(order.event_id)}`);
  assert.equal((await init(other)).status, "closed");
  console.log("PASS closed sales rejected by RPC");
  const sold = JSON.parse(await sql(`select row_to_json(t) from public.tickets t where order_id=${lit(order.order_id)}`));
  const door = async (method, value = sold.ticket_token, slug = `${prefix}event`) => JSON.parse(await sql(`set role service_role; select public.${method}(${lit(slug)},${lit(value)})`));
  assert.equal((await door("validate_door_ticket")).status, "valid");
  assert.equal(await sql(`select checked_in_at is null from public.tickets where order_id=${lit(order.order_id)}`), "t");
  assert.equal((await door("check_in_door_ticket", sold.ticket_token, "wrong-event")).status, "invalid");
  const admissions = await Promise.all([door("check_in_door_ticket"), door("check_in_door_ticket", sold.ticket_code)]);
  assert.deepEqual(admissions.map((r) => r.status).sort(), ["already_checked_in", "checked_in"]);
  assert.equal(admissions[0].checked_in_at, admissions[1].checked_in_at);
  assert.equal((await door("validate_door_ticket")).status, "already_checked_in");
  const admitted = JSON.parse(await sql(`select row_to_json(t) from public.tickets t where order_id=${lit(order.order_id)}`));
  assert.deepEqual({ ...admitted, checked_in_at: null }, sold);
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(sql(`set role ${role}; select public.check_in_door_ticket(${lit(`${prefix}event`)},${lit(sold.ticket_token)})`));
  }
  console.log("PASS staff validation never admits; two independent simultaneous PostgreSQL sessions admit exactly once; ticket credentials unchanged; browser roles denied");
  assert.equal(await sql(historySql), before);
  console.log("PASS historical October RSVPs unchanged");
} finally {
  await sql(`delete from public.stripe_events where stripe_event_id like '${prefix}%';
 delete from public.tickets where event_id in(select id from public.events where slug like '${prefix}%');
 delete from public.orders where event_id in(select id from public.events where slug like '${prefix}%');
 delete from public.ticket_types where event_id in(select id from public.events where slug like '${prefix}%');
 delete from public.events where slug like '${prefix}%';
 delete from public.contacts where phone in(${lit(phone)},${lit(other)})`);
}
