# Normalization migration review and application

Migration: [20261019160523_normalize_recurring_events.sql](../supabase/migrations/20261019160523_normalize_recurring_events.sql).

Historical backfill runbook: the owner has now applied the normalization migration successfully. The new RPC/application implementation is described in [rsvp-submission.md](rsvp-submission.md) and has been tested only locally. Automated verification uses disposable, embedded PGlite PostgreSQL instances containing synthetic records, without connecting to the linked project.

## Application boundary

This is a closed-registration schema/backfill step, not the recurring-event application launch. It expands the existing `public.rsvps` table in place, retains every legacy column and check/unique constraint, and adds required foreign keys and submission snapshots. The only relaxed legacy requirements are NOT NULL on the two promotion-specific disclaimer fields. It never drops or replaces the RSVP table.

**Keep registration closed before, during, and after application.** This migration revokes the service role's existing RSVP INSERT privilege and grants it no access to contacts/events. The old Server Action does not supply the new required fields and must not be reopened. A separate reviewed migration and application change must implement the atomic normalized write operation and grant only the privileges it needs. Do not restore direct writes merely to make the old action work.

The private rate-limit table, limiter function, and their existing permissions are unchanged. Owner/dashboard access remains available; there are no new browser policies or public table grants. RLS is enabled on all three application tables, and default Supabase table grants are explicitly revoked.

## Promotion-specific disclaimer

The migration drops NOT NULL on `gift_card_disclaimer_accepted` and `disclaimer_version`, retaining their existing true-only and version-format checks and adding `rsvps_disclaimer_pair_check`. Allowed values are null/null for an event without the promotion, or true plus a valid non-null version when acknowledged. Partial pairs and false are rejected. Neither field gains a default. No historical field value is updated: the October 12 preflight remains strict and the original values are included in before/after verification. There is no new generic consent system.

Event applicability must come from trusted event-specific server configuration in the normalized operation; the pair check alone does not enforce which events require acknowledgment. Current October-only form validation must be changed before reopening future events. A non-promotion event stores null/null regardless of forged browser disclaimer fields.

## Required normalized submission operation

Implement immediately after this migration, before reopening registration, in a separately reviewed application/privilege change. It is not implemented or granted execution by this backfill migration.

1. Discover eligible events from the database through the server-only discovery RPC. Default to the next upcoming event, allow navigation among available occurrences, and bind each form to its server-resolved slug. Never use a client form field as event authorization; revalidate the bound event and promotion configuration/version at submission. See rsvp-submission.md for the discovery follow-up migration.
2. Preserve validation, honeypot and rate-limit protection. Normalize phone using the current country-aware parser to E.164; trim/lowercase email and validate name/referral. For promotion events require explicit acknowledgment and supply the trusted version; otherwise supply null/null. Never infer consent from truthy input.
3. Call one transactional database operation, not a sequence of separate Supabase REST writes. Revalidate database-facing input there. Lock the event row with a lock that conflicts with closure updates, then verify `status = published`, `rsvp_open = true`, and submission before `starts_at` using the actual current time after locking. Hold the lock until completion so closure and registration have a defined order.
4. Resolve/create the contact by its unique normalized phone. Handle concurrent creation with the unique constraint and retry/select the committed winner as needed; do not overwrite an existing profile in the creation-conflict branch. Lock the resolved contact row before checking duplicates or updating the profile. Use consistent event-then-contact lock ordering across callers; retry serialization/deadlock failures as a whole transaction when appropriate.
5. Check for the contact/event RSVP while holding the contact lock. If it exists, return duplicate without changing its snapshots or the contact profile. Serialize concurrent registrations for the same contact so two requests cannot both take a stale no-RSVP path.
6. Insert exactly one RSVP with original submitted name/email/phone snapshots, referral, and applicable disclaimer pair. While legacy columns remain, populate `event_slug` from the resolved event and legacy name/email/phone from the same normalized submission. Let the database assign ID and submission time.
7. Update the current contact name/email only for a successful new RSVP, in the same transaction. Do not change the matching phone automatically. Leave older snapshots untouched. Concurrent successful registrations at different events serialize profile updates; the last applied update wins.
8. Enforce `rsvps_contact_event_key UNIQUE(contact_id, event_id)` as the final concurrency safeguard. Handle that specific conflict as duplicate with no surviving profile changes. A legacy event/phone conflict requires checking that it maps to the same intended registration, rather than masking inconsistent legacy data. All other failures roll back contact creation/profile edits and RSVP insertion together. Never catch an insertion error and accidentally commit earlier profile changes.
9. Return only safe success/duplicate/closed/validation/error results, without saved contact information. Phone matching does not authenticate ownership or grant account/payment access.

