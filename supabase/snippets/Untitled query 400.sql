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
           date '2026-10-19',
           'Local development test. Not a real El Solar event.',
           'Test Venue',
           'LOCAL DEVELOPMENT ONLY',
           '2026-10-19 20:00:00-05',
           '2026-10-19 23:00:00-05',
           'America/New_York',
           'published',
           true
       )
    on conflict (slug) do nothing;