-- Read-only ticket presentation. No table/column, token, or payment changes.
begin;
set local lock_timeout = '5s';

-- Purchase-capability holders can obtain their fulfilled ticket credential.
create or replace function public.get_ticket_purchase(p_event_slug text,p_access_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('status',o.status,'ticket_code',t.ticket_code,'ticket_status',t.status,
 'ticket_token',case when o.status='paid' and t.status='valid' then t.ticket_token else null end,
 'event_name',e.name,'event_date',e.event_date,'starts_at',e.starts_at,'ends_at',e.ends_at,
 'timezone',e.timezone,'venue_name',e.venue_name,'venue_address',e.venue_address,
 'ticket_type',tt.name,'amount_cents',o.amount_cents,'currency',o.currency)
 from public.orders o join public.events e on e.id=o.event_id
 join public.ticket_types tt on tt.id=o.ticket_type_id left join public.tickets t on t.order_id=o.id
 where e.slug=p_event_slug and o.purchase_access_hash=p_access_hash;
$$;

-- Token possession authorizes only the public-facing ticket details.
-- No attendee, internal identifier, Stripe, or check-in information is returned.
create function public.get_ticket_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('ticket_token',t.ticket_token,'ticket_code',t.ticket_code,
 'event_name',e.name,'event_date',e.event_date,'starts_at',e.starts_at,'ends_at',e.ends_at,
 'timezone',e.timezone,'venue_name',e.venue_name,'venue_address',e.venue_address,
 'ticket_type',tt.name,'amount_cents',o.amount_cents,'currency',o.currency)
 from public.tickets t join public.orders o on o.id=t.order_id
 join public.events e on e.id=t.event_id join public.ticket_types tt on tt.id=t.ticket_type_id
 where p_token ~ '^[a-f0-9]{64}$' and t.ticket_token=p_token
 and t.status='valid' and o.status='paid';
$$;
alter function public.get_ticket_by_token(text) owner to postgres;
alter function public.get_ticket_purchase(text,text) owner to postgres;
revoke all on function public.get_ticket_by_token(text),public.get_ticket_purchase(text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.get_ticket_by_token(text),public.get_ticket_purchase(text,text) to service_role;
notify pgrst,'reload schema';
commit;