Design a narrowly scoped server-executable operation with an explicitly reviewed execution role/function privilege model. Deny browser execution and keep direct table grants revoked; do not grant service_role broad access merely to revive the old action. Any privileged function must have a fixed safe search path, constrained input/output, and explicit execution grants. RLS bypass alone supplies no missing table privileges. The approved follow-up implementation uses directly callable, service-role-only SECURITY DEFINER functions owned by postgres, with no dedicated role or wrapper. See the follow-up guide for details.

The legacy `rsvps_event_phone_key UNIQUE(event_slug, phone)` remains intentionally alongside normalized uniqueness. Keep it for the rollback window, with consistent legacy-column writes as above; remove it and redundant legacy columns only in a separate cleanup migration after the normalized writer is verified. Keep snapshots and normalized pair uniqueness. App rollback alone cannot reopen writes.

## Sequence

1. Confirm production backup/restoration and rehearse on an isolated restored copy. Confirm applied migration history matches the two preceding repository migrations and inspect any live schema or permission drift. No production inspection was performed while generating this file.
2. Confirm deployed registration is closed and no other process is writing RSVPs. Save aggregate baseline counts using the queries below. Review and confirm the seed metadata: October 12, 2026, 8–11:30 PM, America/New_York; Guantanamera, 939 8th Ave, New York, NY 10019. The required `event_date` is the date-only value `2026-10-12`; the start instant is October 13 in UTC but October 12 locally. Seed status is `completed` and registration is closed. The event name is `El Solar Timbero — Cuban Night Social`; description is absent. October 26 is only a display-format example and does not change the existing event.
3. Review the CLI's pending migration list/dry run and ensure only intended migrations will run. Apply manually using the Supabase CLI against the explicitly verified project. This document does not execute any application command.
4. Within one transaction the migration takes an exclusive RSVP table lock, captures a temporary private copy of all legacy columns, and checks dirty data, duplicate phone/event pairs, unknown slugs, and unexpected RSVP policies. No guessing or cleanup occurs.
5. Create contacts/events with constraints and RLS, seed the confirmed event, and create one contact per canonical phone. Add and populate RSVP relationships and snapshots without changing original columns.
6. Enforce required relationships/snapshots, restrictive foreign keys, pair uniqueness, and indexes. Allow nullable disclaimer pairs for future non-promotion RSVPs without changing legacy values. Verify counts, original values in both directions, snapshot equality, mappings, and canonical contact selection before commit. Any failure aborts the transaction. A successful run emits a count notice, although CLI output may suppress notices.
7. Run the postflight queries below as the owner. Keep registration closed until the separately reviewed application cutover is deployed and tested.

## Duplicate and dirty-data handling

- Exact matching normalized phones resolve to one contact, with the latest original RSVP's name/email selected by `created_at DESC, id DESC`. The UUID order is only a deterministic tie-breaker. Each RSVP retains its original details and timestamp.
- Same phone across different, confirmed events is compatible with the model. This migration knows only the existing October event; other slugs cause an explicit abort until their metadata is confirmed and added to the reviewed migration. It never invents events or silently ignores their RSVPs.
- Same phone and same event in two legacy rows cannot satisfy the approved uniqueness rule. The migration aborts and retains both rows; owner review is required. It does not delete, arbitrarily pick a winner, or collapse RSVP history.
- Non-E.164 phones, untrimmed names, non-normalized emails, missing values, or invalid disclosure/referral fields cause an abort. SQL does not attempt country-aware phone parsing, infer ownership, or rewrite source values. Existing canonical formatting is checked, not re-derived.
- Two different phones may share an email and remain separate contacts. No email uniqueness or automatic email-based merging is introduced.
- Existing target objects or conflicting column/function names fail rather than being silently reused. This is a one-shot versioned migration, not an idempotent repair script.

New contact and event timestamps record creation of the new records. Every original RSVP ID and `created_at` is retained exactly. No historical contact-edit timestamps or separate consent-acceptance timestamps are invented.

## Counts and value verification

Run before application as the database owner and save the aggregate output with the backup reference:

```sql
select count(*) as rsvp_rows,
       count(distinct id) as distinct_rsvp_ids,
       count(distinct phone) as expected_contacts,
       count(distinct event_slug) as legacy_event_slugs,
       min(created_at) as first_submission,
       max(created_at) as last_submission
from public.rsvps;

select event_slug, count(*) as rsvp_rows
from public.rsvps group by event_slug order by event_slug;

select count(*) as duplicate_phone_event_groups
from (
  select event_slug, phone from public.rsvps
  group by event_slug, phone having count(*) > 1
) duplicates;
```

The migration captures its own baseline after acquiring the lock, so concurrent writes cannot slip between its snapshot and comparison. It verifies the original nine-column row set with bidirectional `EXCEPT`, not counts alone or a lossy checksum. It additionally checks every snapshot, contact/event mapping, and canonical profile selection; all assertions precede commit. The temporary copy is dropped on commit and is not a replacement for a durable pre-migration backup.

Run after application, before enabling any new writer:

