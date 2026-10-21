# Ticket email delivery

This adds Gmail delivery to the existing paid-ticket webhook. RSVP, PaymentIntent creation, fulfillment, ticket identity, customer components and styling are unchanged. The existing upcoming-events navigation was moved verbatim into `src/components/event/UpcomingEvents.tsx` (same classes, date formatting, event links, selected-event indication, and multiple-events guard); it is intentionally not imported/rendered anywhere. Event discovery and explicit `?event=` selection remain available.

## Configuration

Configure these **server-only** variables in ignored `.env.development.local` locally, and in Vercel → project → Settings → Environment Variables for the intended deployment environment:

```dotenv
GMAIL_USER=your-sending-account@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password
# Optional sender name, email alias, or Name <verified-alias@example.com>.
TICKET_EMAIL_FROM="El Solar Timbero"
SITE_URL=http://localhost:3000
```

Production SITE_URL must be `https://elsolartimbero.com`. Keep the existing Stripe/Supabase variables unchanged. Never prefix Gmail variables with NEXT_PUBLIC_; never use your normal Gmail password or commit credentials. Set the App Password as sensitive in Vercel. Restart the local app after configuration; new Vercel environment values require a new deployment (none is performed by this change). Keep preview credentials isolated so synthetic purchases cannot accidentally email customers.

