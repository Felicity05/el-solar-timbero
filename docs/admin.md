# Admin V1

`/admin` is private organizer access. `/admin/events/new` creates an event; `/admin/events/[id]` edits configuration, duplicates as a draft, displays sales/attendance metrics and generates a door PIN. The event list shows Upcoming events in event-date order, nearest first. Ended/completed events are grouped under Past events, most recent event date first. An event still in progress stays in Upcoming events until its end time. Customer purchase, RSVP, QR, ticket pages and email fulfillment remain separate.

## Setup

1. Review the new migration `supabase/migrations/20261102221255_admin_v1_scheduling_and_door_pins.sql`. Test on local Supabase first. No production migration is applied by this feature's test scripts.
2. In your project's Supabase Auth dashboard create your own confirmed email/password user (locally use Supabase Studio). Use a strong password. There is no signup or password-management UI in this MVP; use the dashboard to manage this single user. Disable public Auth signups if they are not needed elsewhere.
3. Copy that user's UUID into server-only `ADMIN_USER_ID`. The local and production projects have different users/UUIDs.
4. Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to that project's public publishable key (`sb_publishable_...`). A legacy anon key in `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback. Never put a secret/service-role key in either public variable. Existing `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain required. The server-only URL override must refer to the same project.
5. Keep `SITE_URL` and a permanent random `CHECK_IN_SESSION_SECRET` (32+ characters, e.g. `openssl rand -hex 32`). Remove `CHECK_IN_PIN` and `CHECK_IN_EVENT_SLUG` **after** deploying this feature with its migration. Those variables are no longer read.
6. Sign in at `/admin`. Open the desired ticketed event and Generate PIN; save the new eight-digit PIN and share it privately with the restaurant. Show PIN retrieves the stored PIN after server-side owner authorization, including after refresh or navigation. The database keeps its scrypt verification hash and a separately encrypted copy; plaintext is not stored. Older hash-only PINs need one regeneration to enable retrieval. Existing events start without a PIN and require this step before door access works.

Supabase Auth verifies the user server-side with `getUser()`. Authorization compares its verified UUID to `ADMIN_USER_ID`, never to editable metadata or email. Every admin page/read/mutation verifies authorization. Auth cookies are HttpOnly, SameSite=Lax and Secure in production; the `/admin` proxy refreshes them. Sign-in attempts use the shared database rate limiter. Admin pages are dynamic, private/no-store and noindex. Service-role credentials remain server-only. New database functions are SECURITY DEFINER with an empty fixed search path and schema-qualified tables; only service_role can execute them. Browser roles and service_role still have no general event/table CRUD access. No staff/customer accounts or roles were added.

## Publication and scheduling

An eligible public event is published, has reached `publish_at`, and has not ended. Existing RSVP availability and ticket sales windows still apply independently. A scheduled event can be marked Published now, but will remain hidden and reject direct RSVP/payment initialization until publication. Time is evaluated by PostgreSQL on each dynamic request; no cron or redeploy is required. The homepage keeps selecting the next eligible event from existing discovery.

For ticketed events the database excludes overlapping `[publish_at, ends_at)` ranges among published events. This enforces only one public ticketed event at a time, including concurrent writes and future schedules. Schedule the next publication at or after the previous event's end. Back-to-back boundaries are allowed. Saving an overlapping event returns a controlled error; save as Draft or move publication. RSVP events are not subject to this ticketed-only exclusion.

Migration backfill sets publication to the earlier of creation/start and assigns consecutive windows to existing published ticketed events ordered by start/id. Later existing events therefore wait until earlier ones end. Review this visibility adjustment before applying to production. If existing actual event periods are nested such that a valid publication window cannot be assigned, the transaction fails safely; review/correct configuration rather than deleting data or weakening the constraint. No attendee, RSVP, payment, ticket, token, email state or check-in is rewritten. Existing migration files are unchanged.

New events default to the browser’s local timezone; existing/duplicated events retain their configured timezone. The timezone dropdown lists supported IANA zones. Start/end are time-only controls combined with the event date on the server; an end at or before the start means the next calendar day. Publication and sales windows retain date-and-time controls. All local values are interpreted in the selected IANA timezone by PostgreSQL. Nonexistent daylight-saving start/end/publication times are rejected. The existing online-sales cap remains **5 PM America/New_York on the event date**, with earlier sales deadlines/start-of-event restrictions preserved. Leaving sales end blank uses the existing database default/cap. Ticket price is stored as integer USD cents from an exact decimal parser. Existing orders keep their own price snapshots.

