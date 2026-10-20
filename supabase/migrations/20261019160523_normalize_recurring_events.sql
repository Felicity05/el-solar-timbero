-- REVIEW ONLY: apply manually during a closed-registration maintenance window.
-- In-place expansion: no legacy table, column, row, ID or timestamp is removed.
-- This intentionally disables service_role table writes until the separately
-- reviewed normalized submission operation is deployed. Do not reopen the old app.
-- One-shot migration; unexpected objects/data cause failure, not silent reuse.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Prevent writes/schema changes between snapshot, backfill and verification.
-- ACCESS EXCLUSIVE also blocks reads: rehearse duration on a restored copy.
lock table public.rsvps in access exclusive mode;

create temporary table normalization_rsvp_before on commit drop as
select id, event_slug, name, email, phone, referral_source,
       gift_card_disclaimer_accepted, disclaimer_version, created_at
from public.rsvps;
revoke all on normalization_rsvp_before from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from public.rsvps where
    id is null or created_at is null or
    phone is null or phone !~ '^\+[1-9][0-9]{1,14}$' or
    name is null or char_length(name) not between 1 and 100 or name <> btrim(name) or
    email is null or char_length(email) not between 3 and 254 or
    email <> lower(btrim(email)) or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
    event_slug is null or char_length(event_slug) not between 1 and 120 or
    event_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or
    referral_source is null or referral_source not in (
      'Instagram', 'WhatsApp', 'Friend / Word of mouth',
      'Guantanamera', 'Dance class / studio', 'Other') or
    gift_card_disclaimer_accepted is distinct from true or
    disclaimer_version is null or char_length(disclaimer_version) not between 1 and 100 or
    disclaimer_version <> btrim(disclaimer_version)
  ) then
    raise exception 'Normalization aborted: invalid legacy fields. Review privately; no automatic cleanup or deletion is performed.';
  end if;
  if exists (select 1 from public.rsvps group by event_slug, phone having count(*) > 1) then
    raise exception 'Normalization aborted: duplicate phone/event pairs require owner review; all RSVP history must be retained.';
  end if;
  if exists (select 1 from public.rsvps where event_slug <> 'cuban-night-social-2026-10-12') then
    raise exception 'Normalization aborted: unknown event slug. Add confirmed event metadata and extend the reviewed migration before retrying.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rsvps') then
    raise exception 'Normalization aborted: unexpected RSVP policies; review production security drift.';
  end if;