Enable Google 2-Step Verification and create a dedicated App Password in [Google Account → App passwords](https://myaccount.google.com/apppasswords). Availability depends on account policy; see [Google's App Password guide](https://support.google.com/accounts/answer/185833). TICKET_EMAIL_FROM accepts plain display-name text (sent from GMAIL_USER), a verified send-as email address, or Name <verified-address>. With an empty value the display name defaults to El Solar Timbero. Gmail can rewrite an unverified From address; use an address override only for a verified send-as alias. SMTP uses `smtp.gmail.com:465` with TLS certificate verification enabled, bounded connection/socket timeouts, and no SMTP debug logs. Confirm Gmail sign-in/sending works from the deployed environment before release; Gmail quotas, anti-abuse checks and spam filtering still apply.

## Fulfillment boundary and duplicate protection

1. The route verifies the raw Stripe signature and existing live/test rules.
2. The existing `process_ticket_payment` RPC commits the paid order, sole ticket/token/code and Stripe-event receipt exactly as before.
3. Only for verified `payment_intent.succeeded` with an associated internal order, the route schedules `deliverTicketEmail` via Next.js `after`. It runs after the HTTP response, inside the server invocation lifetime (route maxDuration 60 seconds), never in the browser or success page.
4. New service-role-only `claim_ticket_email(order_id,intent_id)` verifies the stored intent, paid order and valid ticket and atomically sets `tickets.email_attempted_at` only if no prior attempt/sent timestamp exists. Concurrent callbacks and distinct/duplicate success events all contend on that one ticket row. It returns the **order's submitted_email snapshot**, not a contact's later email, and the event/ticket details needed for this email.
5. Nodemailer sends one HTML/plain-text email with the existing credential's QR. Gmail SMTP acceptance records `email_sent_at` through a narrow second RPC. This timestamp means accepted by SMTP, not guaranteed inbox delivery.

The additive migration is `20261021174535_ticket_email_delivery.sql`. It adds only two nullable timestamps, their consistency check and the two restricted RPCs. Existing rows are preserved; no bulk historical sends occur. Browser roles cannot execute the RPCs; service_role still has no direct table CRUD. Only local Supabase has received this migration during development.

## Email and QR

The message includes brand/confirmation, event name/local date/time/timezone, venue/address, General Admission, the database price ($10), human-readable code, admission instructions and the non-refundable notice. HTML values are escaped. The recipient is one structured address from the order snapshot. No contact phone, Stripe ID, internal UUID, or raw visible token is included.

The current website QR/link includes its existing presentation query: `{SITE_URL}/tickets/{ticket_token}?view=card`. Email uses that **exact same payload**, including the existing view query. It does not create a second ticket, token or QR identity. `qrcode.react` remains the website renderer; the small server `qrcode` package generates a 560px PNG in memory because Gmail reliably supports PNG whereas SVG email support varies. Nodemailer embeds it as a [CID inline attachment](https://nodemailer.com/message/embedded-images), with a clickable ticket link and plain-text fallback. No storage bucket, image blob column, remote QR service, or React Email framework is used.

## Failure and manual recovery

Email work has no payment transaction and cannot undo fulfillment. A failure logs only a safe operation (`email.configuration`, `email.claim`, `email.send`, or `email.record`), error class and diagnostic reference through the existing logger. No SMTP messages, recipient addresses, credentials or QR URLs are logged. The paid order/ticket and existing success page remain usable. Email failure never changes the webhook's successful fulfillment response into a payment failure.

SMTP has no transactional exactly-once delivery guarantee. If Gmail accepts a message and the response/acknowledgment is lost, automatic retry can duplicate delivery. Therefore **attempted claims do not expire or automatically reset**, even on failure. No queue, retry worker, resend UI or page-view delivery exists. A crash after a successful webhook response can also leave an unattempted or unfinished email requiring manual reconciliation.

Inspect attempts through trusted SQL/admin access only:

```sql
select order_id, email_attempted_at, email_sent_at
from public.tickets
where email_sent_at is null;
```

- Both timestamps NULL: never attempted (for example missing configuration or a callback that did not run). Fix configuration and manually replay the original signed success event using Stripe's endpoint tooling. The existing paid order/ticket are reused.
- Attempt present, sent NULL: **do not blindly resend**. Inspect Gmail Sent and safe server diagnostics first; acceptance may have occurred. After confirming no delivery occurred and no sender is still running, an operator may reset email_attempted_at for that single ticket with email_sent_at still NULL, then manually replay its success event. A replay without resetting an attempted claim intentionally sends nothing.
- Sent timestamp present: no normal resend. Seeing the success/already-purchased page or refreshing it never sends mail.

Do not change ticket status, remove uniqueness constraints, refund, or delete the Stripe-event receipt to recover an email. No manual reset/replay or real Gmail email is performed by automated tests. A separately authorized manual SMTP test is recorded below.

## Review files and verification

- `src/app/page.tsx`, `src/components/event/UpcomingEvents.tsx`: extract/preserve the list without rendering it.
- `src/app/api/stripe/webhook/route.ts`, `src/lib/tickets/server.ts`: schedule email only after committed success fulfillment.
- `src/lib/tickets/email.ts`: server-only Gmail transport, simple HTML/plain-text message, CID QR and safe failure handling.
- `supabase/migrations/20261021174535_ticket_email_delivery.sql`: timestamps/claim/acceptance RPCs.
- `.env.example`, `package.json`, `package-lock.json`: configuration and pinned Nodemailer/PNG QR packages/types.
- `tests/ticket-email.test.ts`, `tests/ticket-database.test.ts`, `tests/local-ticket.integration.mjs`, `tests/ticket-webhook.test.ts`, `tests/fixtures/next-after.cjs`: content/MIME, claims/concurrency, permissions, failure isolation and verified webhook scheduling tests.
- `tests/upcoming-events.test.tsx`, `tests/browser/rsvp.spec.ts`: preserved component/no public list, unchanged discovery and RSVP flows.
- `tests/ticket-qr.test.tsx`, `tests/browser/ticket.spec.ts`: align assertions with existing manual `?view=card`, result-copy/span changes and the intended Stripe-owned payment-error UI; verify the completed credential lookup reaches its existing fallback.
- `docs/ticket-email.md`, `docs/ticketing.md`, `docs/database.md`: setup, limitations and local migration record.

No production migration, push, merge or deployment is part of this change. Real Gmail inbox delivery requires configured credentials and a controlled test to an address you own; automated tests use synthetic recipients and Nodemailer's in-memory MIME transport, never Gmail.

### Verification results — October 21, 2026

Node 24.21.0. All 62 automated tests pass; lint passes with nine warnings and zero errors; typecheck and production build pass. Local PostgreSQL ticket checks pass including eight simultaneous email claims producing exactly one claim; all 11 existing local RSVP checks pass with historical rows unchanged. Local Supabase advisors report no issues; the production dependency audit reports zero vulnerabilities.

All 38 desktop/mobile browser cases now pass, including credential lookup followed by the public already-purchased fallback, Stripe decline without a ticket, success/QR, sales closure and RSVP states. The earlier credential fallback was unreachable because an unconditional alreadyPurchased return came before the finished fallback; its overlay branch now runs only while !finished. Payment errors remain owned by Stripe's UI as requested; no duplicate application error panel was added.

A separately authorized manual Gmail SMTP test was accepted for aalva456@yahoo.com using an existing valid paid LOCAL test ticket, the production message builder and configured Gmail transport. It contained one CID QR attachment. No new charge, ticket/order change, recipient-snapshot change, or email-claim reset was performed. SMTP acceptance is verified; Yahoo inbox placement/rendering still needs the recipient's review. The test ticket links to http://localhost:3000, so it is not a production admission credential. Local GMAIL_USER and the 16-character App Password were present; TICKET_EMAIL_FROM plain text is now supported as the display name. A missing local SITE_URL was set to http://localhost:3000 in the ignored development environment file.

Production setup is documented in [go-live.md](go-live.md). No remote migration or deployment has been performed.
