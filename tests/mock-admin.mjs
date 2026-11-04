// Loopback-only Auth/admin fixtures. Never imported by application code.
import { randomUUID } from "node:crypto";
const owner = "11111111-1111-4111-8111-111111111111";
const events = new Map();
const tokens = new Map();
export async function mockAdmin(req, res) {
  if (req.url === "/reset") {
    events.clear();
    tokens.clear();
    return false;
  }
  if (!req.url.startsWith("/auth/v1/") && !req.url.startsWith("/rest/v1/rpc/admin_")) return false;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const send = (value) => {
    res.end(JSON.stringify(value));
    return true;
  };
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
  if (req.url.endsWith("/admin_set_event_pin")) {
    const d = events.get(body.p_event_id);
    d.event.has_check_in_pin = true;
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
    events.set(id, { event, ticket_type, metrics: { tickets_sold: 0, gross_revenue_cents: 0, checked_in: 0, not_checked_in: 0, rsvps: 0 } });
    return send(id);
  }
  res.statusCode = 404;
  return send({});
}
