// Isolated disposable database inside LOCAL Supabase's Docker container only.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const docker = process.env.LOCAL_DOCKER_BIN || "/Applications/Docker.app/Contents/Resources/bin/docker";
const container = "supabase_db_el-solar-timbero";
const database = `el_solar_test_admin_${randomBytes(6).toString("hex")}`;
async function sql(query, db = database) {
  const { stdout } = await exec(docker, ["exec", container, "psql", "-X", "-U", "postgres", "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", query]);
  return stdout.trim().split("\n").at(-1);
}
async function input(text) {
  await new Promise((resolve, reject) => {
    const child = spawn(docker, ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("exit", (code) => (code ? reject(new Error(err)) : resolve()));
    child.stdin.end(text);
  });
}
try {
  await sql(`create database ${database}`, "postgres");
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const migrations = readdirSync(directory)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const adminIndex = migrations.indexOf("20261102221255_admin_v1_scheduling_and_door_pins.sql");
  assert.ok(adminIndex >= 0);
  await input(
    migrations
      .slice(0, adminIndex)
      .map((n) => readFileSync(new URL(n, directory), "utf8"))
      .join("\n"),
  );
  await sql(`insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode,ticket_sales_open)
 values('admin-preservation','Local preservation',current_date+730,(current_date+730+time '20:00') at time zone 'America/New_York',(current_date+730+time '23:30') at time zone 'America/New_York','America/New_York','Test','Local','published','ticketed',true);
 insert into public.ticket_types(event_id,name,price_cents) select id,'General Admission',1000 from public.events where slug='admin-preservation';`);
  const order = JSON.parse(await sql(`select public.initialize_ticket_order('admin-preservation','Local Buyer','local@example.com','+12025550199','Instagram',repeat('f',64))`));
  await sql(`select public.attach_ticket_payment_intent('${order.order_id}',repeat('f',64),'pi_adminpreservation');
 select public.process_ticket_payment('evt_adminpreservation','payment_intent.succeeded','${order.order_id}','${order.event_id}','${order.ticket_type_id}','pi_adminpreservation',1000,'usd','succeeded',repeat('a',64),'EST-ABCDEF000001');`);
  const snapshot = () =>
    sql(
      `select jsonb_build_object('orders',(select jsonb_agg(to_jsonb(o)-array['order_kind','complimentary_issued_by','reservation_expires_at','reservation_released_at']) from public.orders o),'tickets',(select jsonb_agg(to_jsonb(t)) from public.tickets t),'contacts',(select jsonb_agg(to_jsonb(c)) from public.contacts c),'rsvps',(select jsonb_agg(to_jsonb(r)) from public.rsvps r))::text`,
    );
  const before = await snapshot();
  await input(
    migrations
      .slice(adminIndex)
      .map((name) => readFileSync(new URL(name, directory), "utf8"))
      .join("\n"),
  );
  assert.equal(await snapshot(), before);
  const metrics = JSON.parse(await sql(`select public.admin_event_detail('${order.event_id}')`));
  assert.equal(metrics.metrics.tickets_sold, 1);
  assert.equal(metrics.metrics.gross_revenue_cents, 1000);
  assert.equal(metrics.metrics.not_checked_in, 1);
  const copy = await sql(`select public.admin_duplicate_event('${order.event_id}')`);
  assert.equal(await sql(`select count(*) from public.tickets where event_id='${copy}'`), "0");
  assert.equal(await sql(`select count(*) from public.orders where event_id='${copy}'`), "0");
  console.log("PASS migration preserves paid orders, tickets, tokens, contacts and RSVPs; paid metrics and config-only duplication");
  // Historical fixture no longer occupies the public window while exercising current sales.
  await sql(`update public.events set status='completed' where id='${order.event_id}'`);
  console.log("PASS all migrations on isolated LOCAL PostgreSQL");
  const { stdout } = await exec(process.execPath, ["tests/local-ticket.integration.mjs"], { env: { ...process.env, LOCAL_TICKET_TEST_DATABASE: database }, maxBuffer: 1024 * 1024 });
  process.stdout.write(stdout);
  const create = (slug) =>
    sql(
      `insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode,publish_at) values('${slug}','LOCAL ONLY Admin',current_date+365,(current_date+365+time '20:00') at time zone 'America/New_York',(current_date+365+time '23:30') at time zone 'America/New_York','America/New_York','Test','Local','published','ticketed',now())`,
    );
  const attempts = await Promise.allSettled([create("admin-concurrent-a"), create("admin-concurrent-b")]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(attempts.find((r) => r.status === "rejected").reason.stderr.includes("events_one_public_ticketed_window"));
  console.log("PASS simultaneous overlapping publications: exactly one succeeds");
  const emptyMetrics = JSON.parse(await sql("select public.admin_event_detail(id) from public.events where slug like 'admin-concurrent-%'"));
  assert.equal(emptyMetrics.metrics.tickets_sold, 0);
  console.log("PASS admin metrics execute on real PostgreSQL");
} finally {
  await sql(`drop database if exists ${database} with (force)`, "postgres");
}
