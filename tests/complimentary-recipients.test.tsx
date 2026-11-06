import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import ComplimentaryRecipients from "../src/components/admin/ComplimentaryRecipients";

test("complimentary recipients display check-in time in the event timezone and unused tickets clearly", () => {
  const recipient = {
    name: "Test Guest",
    email: "guest@example.com",
    phone: "+12025550111",
    ticket_code: "EST-123456ABCDEF",
    status: "valid",
    issued_at: "2033-01-20T20:00:00Z",
    email_sent_at: null,
    email_attempted_at: null,
    checked_in_at: null,
  };
  const unused = renderToStaticMarkup(<ComplimentaryRecipients recipients={[recipient]} timezone="America/New_York" />);
  assert.ok(unused.includes("Checked in at"));
  assert.ok(unused.includes("Not checked in"));
  const used = renderToStaticMarkup(<ComplimentaryRecipients recipients={[{ ...recipient, checked_in_at: "2033-01-20T22:15:00Z" }]} timezone="America/New_York" />);
  assert.ok(used.includes("Jan 20, 2033, 5:15 PM"));
  assert.ok(!used.includes("Not checked in"));
});
