// Loopback-only Auth/admin fixtures. Never imported by application code.
import { randomUUID } from "node:crypto";
const owner = "11111111-1111-4111-8111-111111111111";
const events = new Map();
const tokens = new Map();
const pinStores = new Map();
let pinReads = 0;
const complimentary = new Map();
export async function mockAdmin(req, res) {
  if (req.url === "/reset") {
    events.clear();
    pinStores.clear();
    pinReads = 0;
    complimentary.clear();
    tokens.clear();
    return false;
  }
  if (req.url === "/rest/v1/rpc/get_ticket_by_token") {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const body = JSON.parse(Buffer.concat(buffers).toString());
    const t = [...complimentary.values()].find((t) => t.ticket_token === body.p_token);
    if (t) {
      res.end(
        JSON.stringify({
          ticket_token: t.ticket_token,
          ticket_code: t.ticket_code,
          event_name: t.event_name,
          event_date: t.event_date,
          starts_at: t.starts_at,
          ends_at: t.ends_at,
          timezone: t.timezone,
          venue_name: t.venue_name,
          venue_address: t.venue_address,
          ticket_type: t.ticket_type,
          amount_cents: 0,
          currency: "usd",
        }),
      );
      return true;
    }
    // Let the original paid-ticket fixture parse the same request body.
    req.fixtureBody = JSON.stringify(body);
    return false;
  }
  if (req.url === "/pin-read-count") {
    res.end(JSON.stringify({ count: pinReads }));
    return true;
  }
  if (req.url === "/complimentary-state") {
    res.end(JSON.stringify([...complimentary.values()].map((t) => ({ ticket_code: t.ticket_code, attempted: t.attempted, sent: t.sent }))));
    return true;
  }
  if (
    !req.url.startsWith("/auth/v1/") &&
    !req.url.startsWith("/rest/v1/rpc/admin_") &&
    !["/rest/v1/rpc/claim_complimentary_ticket_email", "/rest/v1/rpc/mark_ticket_email_sent", "/rest/v1/rpc/get_expired_ticket_reservations"].includes(req.url)
  )
    return false;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const send = (value) => {
    res.end(JSON.stringify(value));
    return true;
  };
  if (req.url.endsWith("/get_expired_ticket_reservations")) return send([]);
  if (req.url.endsWith("/claim_complimentary_ticket_email")) {
    const ticket = complimentary.get(body.p_order_id);
    if (!ticket || ticket.attempted) return send(null);
    ticket.attempted = true;
    return send(ticket);
  }
  if (req.url.endsWith("/mark_ticket_email_sent")) {
    const ticket = complimentary.get(body.p_order_id);
    if (!ticket) return send(false);
    ticket.sent = true;
    return send(true);
  }
  if (req.url.endsWith("/admin_issue_complimentary_ticket")) {
    const detail = events.get(body.p_event_id);
    if (!detail) return send({ status: "unavailable" });
    const old = [...complimentary.values()].find((t) => t.phone === body.p_phone && t.event_id === body.p_event_id);
    if (old) return send({ ...old, status: "already_issued" });
    if (detail.event.ticket_capacity && detail.metrics.tickets_issued >= detail.event.ticket_capacity) return send({ status: "capacity_full" });
    const ticket = {
      status: "issued",
      order_id: randomUUID(),
      event_id: body.p_event_id,
      name: body.p_name,
      issued_at: new Date().toISOString(),
      phone: body.p_phone,
      recipient: body.p_email,
      ticket_token: body.p_ticket_token,
      ticket_code: body.p_ticket_code,
      event_name: detail.event.name,
      event_date: detail.event.event_date,
      starts_at: detail.event.starts_at,
      ends_at: detail.event.ends_at,
      timezone: detail.event.timezone,
      venue_name: detail.event.venue_name,
      venue_address: detail.event.venue_address,
      ticket_type: detail.ticket_type.name,
      amount_cents: 0,
      currency: "usd",
      attempted: false,
      sent: false,
    };
    complimentary.set(ticket.order_id, ticket);
    detail.metrics.complimentary_tickets++;
    detail.metrics.tickets_issued++;
    detail.metrics.not_checked_in++;
    if (detail.event.ticket_capacity) detail.metrics.remaining_capacity--;
    return send(ticket);
  }
  if (req.url.startsWith("/auth/v1/token")) {
    if (body.password !== "test-password-only") {
      res.statusCode = 400;
      return send({ message: "Invalid login credentials" });
    }
    const id = body.email === "owner@example.com" ? owner : "22222222-2222-4222-8222-222222222222";
    const user = { id, email: body.email, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url"),
      "fixture",
    ].join(".");
    tokens.set(token, user);
    return send({ access_token: token, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, user });
  }
  if (req.url === "/auth/v1/user") {
    const user = tokens.get(req.headers.authorization?.replace("Bearer ", ""));
    if (!user) {
      res.statusCode = 401;
      return send({ message: "Invalid token" });
    }
    return send(user);
  }
  if (req.url === "/auth/v1/logout") return send({});
  if (req.url.endsWith("/admin_event_form_options")) return send({ disclaimer_versions: ["guantanamera-ticket-2026-10-26", "guantanamera-2026-10-12"], ticket_names: ["General Admission", "VIP"] });
  if (req.url.endsWith("/admin_list_events")) return send([...events.values()].map((d) => d.event));
  if (req.url.endsWith("/admin_event_detail")) return send(events.get(body.p_event_id) ?? null);
  if (req.url.endsWith("/admin_list_complimentary_recipients"))
    return send(
      [...complimentary.values()]
        .filter((t) => t.event_id === body.p_event_id)
        .map((t) => ({
          name: t.name,
          email: t.recipient,
          phone: t.phone,
          ticket_code: t.ticket_code,
          status: "valid",
          issued_at: t.issued_at,
          email_sent_at: t.sent ? t.issued_at : null,
          checked_in_at: t.checked_in_at ?? null,
          email_attempted_at: t.attempted ? t.issued_at : null,
        })),
    );
  if (req.url.endsWith("/admin_get_event_pin")) {
    pinReads++;
    return send(pinStores.get(body.p_event_id) ?? { pin_hash: null, pin_ciphertext: null });
  }
  if (req.url.endsWith("/admin_set_event_pin")) {
    const d = events.get(body.p_event_id);
    d.event.has_check_in_pin = true;
    pinStores.set(body.p_event_id, { pin_hash: body.p_pin_hash, pin_ciphertext: body.p_pin_ciphertext ?? null });
    return send(true);
  }
  if (req.url.endsWith("/admin_duplicate_event")) {
    const d = structuredClone(events.get(body.p_event_id)),
      id = randomUUID();
    d.event = { ...d.event, id, slug: `draft-${id.replaceAll("-", "")}`, status: "draft", has_check_in_pin: false, rsvp_open: false, ticket_sales_open: false };
    // Match the winter New York dates used by these browser fixtures.
    const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: d.event.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(),
    );
    const date = new Date(`${parts.replace(" ", "T")}:00Z`);
    date.setUTCDate(date.getUTCDate() + 2);
    d.event.publish_at = new Date(`${date.toISOString().slice(0, 16)}-05:00`).toISOString();
    events.set(id, d);
    return send(id);
  }
  if (req.url.endsWith("/admin_save_event")) {
    const c = body.p_config,
      id = body.p_event_id ?? randomUUID();
    const iso = (value) => (value ? new Date(`${value}-05:00`).toISOString() : null); // Fixtures use winter New York dates; real timezone conversion is tested in PostgreSQL.
    const event = {
      ...c,
      id,
      starts_at: iso(c.starts_at_local),
      ends_at: iso(c.ends_at_local),
      publish_at: iso(c.publish_at_local),
      display_status: c.status === "published" && iso(c.publish_at_local) > new Date().toISOString() ? "Scheduled" : c.status,
      has_check_in_pin: events.get(id)?.event.has_check_in_pin ?? false,
    };
    const ticket_type =
      c.admission_mode === "ticketed"
        ? {
            name: c.ticket_name,
            description: c.ticket_description,
            price_cents: c.price_cents,
            currency: "usd",
            active: c.ticket_active,
            sales_start_at: iso(c.sales_start_local),
            sales_end_at: iso(c.sales_end_local),
          }
        : null;
    events.set(id, {
      event,
      ticket_type,
      metrics: {
        tickets_sold: 0,
        tickets_issued: 0,
        complimentary_tickets: 0,
        pending_reservations: 0,
        remaining_capacity: c.ticket_capacity ?? null,
        gross_revenue_cents: 0,
        checked_in: 0,
        not_checked_in: 0,
        rsvps: 0,
      },
    });
    return send(id);
  }
  res.statusCode = 404;
  return send({});
}