Duplicating copies only event/ticket-type configuration, assigns a fresh temporary draft slug (never the source slug), and always creates a draft with RSVP/sales closed. No PIN, attendees, orders, tickets, check-ins, payment IDs or email state is copied. Change dates, publication and sales windows before publishing the copy. New slugs are generated from event name/date server-side (with a unique suffix on collision); slugs remain read-only, but changing the event date regenerates the slug using the current name and new date. Name-only edits preserve the current slug. Admission mode cannot be changed after an order or RSVP exists.

## Door access and metrics

`get_active_door_event()` resolves the one currently published, released, unended ticketed event with a configured PIN. The browser cannot choose the event. PINs use independent random salts and scrypt hashes. Each request verifies a signed four-hour session bound to that event, PIN hash and permanent signing secret. Regeneration invalidates existing sessions; event changes also require a fresh PIN login. Existing pre-feature door sessions must sign in again. Scanning remains validation-only and the explicit Check In mutation retains its atomic locking. Ticket URLs/QR payloads and tokens do not change.

Tickets sold counts valid tickets attached to paid orders. Gross revenue sums paid order amounts (before fees); refunds/voids are excluded. Attendance counts those valid paid tickets with/without `checked_in_at`, with checked-in / tickets-sold as the rate (zero if none). RSVP events additionally show RSVP count. No attendee table, fee/net report or email metrics are included.

## Local verification

Use Node 24. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.

`node tests/local-admin.integration.mjs` runs all migrations in a disposable `el_solar_test_admin_*` database inside the named **local** Supabase Docker container. It verifies preservation of an existing paid ticket, metrics, configuration-only duplication, publication exclusion under concurrency, purchase/webhook/email-claim/check-in idempotency and restricted grants, then drops only its own database. It does not touch your normal local database or a remote project. Set `LOCAL_DOCKER_BIN` if Docker's binary path differs. Browser tests use loopback Auth/database fixtures, not production or real payments. With the local Auth public key configured, `node --env-file=.env.development.local tests/local-admin-auth.integration.mjs` separately verifies real local Supabase Auth/SSR cookies using a temporary fake user that is deleted afterward; it sends no email.

To manually use `/admin` against your normal local app, apply the reviewed migration **locally**, create a local Auth user, configure its UUID/public key, and restart the app. Existing local seed events remain usable; generate a PIN for the active ticketed event from Admin. This feature does not install local Auth users or credentials automatically.

Before production: back up; review migration/publication backfill and all pending migrations; apply only approved missing migrations to the intended project yourself; configure the production Auth user and env variables; deploy the reviewed code; generate the current door PIN; verify public event discovery, a test-mode preview purchase, ticket links/email and staff login. Preserve Stripe/Gmail settings. No production migration, deployment, push or merge is performed by the implementation.


## Changed files

- Pages/actions: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `src/app/admin/events/new/page.tsx`, `src/app/admin/events/[id]/page.tsx`.
- Admin presentation: `src/components/admin/LoginForm.tsx`, `src/components/admin/EventForm.tsx`, `src/components/admin/EventControls.tsx` (reuse existing form classes/brand tokens).
- Admin auth/data: `src/lib/admin/auth-config.ts`, `src/lib/admin/auth.ts`, `src/lib/admin/database.ts`, `src/lib/admin/events.ts`, `src/proxy.ts`.
- Door integration: `src/app/check-in/page.tsx`, `src/app/check-in/actions.ts`, `src/lib/check-in/security.ts`, `src/lib/check-in/server.ts`.
- Migration: `supabase/migrations/20261102221255_admin_v1_scheduling_and_door_pins.sql` (new only).
- Tests: `tests/admin-database.test.ts`, `tests/admin-validation.test.ts`, `tests/browser/admin.spec.ts`, `tests/check-in-security.test.ts`, `tests/local-admin.integration.mjs`, `tests/local-admin-auth.integration.mjs`, `tests/local-ticket.integration.mjs`, `tests/mock-admin.mjs`, `tests/mock-supabase.mjs`, `playwright.config.ts`.
- Configuration/docs: `.env.example`, `next.config.mjs`, `package.json`, `package-lock.json`, `docs/admin.md`, `docs/check-in.md`, `docs/database.md`, `docs/deployment.md`, `docs/go-live.md`.