```sql
select (select count(*) from public.rsvps) as rsvp_rows,
       (select count(*) from public.contacts) as contacts,
       (select count(*) from public.events) as events;

select count(*) as invalid_mappings_or_snapshots
from public.rsvps r
left join public.contacts c on c.id = r.contact_id
left join public.events e on e.id = r.event_id
where c.id is null or e.id is null
   or c.phone is distinct from r.phone
   or e.slug is distinct from r.event_slug
   or row(r.submitted_name, r.submitted_email, r.submitted_phone)
      is distinct from row(r.name, r.email, r.phone);

select e.slug, count(r.id) as rsvp_rows
from public.events e left join public.rsvps r on r.event_id = e.id
group by e.slug order by e.slug;

select relname, relrowsecurity
from pg_class
where oid in ('public.contacts'::regclass, 'public.events'::regclass, 'public.rsvps'::regclass);

select role_name, table_name,
       has_table_privilege(role_name, table_name, 'SELECT') as can_select,
       has_table_privilege(role_name, table_name, 'INSERT') as can_insert,
       has_table_privilege(role_name, table_name, 'UPDATE') as can_update,
       has_table_privilege(role_name, table_name, 'DELETE') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
cross join (values ('public.contacts'), ('public.events'), ('public.rsvps')) tables(table_name);
```

Expected: RSVP count equals baseline, contact count equals baseline distinct canonical phones, one seeded event, zero mapping/snapshot mismatches, matching per-event counts, all RLS flags true, and all displayed role privileges false. These mapping comparisons are a cutover check, not an ongoing invariant after reviewed phone corrections or legacy-column retirement.

Also verify the event's local calendar date, independent of the session timezone:

```sql
select slug, name, event_date, starts_at, ends_at, timezone,
       event_date = (starts_at at time zone timezone)::date as local_date_matches
from public.events order by event_date, starts_at;
```

The seeded date must be `2026-10-12` and `local_date_matches` must be true. `event_date` is a required PostgreSQL `date`, with a finite-date check, local-start-date consistency check, and a non-unique index for date lookups. Names and dates can repeat; UUIDs and unique slugs identify individual events. Display `2026-10-26` as **October 26, 2026** in the application. For an overnight event, the date is the local start date. Updates that change the local start day must supply the matching date in the same statement. No production UI or submission-flow changes are included here.

## Rollback risks and limits

- Before commit, any data, DDL, lock-timeout, or verification failure rolls back the entire migration. The five-second lock timeout avoids waiting indefinitely; each statement has a two-minute timeout. Rehearse with realistic volume and adjust reviewed limits if necessary.
- The exclusive table lock blocks readers and writers; backfill, temporary copying, and index creation consume storage and WAL. This is intended for the existing MVP during a maintenance window, not an online zero-downtime migration.
- After commit, rolling back the app alone does not restore submissions. The schema has required new columns and the old INSERT permission is revoked. Retained legacy data supports a reviewed reverse change while submissions remain closed; no destructive down migration is supplied.
- Before new writes, a reviewed reverse migration can remove the new constraints/columns/tables and restore precisely the previous grants. After normalized writes begin, reversal requires reconciliation and export of all newer data first. Never delete new contacts/events or restore an old backup over fresh writes blindly.
- Do not edit migration-history entries to simulate rollback. Capture the outcome, inspect live state after connection loss, and reconcile CLI history with actual committed schema before retrying.
- The old `rsvps_event_phone_key` and required legacy columns remain intentionally. The future normalized writer must populate those columns consistently while they remain, or a separate reviewed cutover must retire them after the rollback window. New snapshots must survive any cleanup.

## Verification coverage

Disclaimer tests verify that a future non-promotion RSVP accepts null/null while October's true/version pair remains unchanged; partial pairs, false, blank versions and untrimmed versions are rejected. They also check nullable metadata without defaults, retention of both unique constraints, actual denied service-role insertion, and rollback when an October legacy row is missing its historical acknowledgment. Applicability enforcement and transactional/concurrency behavior are covered by the follow-up local PostgreSQL integration tests; see rsvp-submission.md.

`tests/rsvp-normalization.test.ts` exercises successful backfill and exact value preservation, empty source data, shared emails, snapshot retention after profile edits, uniqueness, restrictive foreign keys, timezone/status validation, RLS and revoked default grants, plus full rollback for dirty phones, duplicate registrations, unknown slugs, and pre-existing target objects. Event-date tests cover the original seed date, required/finite dates, mismatches on insert/update, repeated event names/dates, rescheduling, overnight events, and consistency across session timezones and daylight-saving transitions. These embedded tests do not certify hosted project drift, owner role configuration, realistic lock duration, or multi-connection concurrency. Rehearse those on the restored project before production application.

References: [Supabase migration CLI](https://supabase.com/docs/reference/cli/supabase-migration-new) and [Supabase RLS and service-role behavior](https://supabase.com/docs/guides/database/postgres/row-level-security).
