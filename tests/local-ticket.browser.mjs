// REAL Stripe TEST API + official iframe/browser confirmation + LOCAL Supabase.
// Card-entry/3DS interactions still require a manual browser test. Never use live keys.
// Build with the matching real test publishable key first; keep the CLI listener
// forwarding to localhost:3118/api/stripe/webhook. Fixture rows are cleaned.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { dirname } from "node:path";
import { createHmac } from "node:crypto";
import { chromium } from "@playwright/test";
import Stripe from "stripe";
const exec = promisify(execFile);
const docker = process.env.LOCAL_DOCKER_BIN || "/Applications/Docker.app/Contents/Resources/bin/docker";
const container = "supabase_db_el-solar-timbero";
const slug = "local-browser-ticket-test";
const phone = "+12025550171",
  declinedPhone = "+12025550172";
assert.match(process.env.STRIPE_SECRET_KEY ?? "", /^(sk|rk)_test_/, "A Stripe TEST key is required");
assert.match(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "", /^pk_test_/);
assert.match(process.env.STRIPE_WEBHOOK_SECRET ?? "", /^whsec_/, "Start the local listener first");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
async function sql(query) {
  return (await exec(docker, ["exec", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", query])).stdout.trim();
}
let local;
try {
  local = JSON.parse(
    (
      await exec("./node_modules/.bin/supabase", ["status", "--output", "json"], {
        env: { ...process.env, PATH: `${dirname(docker)}:${process.env.PATH}` },
      })
    ).stdout,
  );
} catch {
  throw new Error("Could not read LOCAL Supabase credentials");
}
assert.ok(local.SECRET_KEY?.startsWith("sb_secret_"));
const fixtureKeys = [
  ["ip", "127.0.0.81"],
  ["phone", phone],
  ["phone", declinedPhone],
].map(([scope, value]) => createHmac("sha256", local.SECRET_KEY).update(`rsvp-rate-limit:v1:${scope}:${value}`).digest("hex"));
const resetFixtureLimits = () => sql(`delete from rsvp_private.rsvp_rate_limits where key_hash in(${fixtureKeys.map((k) => `'${k}'`).join(",")})`);
await resetFixtureLimits();
const url = "http://localhost:3118";
assert.equal(await sql(`select count(*) from public.contacts where phone in('${phone}','${declinedPhone}')`), "0", "Fixture phones must be unused");
await sql(`insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode,ticket_sales_open)
 values('${slug}','LOCAL DEV — Real Stripe Ticket Test',current_date+365,(current_date+365)::timestamp at time zone 'UTC',(current_date+366)::timestamp at time zone 'UTC','UTC','Test Venue','LOCAL ONLY','published','ticketed',true);
 insert into public.ticket_types(event_id,name,price_cents) select id,'General Admission',1000 from public.events where slug='${slug}';`);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3118"], {
  env: {
    ...process.env,
    SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: local.SECRET_KEY,
    SITE_URL: url,
    STRIPE_LIVE_MODE: "false",
    RSVP_TRUSTED_IP_HEADER: "x-local-ticket-test-ip",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
let context;
let page;
let cardLeak = false;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local test server timed out")), 20000);
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Local test server exited"));
    });
  });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.setExtraHTTPHeaders({ "x-local-ticket-test-ip": "127.0.0.81" });
  page.on("request", (request) => {
    if (request.url().startsWith(url) && /4242[\s-]*4242[\s-]*4242[\s-]*4242/.test(request.postData() ?? "")) cardLeak = true;
  });
  async function attendee(number) {
    await page.goto(`${url}/?event=${slug}`);
    await page.getByRole("button", { name: "Get Ticket", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Local Stripe Buyer");
    await page.getByLabel("Phone number", { exact: true }).fill(number);
    await page.getByLabel("Email", { exact: true }).fill("local-ticket@example.com");
    await page.getByLabel("How did you hear about us?").selectOption("Instagram");
  }
  async function pending(number, minAttempt = 0) {
    for (let i = 0; i < 80; i++) {
      const raw = await sql(
        `select coalesce((select row_to_json(o)::text from public.orders o join public.contacts c on c.id=o.contact_id join public.events e on e.id=o.event_id where c.phone='${number}' and e.slug='${slug}' and o.stripe_payment_intent_id is not null),'null')`,
      );
      const order = JSON.parse(raw);
      if (order && order.payment_attempt >= minAttempt) return order;
      await page.waitForTimeout(300);
    }
    throw new Error("Application did not initialize/link a pending PaymentIntent");
  }
  await attendee(phone);
  const initialized = await pending(phone);
  const initialIntent = await stripe.paymentIntents.retrieve(initialized.stripe_payment_intent_id);
  assert.deepEqual(initialIntent.payment_method_types, ["card"]);
  assert.equal(initialIntent.amount, 1000);
  assert.equal(initialIntent.currency, "usd");
  console.log("PASS real PaymentIntent: card only, 1000 cents USD");
  try {
    const publicIntent = await new Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).paymentIntents.retrieve(initialized.stripe_payment_intent_id, {
      client_secret: initialIntent.client_secret,
    });
    assert.equal(publicIntent.id, initialIntent.id);
  } catch {
    throw new Error("Publishable key cannot access this test PaymentIntent; verify both keys belong to the same Stripe environment");
  }
  console.log("PASS test publishable/server keys match the same PaymentIntent");
  const repeated = await Promise.all(
    Array.from({ length: 2 }, () =>
      stripe.paymentIntents.create(
        {
          amount: initialized.amount_cents,
          currency: initialized.currency,
          payment_method_types: ["card"],
          metadata: {
            order_id: initialized.id,
            event_id: initialized.event_id,
            ticket_type_id: initialized.ticket_type_id,
          },
        },
        {
          idempotencyKey: `ticket-order:${initialized.id}:v1`,
          apiVersion: "2026-08-26.dahlia",
        },
      ),
    ),
  );
  assert.ok(repeated.every((pi) => pi.id === initialIntent.id));
  console.log("PASS concurrent real Stripe creation retries reuse the same PaymentIntent");
  await page.locator("#ticket-purchase iframe").first().waitFor();
  await page.getByRole("button", { name: "Buy Now", exact: true }).waitFor();
  console.log("PASS real application initializes one database-priced $10 PaymentIntent and mounts official Stripe iframe");
  // Lose all browser credentials, then recover the same unpaid order safely.
  await context.close();
  context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.setExtraHTTPHeaders({ "x-local-ticket-test-ip": "127.0.0.81" });
  await attendee(phone);
  const recovered = await pending(phone, 1);
  assert.equal(recovered.id, initialized.id);
  assert.notEqual(recovered.stripe_payment_intent_id, initialIntent.id);
  assert.equal((await stripe.paymentIntents.retrieve(initialIntent.id)).status, "canceled");
  await page.getByRole("button", { name: "Buy Now", exact: true }).waitFor();
  console.log("PASS lost-browser recovery cancels unpaid intent, reuses one order and binds one replacement attempt");
  // Stripe explicitly discourages automated interaction with Payment Element.
  // Exercise the real payment/webhook via its official TEST PaymentMethod instead.
  await stripe.paymentIntents.confirm(recovered.stripe_payment_intent_id, {
    payment_method: "pm_card_visa",
    return_url: `${url}/ticket/return?event=${slug}`,
  });
  await page.goto(`${url}/ticket/return?event=${slug}`);
  await page.getByRole("heading", { name: "You're in!", exact: true }).waitFor({ timeout: 60000 });
  assert.equal(await sql(`select count(*) from public.tickets t join public.events e on e.id=t.event_id where e.slug='${slug}'`), "1");
  const saved = JSON.parse(await sql(`select row_to_json(o)::text from public.orders o join public.events e on e.id=o.event_id where e.slug='${slug}'`));
  const intent = await stripe.paymentIntents.retrieve(saved.stripe_payment_intent_id);
  assert.equal(intent.amount, 1000);
  assert.equal(intent.currency, "usd");
  assert.equal(intent.status, "succeeded");
  console.log("PASS real Stripe TEST API payment -> signed CLI webhook -> one paid order/valid ticket -> branded browser confirmation");
  const ticket = JSON.parse(await sql(`select row_to_json(t)::text from public.tickets t where order_id='${saved.id}'`));
  await page.getByRole("img", { name: "Ticket QR code", exact: true }).waitFor();
  assert.equal(await page.getByRole("img", { name: "Ticket QR code", exact: true }).count(), 1);
  const firstTicketUrl = await page.getByRole("link", { name: "Open your ticket", exact: true }).getAttribute("href");
  assert.equal(firstTicketUrl, `${url}/tickets/${ticket.ticket_token}`);
  const publicPage = await browser.newPage();
  assert.equal((await publicPage.goto(firstTicketUrl)).status(), 200);
  await publicPage.getByText(ticket.ticket_code, { exact: true }).waitFor();
  assert.equal(await publicPage.getByRole("img", { name: "Ticket QR code", exact: true }).count(), 1);
  assert.equal(await publicPage.getByText("local-ticket@example.com", { exact: true }).count(), 0);
  assert.equal(await publicPage.getByText(phone, { exact: true }).count(), 0);
  const invalid = await publicPage.goto(`${url}/tickets/${"0".repeat(64)}`);
  assert.equal(invalid.status(), 404);
  await publicPage.getByRole("heading", { name: "Ticket not found", exact: true }).waitFor();
  await publicPage.close();
  console.log("PASS exactly one QR with opaque ticket URL; independent-browser ticket page; invalid token 404; no contact data");
  const matchingEvents = await stripe.events.list({
    type: "payment_intent.succeeded",
    created: { gte: Math.floor(new Date(saved.created_at).getTime() / 1000) },
    limit: 100,
  });
  const eventId = matchingEvents.data.find((event) => event.data.object.id === intent.id)?.id;
  assert.ok(eventId, "Actual Stripe success event must exist");
  const event = await stripe.events.retrieve(eventId);
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await fetch(`${url}/api/stripe/webhook`, {
          method: "POST",
          headers: { "stripe-signature": signature },
          body: payload,
        })
      ).status,
      200,
    );
  assert.equal(await sql(`select count(*) from public.tickets where order_id='${saved.id}'`), "1");
  assert.equal(await sql(`select ticket_token from public.tickets where order_id='${saved.id}'`), ticket.ticket_token);
  console.log("PASS duplicate real Stripe event creates no additional ticket or token/QR credential");
  await attendee(phone);
  await page
    .getByRole("heading", {
      name: "You already have a ticket",
      exact: true,
    })
    .waitFor();
  assert.equal(await sql(`select count(*) from public.orders where event_id='${saved.event_id}'`), "1");
  console.log("PASS same phone/event returns already purchased without a second order");
  await page.close();
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.setExtraHTTPHeaders({ "x-local-ticket-test-ip": "127.0.0.81" });
  await attendee(declinedPhone);
  const declined = await pending(declinedPhone);
  assert.notEqual(declined.purchase_access_hash, saved.purchase_access_hash);
  assert.equal(await sql(`select count(*) from public.orders where event_id='${saved.event_id}'`), "2");
  console.log("PASS a different phone in the same browser/event gets its own credential/order without 23505");
  await assert.rejects(
    stripe.paymentIntents.confirm(declined.stripe_payment_intent_id, {
      payment_method: "pm_card_chargeDeclined",
      return_url: `${url}/ticket/return?event=${slug}`,
    }),
  );
  await page.waitForTimeout(1500);
  assert.equal(await sql(`select count(*) from public.tickets t join public.contacts c on c.id=t.contact_id where c.phone='${declinedPhone}'`), "0");
  console.log("PASS real Stripe TEST API decline creates no ticket");
  await attendee(phone);
  await page
    .getByRole("heading", {
      name: "You already have a ticket",
      exact: true,
    })
    .waitFor();
  assert.equal(await sql(`select count(*) from public.orders where event_id='${saved.event_id}'`), "2");
  console.log("PASS switching back to the first attendee still shows already purchased, without another order");
  await attendee(declinedPhone);
  await page.getByRole("button", { name: "Buy Now", exact: true }).waitFor();
  await stripe.paymentIntents.confirm(declined.stripe_payment_intent_id, {
    payment_method: "pm_card_visa",
    return_url: `${url}/ticket/return?event=${slug}`,
  });
  await page.goto(`${url}/ticket/return?event=${slug}`);
  await page.getByRole("heading", { name: "You're in!", exact: true }).waitFor({ timeout: 60000 });
  const secondTicketUrl = await page.getByRole("link", { name: "Open your ticket", exact: true }).getAttribute("href");
  assert.notEqual(secondTicketUrl, firstTicketUrl);
  assert.equal(await sql(`select count(distinct ticket_token) from public.tickets where event_id='${saved.event_id}'`), "2");
  console.log("PASS two independently paid tickets have distinct QR credentials; declined order succeeds on retry");
  assert.equal(cardLeak, false);
  console.log("PASS card number never posted to the El Solar server");
} catch (error) {
  if (page)
    await page
      .screenshot({
        path: "test-results/local-ticket-debug.png",
        fullPage: true,
        timeout: 5000,
      })
      .catch(() => {});
  const safe = String(error?.message ?? error).replace(/(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, "[redacted]");
  console.error(safe);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await resetFixtureLimits();
  const pending = await sql(
    `select coalesce(json_agg(stripe_payment_intent_id),'[]'::json)::text from public.orders where event_id in(select id from public.events where slug='${slug}') and status='pending' and stripe_payment_intent_id is not null`,
  );
  for (const id of JSON.parse(pending)) await stripe.paymentIntents.cancel(id).catch(() => {});
  await sql(`delete from public.tickets where event_id in(select id from public.events where slug='${slug}');
 delete from public.orders where event_id in(select id from public.events where slug='${slug}');
 delete from public.ticket_types where event_id in(select id from public.events where slug='${slug}');
 delete from public.events where slug='${slug}';delete from public.contacts where phone in('${phone}','${declinedPhone}');`);
}