Dependency added: `@supabase/ssr` 0.12.7 for supported server-side Auth/cookie handling. No existing direct dependency versions changed.


### Admin form follow-up

`20261104022303_admin_event_form_options.sql` adds one read-only, service-role-only options RPC for distinct existing gift-card disclaimer versions and ticket-type names. It changes no tables or attendee data. Apply it locally using `npx supabase migration up --local` before opening the updated event editor. Dropdowns retain the current event’s settings, including duplicated configuration; no-promotion and General Admission remain available. The PIN and form components now use distinct sibling keys (`pin-…` / `form-…`); previously both reused the event UUID and caused React’s duplicate-key warning.


### Rescheduling slugs

`20261104023402_admin_duplicate_draft_slug.sql` gives duplicated drafts fresh `draft-<random UUID>` identifiers rather than copying/deriving the source URL. The editor previews the name/date slug; saving assigns it. Changing an existing event’s date regenerates its slug, with collision handling enforced server-side. Event UUIDs and existing ticket tokens/QR URLs are unchanged. Old event-slug selection links may no longer resolve after rescheduling. The follow-up `20261104023710_admin_duplicate_publish_delay.sql` defaults a duplicated draft’s publication to two calendar days after the copy operation, at the same local hour/minute in the event’s timezone. It does not inherit the source publication date. The field remains editable; changing the event date does not reset it. Copies remain drafts until explicitly published, and existing publication overlap/end-time rules still apply.


## Production release checklist — Admin V1

The release review preserves the current manual UI edits. Commit all new admin files, tests, lockfile changes and **four** new migrations. Private environment files are gitignored.

1. Push the reviewed feature branch and open its PR to `main`. Wait for the CI checks and inspect the Vercel preview using staging/test credentials. Do not merge yet if `main` automatically deploys production.
2. Verify the production Supabase Auth user is confirmed, and that Vercel Production `ADMIN_USER_ID` refers to that production UUID. Keep the matching public Auth key and existing permanent door-session secret. Local Auth UUIDs differ. Variables already configured in Vercel will be read by the next build/deployment.
3. Confirm a production backup is available and verify the CLI is linked to the intended production project (project ref from Supabase settings). Run these yourself:

   ```sh
   npx supabase migration list --linked
   npx supabase db push --linked --skip-vault --dry-run
   ```

   Expected Admin migrations, in order (apply only those not already recorded):

   - `20261102221255_admin_v1_scheduling_and_door_pins.sql`
   - `20261104022303_admin_event_form_options.sql`
   - `20261104023402_admin_duplicate_draft_slug.sql`
   - `20261104023710_admin_duplicate_publish_delay.sql`

   Review any additional pending migration before proceeding. The first migration backfills publication windows; review the published ticketed events and their release times. No attendee/order/ticket/token data is rewritten. Do not run local seeds, reset the remote database, or repair history to hide mismatches.
4. Apply the reviewed missing migrations **before merging/deploying**:

   ```sh
   npx supabase db push --linked --skip-vault
   npx supabase migration list --linked
   ```

   `--skip-vault` avoids synchronizing unrelated Vault configuration. No remote migration was applied by the release review.
5. Merge the green PR when ready. Vercel should deploy the merged `main` commit with Node 24 and Production environment settings. Wait for Ready and verify the expected commit.
6. Sign in at the live `/admin`. Confirm the existing current event, its published/released state, sales window and price. Generate its PIN and share it privately with the restaurant. Existing events start without a database PIN; old door sessions must log in again. Remove obsolete `CHECK_IN_PIN` / `CHECK_IN_EVENT_SLUG` after confirming the new flow. Keep `CHECK_IN_SESSION_SECRET`.
7. Verify the public homepage and an existing ticket URL/QR, then validate a ticket from `/check-in` without admitting a real customer early. Check Stripe webhook delivery remains HTTP 200 at the existing canonical endpoint. No Stripe/Gmail reconfiguration is required by Admin V1. Use test-mode preview/staging for simulated card purchases; Stripe test cards cannot be used with production live keys.

