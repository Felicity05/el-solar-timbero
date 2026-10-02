// Local HTTP stand-in only: production code has no mock or demo bypass.
import { createServer } from "node:http";
const rows = new Map();
const counters = new Map();
let limiterUnavailable = false;
createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") return res.end("{}");
  if (req.url === "/reset" && req.method === "POST") { rows.clear(); counters.clear(); limiterUnavailable = false; return res.end("{}"); }
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
  if (req.url !== "/rest/v1/rsvps" || req.method !== "POST") { res.statusCode = 404; return res.end("{}"); }
  let body = "";
  for await (const chunk of req) body += chunk;
  const record = JSON.parse(body);
  await new Promise(resolve => setTimeout(resolve, 350));
  if (record.email === "failure@example.com") { res.statusCode = 500; return res.end(JSON.stringify({ code: "XX000", message: "Simulated database failure" })); }
  const key = JSON.stringify([record.event_slug, record.phone]);
  if (rows.has(key)) { res.statusCode = 409; return res.end(JSON.stringify({ code: "23505", message: 'duplicate key value violates unique constraint "rsvps_event_phone_key"' })); }
  const expected = ["event_slug", "name", "phone", "email", "referral_source", "gift_card_disclaimer_accepted", "disclaimer_version"].sort();
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expected) || record.disclaimer_version !== "2026-10-12-v1" || record.event_slug !== "cuban-night-social-2026-10-12" || record.gift_card_disclaimer_accepted !== true) { res.statusCode = 400; return res.end(JSON.stringify({ code: "BAD_PAYLOAD" })); }
  rows.set(key, record);
  res.statusCode = 201;
  res.end();
}).listen(54329, "127.0.0.1");
