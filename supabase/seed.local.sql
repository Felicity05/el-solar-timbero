-- LOCAL ONLY. Deliberately excluded from automatic/default seeding.
-- Execute only in the named local Docker database, with app.local_seed=true.
do $$ begin
  if current_setting('app.local_seed', true) is distinct from 'true' then
    raise exception 'Local seed requires explicit app.local_seed=true session opt-in';
  end if;
end $$;

insert into public.events (
    slug,
    name,
    event_date,
    description,
    venue_name,
    venue_address,
    starts_at,
    ends_at,
    timezone,
    status,
    rsvp_open
)
values (
           'dev-rsvp-test-2026-12-31',
           'LOCAL DEV — RSVP Test Event',
           date '2026-12-31',
           'Local development only. Not a real El Solar event.',
           'Test Venue',
           'LOCAL DEVELOPMENT ONLY',
           '2026-12-31 20:00:00-05',
           '2026-12-31 23:00:00-05',
           'America/New_York',
           'published',
           true
       )
    on conflict (slug) do nothing;
