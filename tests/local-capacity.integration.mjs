// LOCAL Supabase only; migrations and fixtures run in a disposable test database.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
const exec = promisify(execFile),
  docker = process.env.LOCAL_DOCKER_BIN || "/Applications/Docker.app/Contents/Resources/bin/docker",
  container = "supabase_db_el-solar-timbero",
  database = `el_solar_test_capacity_${randomBytes(6).toString("hex")}`;
const lit = (v) => `'${String(v).replaceAll("'", "''")}'`;
async function sql(query, db = database) {
  const { stdout } = await exec(docker, ["exec", container, "psql", "-X", "-U", "postgres", "-d", db, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query]);
  return stdout.trim().split("\n").at(-1);
}
async function migrate(text) {
  await new Promise((resolve, reject) => {
    const child = spawn(docker, ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (c) => (errors += c));
    child.on("error", reject);
    child.on("exit", (code) => (code ? reject(new Error(errors)) : resolve()));
    child.stdin.end(text);
  });
}
const owner = "11111111-1111-4111-8111-111111111111";
let event;
async function paid(phone) {
  const hash = createHash("sha256").update(phone).digest("hex");
  const value = JSON.parse(await sql(`set role service_role;select public.initialize_ticket_order('capacity-race','Local Buyer','buyer@example.com',${lit(phone)},'Instagram',${lit(hash)})`));
  return { ...value, access_hash: hash };
}
async function gift(phone) {
  return JSON.parse(
    await sql(
      `set role service_role;select public.admin_issue_complimentary_ticket(${lit(event)},'Local Gift','gift@example.com',${lit(phone)},${lit(owner)},${lit(randomBytes(32).toString("hex"))},${lit(randomBytes(32).toString("hex"))},${lit("EST-" + randomBytes(6).toString("hex").toUpperCase())})`,
    ),
  );
}
try {
  await sql(`create database ${database}`, "postgres");
  const directory = new URL("../supabase/migrations/", import.meta.url);
  await migrate(
    readdirSync(directory)
      .filter((n) => n.endsWith(".sql"))
      .sort()
      .map((n) => readFileSync(new URL(n, directory), "utf8"))
      .join("\n"),
  );
  event = await sql(`insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode,ticket_sales_open,publish_at,ticket_capacity)
 values('capacity-race','LOCAL ONLY Capacity',current_date+365,(current_date+365+time '20:00') at time zone 'America/New_York',(current_date+365+time '23:30') at time zone 'America/New_York','America/New_York','Test','Local','published','ticketed',true,now(),5) returning id`);
  await sql(`insert into public.ticket_types(event_id,name,price_cents) values(${lit(event)},'General Admission',1000)`);
  const first = await paid("+12025550101"),
    second = await paid("+12025550102"),
    free = await gift("+12025550103");
  const attempts = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? paid("+120255501" + String(10 + i)) : gift("+120255501" + String(10 + i)))));
  assert.equal(attempts.filter((x) => ["pending", "issued"].includes(x.status)).length, 2);
  assert.equal(await sql(`select public.event_ticket_allocated(${lit(event)})`), "5");
  assert.equal(await sql("select count(*) from public.contacts"), "5");
  console.log("PASS 10 simultaneous paid/free allocations share the last 2 places; no overselling or unused contacts");
  const repeated = await Promise.all(Array.from({ length: 6 }, () => gift("+12025550103")));
  assert.ok(repeated.every((x) => x.status === "already_issued" && x.ticket_token === free.ticket_token));
  console.log("PASS repeated concurrent complimentary issuance preserves exactly one ticket/token");
  await sql(`select public.attach_ticket_payment_intent(${lit(first.order_id)},${lit(first.access_hash)},'pi_capacityPaidOne',0)`);
  const fulfill = () =>
    sql(
      `set role service_role;select public.process_ticket_payment('evt_capacityRace','payment_intent.succeeded',${lit(first.order_id)},${lit(first.event_id)},${lit(first.ticket_type_id)},'pi_capacityPaidOne',1000,'usd','succeeded',${lit(randomBytes(32).toString("hex"))},${lit("EST-" + randomBytes(6).toString("hex").toUpperCase())})`,
    );
  await Promise.all([fulfill(), fulfill()]);
  assert.equal(await sql(`select count(*) from public.tickets where order_id=${lit(first.order_id)}`), "1");
  console.log("PASS duplicate success webhooks fulfill a reserved place once at capacity");
  await sql(
    `select public.attach_ticket_payment_intent(${lit(second.order_id)},${lit(second.access_hash)},'pi_capacityExpired',0);update public.orders set reservation_expires_at=clock_timestamp()-interval '1 minute' where id=${lit(second.order_id)}`,
  );
  assert.equal((await gift("+12025550130")).status, "capacity_full");
  const releases = await Promise.all(Array.from({ length: 5 }, () => sql(`select public.release_ticket_reservation(${lit(second.order_id)},0,'pi_capacityExpired')`)));
  assert.equal(releases.filter((r) => r === "t").length, 1);
  const refill = await Promise.all(Array.from({ length: 8 }, (_, i) => gift("+120255501" + String(30 + i))));
  assert.equal(refill.filter((r) => r.status === "issued").length, 1);
  assert.equal(await sql(`select public.event_ticket_allocated(${lit(event)})`), "5");
  console.log("PASS expiry alone frees no inventory; guarded cancellation release frees one place and 8 concurrent grants cannot oversell it");
  const emails = await Promise.all(Array.from({ length: 6 }, () => sql(`select public.claim_complimentary_ticket_email(${lit(free.order_id)}) is not null`)));
  assert.equal(emails.filter((r) => r === "t").length, 1);
  const checkIns = await Promise.all([
    sql(`select public.check_in_door_ticket('capacity-race',${lit(free.ticket_token)})`),
    sql(`select public.check_in_door_ticket('capacity-race',${lit(free.ticket_token)})`),
  ]);
  assert.deepEqual(checkIns.map((r) => JSON.parse(r).status).sort(), ["already_checked_in", "checked_in"]);
  console.log("PASS complimentary email claims and check-in are once-only under concurrency");
  const metrics = JSON.parse(await sql(`select public.admin_event_detail(${lit(event)})`));
  assert.equal(metrics.metrics.tickets_sold, 1);
  assert.equal(metrics.metrics.gross_revenue_cents, 1000);
  assert.ok(metrics.metrics.complimentary_tickets >= 2);
  assert.equal(metrics.metrics.remaining_capacity, 0);
  console.log("PASS paid revenue excludes complimentary tickets; attendance includes both");
} finally {
  await sql(`drop database if exists ${database} with(force)`, "postgres");
}
