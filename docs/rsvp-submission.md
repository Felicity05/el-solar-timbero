# Normalized RSVP implementation

Implemented on the normalization branch; no remote migration, merge or deployment is performed. The existing normalization migration is already applied and is not rewritten. The follow-up migration is `20261019203757_normalized_rsvp_submission.sql`.

## Database changes and security

- Add nullable `events.gift_card_disclaimer_version`; backfill only the October event with `2026-10-12-v1`. No existing RSVP is updated.
- `public.submit_normalized_rsvp(text,text,text,text,text,boolean,text)` is the single transactional write RPC. It is SECURITY DEFINER, owned by postgres, with an empty fixed search path and qualified relations. No roles, membership hierarchy or wrapper functions are added.
- `public.get_rsvp_event(text)` is a separate read-only SECURITY DEFINER RPC returning only event presentation/availability fields. It exposes no attendee data.
- Both RPCs revoke execution from PUBLIC, anon and authenticated, granting execution only to service_role. Direct SELECT/INSERT/UPDATE/DELETE on contacts/events/RSVPs stays revoked even from service_role. RLS stays enabled. Existing limiter access is unchanged.
- The server-only Supabase client holds the service key; nothing sends it to the browser. Only the Next.js action accepts public attendee submissions, preserving rate limiting and honeypot validation. Never expose a service key in a client environment variable.

## Configuration and flow

Set server-only `RSVP_ENABLED=true` and an explicit `RSVP_EVENT_SLUG`. Missing settings fail closed. The page and action load safe event context using the read RPC. The UI renders current event name/date/time/venue and displays the checkbox only for a supported promotion. No browser input selects the event or contact.

The action normalizes name whitespace, lowercase email and country-aware E.164 phone, validates referral/acknowledgment, and calls the write RPC once. Unknown disclosure versions fail closed. The displayed version is compared to current event configuration so a changed notice requires reload. Non-promotion events store null/null even if browser metadata is forged.

The RPC locks the event FOR SHARE and verifies published/open/future eligibility with clock_timestamp after the lock. Shared locks allow concurrent registrations while blocking closure/configuration updates until registrations complete. It inserts a contact ON CONFLICT(phone) DO NOTHING and then locks the resolved contact FOR UPDATE. Concurrent requests converge on one contact without overwriting the conflict winner's profile.

While holding the contact lock it checks the contact/event RSVP. Duplicates return without updating profile or history. Otherwise it inserts current submitted snapshots and matching legacy columns, then updates current contact name/email. Unique(contact_id,event_id) remains the final safeguard; the legacy unique(event_slug,phone) stays through the rollback window. Unexpected errors roll back the full RPC. The UI receives controlled results, never database messages. Timeouts/retries may encounter a duplicate if a prior commit succeeded; they cannot create another RSVP.

Results: success, duplicate, closed, invalid_event, invalid_input, unsupported_disclaimer, acknowledgment_required. Only success and duplicate switch to the corresponding result UI; other results produce safe errors. Phone matching does not verify ownership.

## Local-only development

The running stack is explicitly `supabase_db_el-solar-timbero`, PostgreSQL 17, with API at `http://127.0.0.1:54321`. The new SQL was applied to that container for development. No remote command or linked db push is used. Docker executable on this Mac: `/Applications/Docker.app/Contents/Resources/bin/docker`.

The default `supabase/seed.sql` deliberately contains no inserts. `supabase/seed.local.sql` has an explicit session guard requiring `app.local_seed=true` and contains only `LOCAL DEV — RSVP Test Event` at slug `dev-rsvp-test-2026-12-31`, published/open with no promotion. It is not in a migration and is not automatically seeded anywhere. Execute it only with an explicitly local connection and the session opt-in; the opt-in is a misuse guard, not a guarantee if someone intentionally runs it remotely. Set the app's local URL/key and local event slug to use it. The fixture closes naturally after its December 31, 2026 start; refresh local seed dates when necessary.

Local database development used psql inside the named container because this working tree has no `supabase/config.toml`, despite its running stack. The follow-up SQL was executed directly for development and, after verification, recorded with its SQL in LOCAL migration history so subsequent CLI migration runs do not reapply it. Production application is a separate user-controlled review step.

## Verification

- `npm test`: embedded migration/security checks and application validation/result mapping.
- `node tests/local-rsvp.integration.mjs`: LOCAL Docker PostgreSQL checks for new/reused contacts, duplicate immutability, profile/snapshot history, promotion rules, closed/completed/missing events, eight independent concurrent sessions, error rollback and permissions. It snapshots the historical October rows' count/checksum before/after and cleans only its synthetic fixtures.
- `node tests/local-rsvp.browser.mjs`: production Next server + real local PostgREST + Chrome; verifies form event selection/no promotion, successful Server Action submission, duplicate UI and closure after form rendering. The existing local Kong service token is read into memory and never printed. A preflight verifies the local API before the browser starts. Uses Chrome at the standard Mac path unless overridden with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
- `npm run lint`, `npm run typecheck`, `npm run build`.

Integration scripts target only a fixed local Docker container; they never accept a remote project URL. LOCAL_DOCKER_BIN can select another Docker executable. Both scripts require Docker access, use reserved synthetic numbers, fail if those contacts already exist and remove their fixtures afterward. Do not run them in parallel with each other or with schema maintenance.

Remaining launch steps: user review of migration/function and code, manual application of the new migration in the intended environment, then deployment/configuration only when authorized. No Stripe, payments or ticket tables are included.


Verification outcome: 38 automated tests passed; all 10 local PostgreSQL integration checks passed, including eight concurrent independent sessions; all three production-browser checks passed. Lint, typecheck and production build passed. The sandboxed build initially failed to resolve Google Fonts; the approved build with network access succeeded. The final build explicitly used a local public API URL and the browser harness supplies private SUPABASE_URL at runtime. Rebuild with the intended production environment before any later authorized deployment. Runtime is aligned to Node.js 24.x LTS: package.json and lockfile declare 24.x, .nvmrc selects 24, both CI jobs read .nvmrc, and Vercel follows the package engine setting. Verification runs on local Node.js v24.21.0.
