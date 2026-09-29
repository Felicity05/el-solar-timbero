-- Initial, unapplied MVP migration. One RSVP per normalized phone per event.
-- The server supplies an allowed event slug; no events table is needed yet.
create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null check (
    char_length(event_slug) between 1 and 120
    and event_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  name text not null check (
    char_length(name) between 1 and 100 and name = btrim(name)
  ),
  email text not null check (
    char_length(email) between 3 and 254
    and email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  -- E.164 shape only. Country-aware parsing/validation happens on the server.
  phone text not null check (phone ~ '^\+[1-9][0-9]{1,14}$'),
  referral_source text not null check (referral_source in (
    'Instagram', 'WhatsApp', 'Friend / Word of mouth',
    'Guantanamera', 'Dance class / studio', 'Other'
  )),
  gift_card_disclaimer_accepted boolean not null check (gift_card_disclaimer_accepted = true),
  disclaimer_version text not null check (
    char_length(disclaimer_version) between 1 and 100
    and disclaimer_version = btrim(disclaimer_version)
  ),
  created_at timestamptz not null default now(),
  constraint rsvps_event_phone_key unique (event_slug, phone)
);

alter table public.rsvps enable row level security;
-- No browser policies: neither anonymous nor signed-in clients may access RSVPs.
revoke all on table public.rsvps from public, anon, authenticated;
-- The app only inserts. No API permission to list, overwrite, or delete RSVPs.
revoke all on table public.rsvps from service_role;
grant insert on table public.rsvps to service_role;

comment on table public.rsvps is 'El Solar Timbero RSVPs, one per event and normalized phone. No gift-card eligibility or allocation.';
comment on column public.rsvps.event_slug is 'Stable event identifier supplied by server configuration, never accepted from browser input.';
comment on column public.rsvps.phone is 'Canonical E.164 phone number. Format validation does not verify ownership.';
comment on column public.rsvps.disclaimer_version is '2026-10-12-v1: phone may be shared with Guantanamera for the promotional e-gift-card offer; RSVP does not guarantee a gift card. Guantanamera determines eligibility and generates and sends its QR codes.';
