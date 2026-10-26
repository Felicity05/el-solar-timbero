-- REVIEW AND RUN MANUALLY in the intended database after the ticket disclaimer and 5 PM Eastern sales-cutoff migrations.
-- Creates a DRAFT only. Does not publish, open sales, copy attendees or change Oct 12.
begin;
do $$
declare source public.events%rowtype; event_id uuid;
begin
 select * into strict source from public.events where slug='cuban-night-social-2026-10-12';
 if exists(select 1 from public.events where slug='cuban-night-social-2026-10-26') then
   raise exception 'October 26 event already exists; review it instead of duplicating or overwriting it';
 end if;
 insert into public.events(slug,name,description,venue_name,venue_address,event_date,
 starts_at,ends_at,timezone,status,rsvp_open,admission_mode,ticket_sales_open,gift_card_disclaimer_version)
 values('cuban-night-social-2026-10-26',source.name,source.description,source.venue_name,source.venue_address,
 date '2026-10-26',timestamp '2026-10-26 20:00' at time zone 'America/New_York',
 timestamp '2026-10-26 23:30' at time zone 'America/New_York','America/New_York',
 'draft',false,'ticketed',false,'2026-10-26-ticket-gift-card-v1') returning id into event_id;
 insert into public.ticket_types(event_id,name,price_cents,currency,active,sales_end_at)
 values(event_id,'General Admission',1000,'usd',true,
 timestamp '2026-10-26 17:00' at time zone 'America/New_York');
end $$;
commit;
