import { randomUUID } from "node:crypto";
// Local HTTP stand-in only: production code has no mock or demo bypass.
import { createServer } from "node:http";
const rows = new Map();
const counters = new Map();
let limiterUnavailable = false;
let discoveryUnavailable = false;
let noEvents = false;
let ticketMode = false;
let fixture = {};
const orders = new Map();
const intents = new Map();
const stripeEvents = new Set();
let doorCheckedAt = null;
function ticketStatus(order) {
  if (!order.ticket_code) return null;
  return order.status === "void" ? "void" : "valid";
}
createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") return res.end("{}");
  if (req.url === "/reset" && req.method === "POST") {
    doorCheckedAt = null;
    rows.clear();
    counters.clear();
    limiterUnavailable = false;
    discoveryUnavailable = false;
    noEvents = false;
    ticketMode = false;
    fixture = {};
    orders.clear();
    intents.clear();
    stripeEvents.clear();
    return res.end("{}");
  }
  // Loopback-only visual fixtures. No production bypass or real provider calls.
  if (req.url === "/fixture" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    fixture = { ...fixture, ...JSON.parse(body) };
    if (fixture.invalidTicket) for (const order of orders.values()) order.status = "void";
    return res.end("{}");
  }
  if (req.url === "/ticket-mode" && req.method === "POST") {
    ticketMode = true;
    return res.end("{}");
  }
  if (req.url === "/ticket-state") return res.end(JSON.stringify({ orders: [...orders.values()], intents: [...intents.values()] }));
  if (req.url.startsWith("/mock-stripe/v1/payment_intents")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.method === "POST" && req.url.endsWith("/cancel")) {
      const pi = [...intents.values()].find((pi) => req.url.endsWith(`/${pi.id}/cancel`));
      if (!pi || ["succeeded", "processing"].includes(pi.status)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: { message: "Not cancelable" } }));
      }
      pi.status = "canceled";
      return res.end(JSON.stringify(pi));
    }
    if (req.method === "POST") {
      const params = new URLSearchParams(body);
      const idempotency = req.headers["idempotency-key"];
      let pi = intents.get(idempotency);
      if (!pi) {
        const suffix = intents.size ? `Attempt${intents.size}` : "";
        pi = {
          id: `pi_testFixture${suffix}`,
          object: "payment_intent",
          amount: Number(params.get("amount")),
          amount_received: 0,
          currency: params.get("currency"),
          payment_method_types: params.getAll("payment_method_types[0]"),
          status: fixture.processing || fixture.checking ? "processing" : "requires_payment_method",
          client_secret: `pi_testFixture${suffix}_secret_fixture`,
          metadata: {
            order_id: params.get("metadata[order_id]"),
            event_id: params.get("metadata[event_id]"),
            ticket_type_id: params.get("metadata[ticket_type_id]"),
          },
        };
        intents.set(idempotency, pi);
      }
      return res.end(JSON.stringify(pi));
    }
    return res.end(JSON.stringify([...intents.values()].find((pi) => req.url.endsWith(pi.id))));
  }
  if (["/rest/v1/rpc/validate_door_ticket", "/rest/v1/rpc/check_in_door_ticket"].includes(req.url)) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const args = JSON.parse(body);
    if (args.p_event_slug !== "browser-door-event" || !["a".repeat(64), "EST-ABCDEF012345"].includes(args.p_credential)) return res.end(JSON.stringify({ status: "invalid", reason: fixture.doorReason ?? "not_found" }));
    let status = doorCheckedAt ? "already_checked_in" : "valid";
    if (req.url.endsWith("/check_in_door_ticket") && !doorCheckedAt) {
      doorCheckedAt = new Date().toISOString();
      status = "checked_in";
    }
    return res.end(JSON.stringify({ status, ticket_code: "EST-ABCDEF012345", ticket_type: "General Admission", event_name: "LOCAL ONLY Door Test", timezone: "America/New_York", checked_in_at: doorCheckedAt }));
  }
  if (req.url === "/rest/v1/rpc/initialize_ticket_order") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const p = JSON.parse(body);
    if (fixture.ticketDelay) await new Promise((resolve) => setTimeout(resolve, fixture.ticketDelay));
    if (fixture.ticketFailure) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ code: "UNAVAILABLE" }));
    }
    if (fixture.ticketClosed || fixture.salesClosed) return res.end(JSON.stringify({ status: "closed" }));
    if (p.p_event_slug !== "browser-ticket-event") return res.end(JSON.stringify({ status: "closed" }));
    if (fixture.ticketPromotion && (p.p_disclaimer_accepted !== true || p.p_displayed_disclaimer_version !== "2026-10-26-ticket-gift-card-v1"))
      return res.end(JSON.stringify({ status: "disclaimer_required" }));
    let o = orders.get(p.p_phone);
    if (o?.status === "paid") return res.end(JSON.stringify({ status: "already_purchased" }));
    if (!o) {
      o = {
        status: "pending",
        order_id: randomUUID(),
        event_id: "10000000-0000-4000-8000-000000000002",
        ticket_type_id: "10000000-0000-4000-8000-000000000003",
        amount_cents: 1000,
        currency: "usd",
        payment_intent_id: null,
        payment_attempt: 0,
        superseded: [],
        access: p.p_access_hash,
        gift_card_disclaimer_accepted: fixture.ticketPromotion ? p.p_disclaimer_accepted : null,
        disclaimer_version: fixture.ticketPromotion ? p.p_displayed_disclaimer_version : null,
      };
      orders.set(p.p_phone, o);
    }
    if (o.status === "pending" && o.access === p.p_access_hash) {
      o.submitted_name = p.p_name;
      o.submitted_email = p.p_email;
      o.referral_source = p.p_referral_source;
    }
    return res.end(
      JSON.stringify({
        ...o,
        status: !fixture.checking && o.access === p.p_access_hash ? "pending" : "recovery_required",
      }),
    );
  }
  if (req.url === "/rest/v1/rpc/recover_ticket_order") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const p = JSON.parse(body);
    const o = orders.get(p.p_phone);
    const ok = !!o && o.order_id === p.p_order_id && o.status === "pending" && o.payment_attempt === p.p_expected_attempt && (!o.payment_intent_id || o.payment_intent_id === p.p_canceled_intent_id);
    if (ok) {
      o.superseded.push(p.p_canceled_intent_id);
      o.access = p.p_access_hash;
      o.payment_intent_id = null;
      o.payment_attempt++;
    }
    return res.end(JSON.stringify(ok));
  }
  if (req.url === "/rest/v1/rpc/attach_ticket_payment_intent") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const p = JSON.parse(body);
    const o = [...orders.values()].find((o) => o.order_id === p.p_order_id && o.access === p.p_access_hash && o.payment_attempt === (p.p_attempt ?? 0));
    if (o) o.payment_intent_id = p.p_intent_id;
    return res.end(JSON.stringify(!!o));
  }
  if (req.url === "/rest/v1/rpc/process_ticket_payment") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const p = JSON.parse(body);
    if (stripeEvents.has(p.p_stripe_event_id)) return res.end(JSON.stringify("duplicate"));
    const o = [...orders.values()].find((o) => o.order_id === p.p_order_id);
    if (!o || o.payment_intent_id !== p.p_intent_id || o.amount_cents !== p.p_amount) {
      res.statusCode = 500;
      return res.end("{}");
    }
    stripeEvents.add(p.p_stripe_event_id);
    if (p.p_event_type === "payment_intent.succeeded") {
      o.status = "paid";
      o.ticket_code ??= p.p_ticket_code;
      o.ticket_token ??= p.p_ticket_token;
    }
    return res.end(JSON.stringify("fulfilled"));
  }
  if (req.url === "/rest/v1/rpc/get_ticket_purchase") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const p = JSON.parse(body);
    const o = [...orders.values()].find((o) => o.access === p.p_access_hash);
    return res.end(
      JSON.stringify(
        o
          ? {
              status: o.status,
              ticket_code: o.ticket_code ?? null,
              ticket_status: ticketStatus(o),
              ticket_token: o.ticket_code ? o.ticket_token : null,
              event_name: "LOCAL ONLY — Ticket Event",
              event_date: "2026-12-30",
              starts_at: "2026-12-31T01:00:00Z",
              ends_at: "2026-12-31T04:00:00Z",
              timezone: "America/New_York",
              venue_name: "Local Test Venue",
              venue_address: "LOCAL ONLY",
              ticket_type: "General Admission",
              amount_cents: 1000,
              currency: "usd",
            }
          : null,
      ),
    );
  }
  if (req.url === "/rest/v1/rpc/get_ticket_by_token") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const p = JSON.parse(body);
    const o = [...orders.values()].find((o) => o.status === "paid" && o.ticket_token === p.p_token);
    return res.end(
      JSON.stringify(
        o
          ? {
              status: o.status,
              ticket_code: o.ticket_code ?? null,
              ticket_status: ticketStatus(o),
              ticket_token: o.ticket_code ? o.ticket_token : null,
              event_name: "LOCAL ONLY — Ticket Event",
              event_date: "2026-12-30",
              starts_at: "2026-12-31T01:00:00Z",
              ends_at: "2026-12-31T04:00:00Z",
              timezone: "America/New_York",
              venue_name: "Local Test Venue",
              venue_address: "LOCAL ONLY",
              ticket_type: "General Admission",
              amount_cents: 1000,
              currency: "usd",
            }
          : null,
      ),
    );
  }
  if (req.url === "/discovery-unavailable" && req.method === "POST") {
    discoveryUnavailable = true;
    return res.end("{}");
  }
  if (req.url === "/no-events" && req.method === "POST") {
    noEvents = true;
    return res.end("{}");
  }
  if (req.url === "/limiter-unavailable" && req.method === "POST") {
    limiterUnavailable = true;
    return res.end("{}");
  }
  if (req.url === "/expire-limits" && req.method === "POST") {
    counters.clear();
    return res.end("{}");
  }
  if (req.url === "/rest/v1/rpc/consume_rsvp_rate_limit" && req.method === "POST") {
    if (fixture.rateLimited) return res.end("60");
    if (limiterUnavailable) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ code: "UNAVAILABLE" }));
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const { p_scope: scope, p_key_hash: hash } = JSON.parse(body);
    const policies = { global: [100, 60], ip: [10, 600], phone: [5, 900] };
    if (!policies[scope] || !/^[a-f0-9]{64}$/.test(hash)) {
      res.statusCode = 400;
      return res.end("{}");
    }
    const key = `${scope}:${hash}`;
    const attempts = (counters.get(key) ?? 0) + 1;
    counters.set(key, attempts);
    return res.end(JSON.stringify(attempts > policies[scope][0] ? policies[scope][1] : 0));
  }
  if (["/rest/v1/rpc/get_rsvp_event", "/rest/v1/rpc/get_available_rsvp_events"].includes(req.url) && req.method === "POST") {
    const event = {
      slug: "browser-test-event",
      name: "LOCAL ONLY — Browser Test Event",
      event_date: "2026-12-31",
      starts_at: "2027-01-01T01:00:00Z",
      ends_at: "2027-01-01T04:00:00Z",
      timezone: "America/New_York",
      venue_name: "Local Test Venue",
      venue_address: "LOCAL ONLY",
      open: true,
      disclaimer_version: null,
    };
    const later = {
      ...event,
      slug: "browser-later-event",
      name: "LOCAL ONLY — Later Event",
      event_date: "2027-01-04",
      starts_at: "2027-01-05T01:00:00Z",
      ends_at: "2027-01-05T04:00:00Z",
    };
    if (req.url.endsWith("get_available_rsvp_events")) {
      if (discoveryUnavailable) {
        res.statusCode = 503;
        return res.end("{}");
      }
      let available = [event, later];
      if (ticketMode)
        available.push({
          ...event,
          slug: "browser-ticket-event",
          name: "LOCAL ONLY — Ticket Event",
          event_date: "2026-12-30",
          admission_mode: "ticketed",
          price_cents: 1000,
          currency: "usd",
          ticket_type_name: "General Admission",
          disclaimer_version: fixture.ticketPromotion ? "2026-10-26-ticket-gift-card-v1" : null,
          open: !(fixture.salesClosed || fixture.ticketClosed),
          sales_closed: !!(fixture.salesClosed || fixture.ticketClosed),
        });
      if (noEvents) available = [];
      return res.end(JSON.stringify(available));
    }

    let body = "";
    for await (const chunk of req) body += chunk;
    return res.end(JSON.stringify({ ...(JSON.parse(body).p_event_slug === later.slug ? later : event), open: !fixture.rsvpClosed }));
  }
  if (req.url !== "/rest/v1/rpc/submit_normalized_rsvp" || req.method !== "POST") {
    res.statusCode = 404;
    return res.end("{}");
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const record = JSON.parse(body);
  await new Promise((resolve) => setTimeout(resolve, fixture.rsvpDelay ?? 350));
  if (record.p_email === "failure@example.com") {
    res.statusCode = 500;
    return res.end(JSON.stringify({ code: "XX000" }));
  }
  if (!["browser-test-event", "browser-later-event"].includes(record.p_event_slug)) {
    res.statusCode = 400;
    return res.end("{}");
  }
  const key = JSON.stringify([record.p_event_slug, record.p_phone]);
  if (rows.has(key)) return res.end(JSON.stringify("duplicate"));
  rows.set(key, record);
  res.end(JSON.stringify("success"));
}).listen(54329, "127.0.0.1");
