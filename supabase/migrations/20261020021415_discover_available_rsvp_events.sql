-- Safe server-only discovery; preserves existing read/write RPC compatibility.
begin;
create function public.get_available_rsvp_events()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',slug,'name',name,'event_date',event_date,
    'starts_at',starts_at,'ends_at',ends_at,'timezone',timezone,
    'venue_name',venue_name,'venue_address',venue_address,'open',true,
    'disclaimer_version',gift_card_disclaimer_version
  ) order by starts_at, id), '[]'::jsonb)
  from public.events
  where status = 'published' and rsvp_open and starts_at > statement_timestamp();
$$;
alter function public.get_available_rsvp_events() owner to postgres;
revoke all on function public.get_available_rsvp_events() from public, anon, authenticated, service_role;
grant execute on function public.get_available_rsvp_events() to service_role;
notify pgrst, 'reload schema';
commit;
