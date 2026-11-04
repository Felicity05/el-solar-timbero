-- Admin-only configuration choices; no attendee/payment changes.
begin;
create function public.admin_event_form_options() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'disclaimer_versions',(select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from
 (select distinct gift_card_disclaimer_version version from public.events where gift_card_disclaimer_version is not null) versions),
 'ticket_names',(select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from
 (select distinct name from public.ticket_types) names));
$$;
alter function public.admin_event_form_options() owner to postgres;
revoke all on function public.admin_event_form_options() from public,anon,authenticated,service_role;
grant execute on function public.admin_event_form_options() to service_role;
notify pgrst,'reload schema';
commit;
