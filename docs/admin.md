# Admin V1

`/admin` is private organizer access. `/admin/events/new` creates an event; `/admin/events/[id]` edits configuration, duplicates as a draft, displays sales/attendance metrics and generates a door PIN. The event list shows Upcoming events in event-date order, nearest first. Ended/completed events are grouped under Past events, most recent event date first. An event still in progress stays in Upcoming events until its end time. Customer purchase, RSVP, QR, ticket pages and email fulfillment remain separate.

## Setup

1. Review the new migration `supabase/migrations/20261102221255_admin_v1_scheduling_and_door_pins.sql`. Test on local Supabase first. No production migration is applied by this feature's test scripts.
2. In your project's Supabase Auth dashboard create your own confirmed email/password user (locally use Supabase Studio). Use a strong password. There is no signup or password-management UI in this MVP; use the dashboard to manage this single user. Disable public Auth signups if they are not needed elsewhere.
3. Copy that user's UUID into server-only `ADMIN_USER_ID`. The local and production projects have different users/UUIDs.
4. Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to that project's public publishable key (`sb_publishable_...`). A legacy anon key in `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback. Never put a secret/service-role key in either public variable. Existing `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain required. The server-only URL override must refer to the same project.
5. Keep `SITE_URL` and a permanent random `CHECK_IN_SESSION_SECRET` (32+ characters, e.g. `openssl rand -hex 32`). Remove `CHECK_IN_PIN` and `CHECK_IN_EVENT_SLUG` **after** deploying this feature with its migration. Those variables are no longer read.
6. Sign in at `/admin`. Open the desired ticketed event and Generate PIN; save the new eight-digit PIN and share it privately with the restaurant. Hide PIN / Show PIN can toggle the generated PIN while this page remains open. It stays only in component memory; refreshing or leaving clears it and the hash cannot recover it. Regenerate if it is lost. Existing events start without a PIN and require this step before door access works.

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