A failed deployment can be rolled back to the previous Vercel code deployment. Keep the old door environment variables until verification so a code rollback remains possible. Do not undo paid-ticket data or migration history as a rollback step. If an event reschedule changed its slug, old event-selection links may no longer resolve, but ticket token/QR URLs continue using their existing credentials.

## Complimentary tickets, shared capacity and publication choices

New migration: `20261104195243_complimentary_tickets_and_event_capacity.sql`. Apply this reviewed migration locally before opening these controls. It adds `events.ticket_capacity` (NULL = unlimited), `orders.order_kind` (`stripe`/`complimentary`), the issuing admin UUID, and reservation timestamps. Existing orders default to Stripe; existing events remain unlimited. Existing paid orders, ticket tokens, QR payloads and historical records are preserved. No new provider, queue, customer account, payment method or broad table grants are introduced.

### Issue a complimentary ticket

Open a ticketed event in Admin and use **Issue complimentary ticket** with name, email and phone. Phone is normalized with the existing attendee validator and remains the matching key. The authenticated owner's UUID is bound server-side. A narrow transactional RPC locks the event, matches/creates the contact, checks capacity, creates one zero-dollar complimentary order and one normal ticket with the existing strong token/code format. No Stripe PaymentIntent or fake Stripe event is created. A repeated request returns the existing ticket and sends no additional normal email. Existing unpaid checkout attempts are never silently converted while they can still charge; they must be safely canceled/released first.

After the transaction commits, the same server-only Gmail integration sends the ticket and CID QR using its normal opaque ticket URL. The admin sees whether email delivery was confirmed and can open the ticket link if it was not. SMTP failure does not remove or invalidate the ticket. A durable atomic email claim prevents duplicate sends, including ambiguous failures; no automatic resend/worker is introduced. No additional email environment variables are needed.

Complimentary tickets are distinguishable from paid sales: amount is zero and `order_kind=complimentary`; paid sales and gross revenue exclude them, while attendance includes them. The existing order `paid` state is reused to mean a settled/issued admission, without fabricating a Stripe charge. Complimentary tickets show **Complimentary** rather than a purchase price. They use the existing ticket page, QR and staff check-in. Issuing a complimentary ticket does not manufacture a paid gift-card acknowledgment.

### Shared ticket limit

Set **Ticket limit (paid + complimentary)** in the event form; leave blank for unlimited. Issued orders and active unpaid reservations share the limit. The database serializes allocations with the event row lock before contact/order locks; one contact/event still has at most one order and ticket. The limit cannot be reduced below issued tickets plus outstanding reservations. Copies inherit the limit, never the used inventory.

For limited events, a checkout reserves one place for 15 minutes. Editing attendee details does not restart its timer. Pending-order reuse is preserved. The customer sees the deadline and is checked server-side before confirmation; expiry returns them to a retryable payment state. The owner of the last reserved place can still pay even though discovery reports no places for other buyers.

Expiry alone never frees capacity. On subsequent discovery/initialization/admin issuance requests, the Next.js server processes a bounded batch of expired reservations. It verifies Stripe association, cancels the old unpaid PaymentIntent, and only after Stripe confirms cancellation performs a guarded database release/attempt rotation. Succeeded or processing payments retain their place for webhook fulfillment. An old canceled attempt cannot charge later, attach to a newer attempt, or create an extra ticket. Failed Stripe cancellation leaves inventory held. There is no background worker/cron: expired places are reclaimed on subsequent requests.

If an unlinked PaymentIntent creation is ambiguous and older than Stripe's safe idempotency window (23-hour guard), the place stays held and logs a safe `reservation.cleanup` reference for manual reconciliation. Do not free it blindly or extend API-key privileges to work around that safeguard. When initially enabling a limit, existing pending orders count and receive a 15-minute reservation on a successful save; resolve existing claims before choosing a lower limit. Unlimited events retain the previous purchase behavior.

A full event remains visible with a sold-out state, without a new order/PaymentIntent or a promise of admission at the door. Reclaimed reservations can reopen availability. Public purchase prices remain database-authoritative and card-only.

