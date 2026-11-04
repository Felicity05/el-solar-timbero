-- Duplicates get a new temporary slug; their final name/date slug is assigned on save.
begin;
create or replace function public.admin_duplicate_event(p_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare source public.events%rowtype; copy_id uuid;
begin
 select * into strict source from public.events where id=p_event_id for share;
 insert into public.events(slug,name,description,event_date,venue_name,venue_address,starts_at,ends_at,timezone,status,rsvp_open,
 admission_mode,ticket_sales_open,gift_card_disclaimer_version,publish_at)
 values('draft-'||replace(gen_random_uuid()::text,'-',''),source.name,source.description,source.event_date,
 source.venue_name,source.venue_address,source.starts_at,source.ends_at,source.timezone,'draft',false,source.admission_mode,false,
 source.gift_card_disclaimer_version,source.publish_at) returning id into copy_id;
 insert into public.ticket_types(event_id,name,description,price_cents,currency,active,sales_start_at,sales_end_at)
 select copy_id,name,description,price_cents,currency,active,sales_start_at,sales_end_at from public.ticket_types where event_id=p_event_id;
 -- No PIN/hash, people, registrations, payment IDs, email state or tickets are copied.
 return copy_id;
end;
$$;
alter function public.admin_duplicate_event(uuid) owner to postgres;
revoke all on function public.admin_duplicate_event(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_duplicate_event(uuid) to service_role;
notify pgrst,'reload schema';
commit;
