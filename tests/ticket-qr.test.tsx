import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import TicketCard from "../src/components/tickets/TicketCard";
import type { TicketDisplay } from "../src/lib/tickets/types";

const ticket: TicketDisplay = {
  ticket_code: "EST-123456ABCDEF",
  ticket_url: `https://example.test/tickets/${"a".repeat(64)}`,
  event_name: "El Solar Test Night",
  event_date: "2026-12-30",
  starts_at: "2026-12-31T01:00:00Z",
  ends_at: "2026-12-31T04:00:00Z",
  timezone: "America/New_York",
  venue_name: "Test Venue",
  venue_address: "Test Address",
  ticket_type: "General Admission",
  amount_cents: 1000,
  currency: "usd",
};
test("ticket renders one sharp QR with only its opaque URL and branded admission details", () => {
  const html = renderToStaticMarkup(<TicketCard ticket={ticket} />);
  assert.equal((html.match(/aria-label="Ticket QR code"/g) ?? []).length, 1);
  assert.equal((html.match(/class="event-date /g) ?? []).length, 1);
  assert.ok(html.includes("8–11 PM"));
  assert.ok(!html.includes("FREE.99"));
  assert.ok(html.includes(`href="${ticket.ticket_url}?view=card"`));
  for (const text of [
    ticket.event_name,
    ticket.venue_name,
    ticket.ticket_code,
    "General Admission",
    "$10",
    "Present this QR code at the door.",
    "Each ticket is valid for one admission.",
    "Save or screenshot your ticket.",
  ])
    assert.ok(html.replace(/<[^>]*>/g, "").includes(text));
  const other = renderToStaticMarkup(<TicketCard ticket={{ ...ticket, ticket_url: `https://example.test/tickets/${"b".repeat(64)}` }} />);
  assert.notEqual(html.match(/<svg[^>]*aria-label="Ticket QR code"[\s\S]*?<\/svg>/)?.[0], other.match(/<svg[^>]*aria-label="Ticket QR code"[\s\S]*?<\/svg>/)?.[0]);
  assert.ok(!new URL(ticket.ticket_url).search);
});
test("ticket URL uses configured origin, validates tokens and accepts local HTTP only", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { ticketUrl } from './src/lib/tickets/config.ts';
    const token='a'.repeat(64);
    for(const site of ['https://elsolartimbero.com','http://localhost:3000']) {
      process.env.SITE_URL=site;assert.equal(ticketUrl(token),site+'/tickets/'+token);
    }
    process.env.SITE_URL='http://insecure.example';assert.throws(()=>ticketUrl(token));
    process.env.SITE_URL='https://example.test';
    for(const invalid of ['123','EST-123456ABCDEF','../secret','a'.repeat(63),null]) assert.throws(()=>ticketUrl(invalid));
  `,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
