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


-- Clearly fake paid event; never create a real production event from a seed.
insert into public.events(slug,name,event_date,description,venue_name,venue_address,starts_at,ends_at,
 timezone,status,rsvp_open,admission_mode,ticket_sales_open)
values('dev-ticket-test-2026-12-30','LOCAL DEV — $10 Ticket Test Event','2026-12-30',
 'LOCAL ONLY. Stripe test mode. Not a real event.','Test Venue','LOCAL DEVELOPMENT ONLY',
 '2026-12-30 20:00:00-05','2026-12-30 23:00:00-05','America/New_York','published',false,'ticketed',true)
on conflict(slug) do nothing;
insert into public.ticket_types(event_id,name,price_cents,currency)
select id,'General Admission',1000,'usd' from public.events where slug='dev-ticket-test-2026-12-30'
and not exists(select 1 from public.ticket_types where event_id=events.id and active);