end;
$$;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100 and name = btrim(name)),
  email text not null check (
    char_length(email) between 3 and 254 and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  phone text not null check (phone ~ '^\+[1-9][0-9]{1,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_phone_key unique (phone),
  constraint contacts_timestamp_order check (updated_at >= created_at)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  name text not null check (name = btrim(name) and char_length(name) > 0),
  event_date date not null check (isfinite(event_date)),
  description text check (description = btrim(description) and char_length(description) > 0),
  venue_name text not null check (venue_name = btrim(venue_name) and char_length(venue_name) > 0),
  venue_address text not null check (venue_address = btrim(venue_address) and char_length(venue_address) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  timezone text not null check (timezone = btrim(timezone) and char_length(timezone) > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  rsvp_open boolean not null default false check (not rsvp_open or status = 'published'),
  created_at timestamptz not null default now(),
  constraint events_local_date_check check (
    event_date = (starts_at at time zone timezone)::date
  )
);
create index events_event_date_idx on public.events (event_date);
comment on column public.events.event_date is
  'Local calendar date on which the event starts, in its IANA timezone. Format as Month day, year in the presentation layer.';

alter table public.contacts enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
-- Override Supabase default privileges. No browser policies, broad grants or
-- SECURITY DEFINER functions are introduced. Dashboard/owner access remains.
revoke all on public.contacts, public.events, public.rsvps
  from public, anon, authenticated, service_role;

-- No promotion: both values NULL. Promotion acknowledged: true + valid version.
-- Keep existing true-only/version-format checks; PostgreSQL permits NULL through
-- those checks. No defaults or historical value updates are introduced.
alter table public.rsvps
  alter column gift_card_disclaimer_accepted drop not null,
  alter column disclaimer_version drop not null,
  add constraint rsvps_disclaimer_pair_check check (
    (
      gift_card_disclaimer_accepted is null
      and disclaimer_version is null
    )
    or
    (
      gift_card_disclaimer_accepted is true
      and disclaimer_version is not null
    )
  );

create function public.maintain_contact_timestamps()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.created_at := old.created_at;
  if row(new.name, new.email, new.phone) is distinct from row(old.name, old.email, old.phone) then
    new.updated_at := greatest(clock_timestamp(), old.updated_at, old.created_at);
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.maintain_contact_timestamps() from public, anon, authenticated, service_role;
create trigger contacts_maintain_timestamps before update on public.contacts
for each row execute function public.maintain_contact_timestamps();

create function public.validate_event_timezone()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unsupported event timezone' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_event_timezone() from public, anon, authenticated, service_role;
create trigger events_validate_timezone before insert or update of timezone on public.events
for each row execute function public.validate_event_timezone();

-- Source: README and EventDetails.tsx. October 12 is EDT (UTC-04).
insert into public.events (
  slug, name, event_date, venue_name, venue_address, starts_at, ends_at, timezone, status, rsvp_open
) values (
  'cuban-night-social-2026-10-12', 'El Solar Timbero — Cuban Night Social',
  date '2026-10-12',
  'Guantanamera', '939 8th Ave, New York, NY 10019',
  '2026-10-12 20:00:00-04', '2026-10-12 23:30:00-04',
  'America/New_York', 'completed', false
);

-- Exact canonical phones only: SQL does not guess country codes or strip digits.
-- Latest original submission wins; UUID descending breaks timestamp ties.
-- Contact timestamps describe creation of these new records, not past edits.
insert into public.contacts (name, email, phone)
select distinct on (phone) name, email, phone
from public.rsvps order by phone, created_at desc, id desc;

alter table public.rsvps
  add column contact_id uuid,
  add column event_id uuid,
  add column submitted_name text,
  add column submitted_email text,
  add column submitted_phone text;

update public.rsvps r set
  contact_id = c.id, event_id = e.id,
  submitted_name = r.name, submitted_email = r.email, submitted_phone = r.phone
from public.contacts c, public.events e
where c.phone = r.phone and e.slug = r.event_slug;

alter table public.rsvps
  alter column contact_id set not null,
  alter column event_id set not null,
  alter column submitted_name set not null,
  alter column submitted_email set not null,
  alter column submitted_phone set not null,
  add constraint rsvps_contact_id_fkey foreign key (contact_id)
    references public.contacts(id) on update restrict on delete restrict,
  add constraint rsvps_event_id_fkey foreign key (event_id)
    references public.events(id) on update restrict on delete restrict,
  add constraint rsvps_contact_event_key unique (contact_id, event_id),
  add constraint rsvps_submitted_name_check check (
    char_length(submitted_name) between 1 and 100 and submitted_name = btrim(submitted_name)
  ),
  add constraint rsvps_submitted_email_check check (
    char_length(submitted_email) between 3 and 254 and submitted_email = lower(btrim(submitted_email))
    and submitted_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  add constraint rsvps_submitted_phone_check check (submitted_phone ~ '^\+[1-9][0-9]{1,14}$');
create index rsvps_event_created_at_idx on public.rsvps (event_id, created_at);
-- Retain rsvps_event_phone_key UNIQUE(event_slug, phone) for the rollback window.
-- The future writer must fill legacy columns consistently with links/snapshots.
-- Remove redundant legacy columns/constraint only in a reviewed cleanup migration.

comment on table public.rsvps is
  'One RSVP per contact/event. Submitted fields are immutable history; legacy fields retained for verified cutover and rollback.';
comment on table public.contacts is
  'Current profile, one per canonical phone. Matching does not verify phone ownership.';

-- Verification occurs before COMMIT while the original table remains locked.
-- Compare sets in BOTH directions, not just counts or lossy hashes.
do $$
declare
  before_count bigint;
  after_count bigint;
  expected_contacts bigint;
begin
  select count(*) into before_count from normalization_rsvp_before;
  select count(*) into after_count from public.rsvps;
  select count(distinct phone) into expected_contacts from normalization_rsvp_before;
  if before_count <> after_count or expected_contacts <> (select count(*) from public.contacts) then
    raise exception 'Normalization verification failed: row counts differ';
  end if;
  if exists (
    (select * from normalization_rsvp_before except
     select id, event_slug, name, email, phone, referral_source,
       gift_card_disclaimer_accepted, disclaimer_version, created_at from public.rsvps)
    union all
    (select id, event_slug, name, email, phone, referral_source,
       gift_card_disclaimer_accepted, disclaimer_version, created_at from public.rsvps
     except select * from normalization_rsvp_before)
  ) then
    raise exception 'Normalization verification failed: legacy RSVP values changed';
  end if;
  if exists (
    select 1 from public.rsvps r
    left join public.contacts c on c.id = r.contact_id
    left join public.events e on e.id = r.event_id
    where c.id is null or e.id is null or c.phone is distinct from r.phone
      or e.slug is distinct from r.event_slug
      or row(r.submitted_name, r.submitted_email, r.submitted_phone)
         is distinct from row(r.name, r.email, r.phone)
  ) then
    raise exception 'Normalization verification failed: missing links or changed snapshots';
  end if;
  if exists (
    select 1 from (
      select distinct on (phone) phone, name, email from normalization_rsvp_before
      order by phone, created_at desc, id desc
    ) latest join public.contacts c using (phone)
    where row(c.name, c.email) is distinct from row(latest.name, latest.email)
  ) then
    raise exception 'Normalization verification failed: canonical contact selection differs';
  end if;
  raise notice 'Verified RSVP rows before=%, after=%, contacts=%, events=%',
    before_count, after_count, expected_contacts, (select count(*) from public.events);
end;
$$;
commit;
