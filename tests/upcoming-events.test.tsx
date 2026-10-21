import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import UpcomingEvents from "../src/components/event/UpcomingEvents";
import type { RsvpEvent } from "../src/lib/rsvp/rsvp-event";

test("UpcomingEvents preserves the list markup and is not rendered by the public page", () => {
  const events = ["first", "second"].map((slug) => ({ slug, name: `Event ${slug}`, event_date: "2027-01-04" })) as RsvpEvent[];
  const html = renderToStaticMarkup(<UpcomingEvents events={events} selectedSlug="second" />);
  assert.match(html, /aria-label="Available events"/);
  assert.match(html, /border-border border-b p-6/);
  assert.match(html, /January 4, 2027/);
  assert.ok(html.includes('href="/?event=second"'));
  assert.match(html, /aria-current="page"/);
  assert.equal(renderToStaticMarkup(<UpcomingEvents events={[]} />), "");
  assert.equal(readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8").includes("UpcomingEvents"), false);
});