### Scheduled versus Published

The selector now offers **Draft**, **Scheduled**, **Published**, **Cancelled**, **Completed**. Scheduled requires a future publication time and a valid active ticket type for ticketed events. Published means its release time has arrived; selecting Published sets the editable publication field to the current local time. Server validation rejects a future time submitted as Published, or a past time submitted as Scheduled.

The existing database convention remains `status=published` plus `publish_at`: Scheduled is the future-release state, and becomes Published automatically when `publish_at` arrives. The admin selector derives that distinction from the timestamp; public submission/discovery gates remain database-authoritative, so no timer or cron job is needed and existing RPCs remain compatible. The single-ticketed-publication-window exclusion still applies. A released event whose sales start is later is visible with **Ticket sales open soon** rather than disappearing. Refresh an already-open page to see time-based state changes.

### Verification and deployment

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`. `node tests/local-capacity.integration.mjs` additionally creates a disposable local PostgreSQL database and tests simultaneous paid/free allocation, cancellation release, duplicate webhook fulfillment, email claims and check-in; it never sends real mail or touches a remote database. `node tests/local-admin.integration.mjs` covers preservation and previous concurrency behavior.

After review, apply only the new missing migration before deploying the matching code. No Stripe/Gmail credential or restricted-key resource permissions change: existing PaymentIntent create/retrieve/cancel capabilities suffice. Capacity defaults to unlimited until explicitly set per event. No production changes, push, merge or deployment are performed during local implementation.


## Complimentary form recovery, recipient list and persistent Show PIN

`20261105223701_admin_pin_retrieval_and_complimentary_list.sql` adds encrypted PIN storage and narrow server-only read/write capabilities. It does not rewrite existing PIN hashes, orders, tickets, contacts or email state. No applied migration is modified.

The complimentary form clears name/email/phone only after a new ticket is successfully created, including when email delivery is unconfirmed but the ticket remains valid. Empty/in-flight forms cannot submit. Validation errors retain their inputs. The event page now lists only its complimentary recipients, newest first, using issuance snapshots: name, email, phone, ticket code, ticket status, email delivery state, check-in time (in the event timezone; “Not checked in” until used) and issuance time. Viewing or refreshing the list never sends email. Paid attendee data and ticket tokens are not returned by this list.

Admin Show PIN works after leaving and returning to an event. Generation/regeneration saves the scrypt hash and an encrypted copy atomically. Encryption uses AES-256-GCM, a fresh random nonce and event UUID as authenticated context. HKDF derives a dedicated encryption key from the existing server-only `CHECK_IN_SESSION_SECRET` with purpose separation. No new environment variable, plaintext database field, cookie or browser storage is introduced. Normal event list/detail responses omit both the hash and ciphertext. Only an authenticated owner action can retrieve/decrypt the PIN; anon/authenticated database roles cannot execute the RPCs. The server also verifies the decrypted PIN against its stored hash before returning it. See the [Node 24 crypto reference](https://nodejs.org/download/release/v24.21.0/docs/api/crypto.html) for the native authenticated encryption APIs used.

Keep `CHECK_IN_SESSION_SECRET` stable across deployments. Rotating it invalidates door sessions and prevents decrypting PINs saved under the old value; regenerate those PINs with the new secret if rotation is intentional. Existing hash-only PINs are still valid for staff but cannot be recovered; regenerate once to enable Show PIN. Regeneration changes the staff PIN/session; revealing it does not. Duplicates inherit no PIN/hash/ciphertext.

Apply the new migration locally before testing these controls. Production remains a separate reviewed migration/deployment step. Tests cover form clearing/empty-submit prevention, recipient persistence without duplicate emails, encrypted round-trip/tampering/wrong-event protection, legacy PIN behavior, restricted RPC grants, private event-read redaction and unauthenticated reveal-request rejection.

Admin **Open ticket** uses a relative `/tickets/{token}` link so it opens on the current application origin, including local development. Email links and QR payloads still use `SITE_URL`; its scheme/host must match the server reachable by recipients. Migration `20261105231404_complimentary_ticket_check_in_column.sql` only extends the restricted recipient-read RPC with the existing `tickets.checked_in_at` value; it changes no ticket or check-in data.
