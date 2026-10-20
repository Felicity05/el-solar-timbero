// Local HTTP stand-in only: production code has no mock or demo bypass.
import { createServer } from "node:http";
const rows = new Map();
const counters = new Map();
let limiterUnavailable = false;
let discoveryUnavailable = false;
let noEvents = false;
createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") return res.end("{}");
  if (req.url === "/reset" && req.method === "POST") { rows.clear(); counters.clear(); limiterUnavailable = false; discoveryUnavailable = false; noEvents = false; return res.end("{}"); }
  if (req.url === "/discovery-unavailable" && req.method === "POST") { discoveryUnavailable = true; return res.end("{}"); }
  if (req.url === "/no-events" && req.method === "POST") { noEvents = true; return res.end("{}"); }
  if (req.url === "/limiter-unavailable" && req.method === "POST") { limiterUnavailable = true; return res.end("{}"); }
  if (req.url === "/expire-limits" && req.method === "POST") { counters.clear(); return res.end("{}"); }
  if (req.url === "/rest/v1/rpc/consume_rsvp_rate_limit" && req.method === "POST") {
    if (limiterUnavailable) { res.statusCode = 503; return res.end(JSON.stringify({ code: "UNAVAILABLE" })); }
    let body = "";
    for await (const chunk of req) body += chunk;
    const { p_scope: scope, p_key_hash: hash } = JSON.parse(body);
    const policies = { global: [100, 60], ip: [10, 600], phone: [5, 900] };
    if (!policies[scope] || !/^[a-f0-9]{64}$/.test(hash)) { res.statusCode = 400; return res.end("{}"); }
    const key = `${scope}:${hash}`;
    const attempts = (counters.get(key) ?? 0) + 1;
    counters.set(key, attempts);
    return res.end(JSON.stringify(attempts > policies[scope][0] ? policies[scope][1] : 0));
  }
  if (["/rest/v1/rpc/get_rsvp_event", "/rest/v1/rpc/get_available_rsvp_events"].includes(req.url) && req.method === "POST") {
    const event = { slug: "browser-test-event", name: "LOCAL ONLY — Browser Test Event",
      event_date: "2026-12-31", starts_at: "2027-01-01T01:00:00Z", ends_at: "2027-01-01T04:00:00Z",
      timezone: "America/New_York", venue_name: "Local Test Venue", venue_address: "LOCAL ONLY",
      open: true, disclaimer_version: null };
    const later = { ...event, slug: "browser-later-event", name: "LOCAL ONLY — Later Event", event_date: "2027-01-04",
      starts_at: "2027-01-05T01:00:00Z", ends_at: "2027-01-05T04:00:00Z" };
    if(req.url.endsWith("get_available_rsvp_events")) {
      if(discoveryUnavailable) { res.statusCode=503; return res.end("{}"); }
      return res.end(JSON.stringify(noEvents ? [] : [event,later]));
    }
    let body=""; for await (const chunk of req) body+=chunk;
    return res.end(JSON.stringify(JSON.parse(body).p_event_slug === later.slug ? later : event));
  }
  if (req.url !== "/rest/v1/rpc/submit_normalized_rsvp" || req.method !== "POST") { res.statusCode = 404; return res.end("{}"); }
  let body = "";
  for await (const chunk of req) body += chunk;
  const record = JSON.parse(body);
  await new Promise(resolve => setTimeout(resolve, 350));
  if (record.p_email === "failure@example.com") { res.statusCode = 500; return res.end(JSON.stringify({ code: "XX000" })); }
  if (!["browser-test-event", "browser-later-event"].includes(record.p_event_slug)) { res.statusCode = 400; return res.end("{}"); }
  const key = JSON.stringify([record.p_event_slug, record.p_phone]);
  if (rows.has(key)) return res.end(JSON.stringify("duplicate"));
  rows.set(key, record);
  res.end(JSON.stringify("success"));
}).listen(54329, "127.0.0.1");
