// Local HTTP stand-in only: production code has no mock or demo bypass.
import { createServer } from "node:http";
const rows = new Map();
createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/health") return res.end("{}");
  if (req.url === "/reset" && req.method === "POST") { rows.clear(); return res.end("{}"); }
  if (req.url !== "/rest/v1/rsvps" || req.method !== "POST") { res.statusCode = 404; return res.end("{}"); }
  let body = "";
  for await (const chunk of req) body += chunk;
  const record = JSON.parse(body);
  await new Promise(resolve => setTimeout(resolve, 350));
  if (record.email === "failure@example.com") { res.statusCode = 500; return res.end(JSON.stringify({ code: "XX000", message: "Simulated database failure" })); }
  const key = JSON.stringify([record.event_slug, record.phone]);
  if (rows.has(key)) { res.statusCode = 409; return res.end(JSON.stringify({ code: "23505", message: "Duplicate" })); }
  const expected = ["event_slug", "name", "phone", "email", "referral_source", "gift_card_disclaimer_accepted", "disclaimer_version"].sort();
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expected) || record.disclaimer_version !== "2026-10-12-v1" || record.event_slug !== "cuban-night-social-2026-10-12" || record.gift_card_disclaimer_accepted !== true) { res.statusCode = 400; return res.end(JSON.stringify({ code: "BAD_PAYLOAD" })); }
  rows.set(key, record);
  res.statusCode = 201;
  res.end();
}).listen(54329, "127.0.0.1");
