-- Add staff-only operations; do not rewrite tokens, QR payloads or sold tickets.
begin;
set local lock_timeout='5s';

create function public.validate_door_ticket(p_event_slug text,p_credential text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((
   select jsonb_build_object('status',case when t.checked_in_at is null then 'valid' else 'already_checked_in' end,
    'ticket_code',t.ticket_code,'ticket_type',tt.name,'event_name',e.name,
    'checked_in_at',t.checked_in_at,'timezone',e.timezone)
   from public.tickets t join public.orders o on o.id=t.order_id
   join public.events e on e.id=t.event_id join public.ticket_types tt on tt.id=t.ticket_type_id
   where e.slug=p_event_slug and e.admission_mode='ticketed' and e.status='published'
    and t.status='valid' and o.status='paid'
    and ((p_credential ~ '^[a-f0-9]{64}$' and t.ticket_token=p_credential)
     or (p_credential ~ '^EST-[A-F0-9]{12}$' and t.ticket_code=p_credential))
 ),jsonb_build_object('status','invalid'));
$$;

create function public.check_in_door_ticket(p_event_slug text,p_credential text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare found_ticket record; admitted_at timestamptz;
begin
 -- Hold both order and ticket locks while checking payment/ticket validity.
 -- Concurrent staff presses serialize here; only the first can set the timestamp.
 select t.id,t.status as ticket_status,t.checked_in_at,t.ticket_code,
  o.status as order_status,tt.name as ticket_type,e.name as event_name,e.timezone
 into found_ticket
 from public.orders o join public.tickets t on t.order_id=o.id
 join public.events e on e.id=t.event_id join public.ticket_types tt on tt.id=t.ticket_type_id
 where e.slug=p_event_slug and e.admission_mode='ticketed' and e.status='published'
  and ((p_credential ~ '^[a-f0-9]{64}$' and t.ticket_token=p_credential)
   or (p_credential ~ '^EST-[A-F0-9]{12}$' and t.ticket_code=p_credential))
 for update of o,t;
 if not found or found_ticket.ticket_status<>'valid' or found_ticket.order_status<>'paid' then
  return jsonb_build_object('status','invalid');
 end if;
 if found_ticket.checked_in_at is not null then
  return jsonb_build_object('status','already_checked_in','ticket_code',found_ticket.ticket_code,
   'ticket_type',found_ticket.ticket_type,'event_name',found_ticket.event_name,
   'checked_in_at',found_ticket.checked_in_at,'timezone',found_ticket.timezone);
 end if;
 update public.tickets set checked_in_at=clock_timestamp()
 where id=found_ticket.id and status='valid' and checked_in_at is null
 returning checked_in_at into admitted_at;
 if not found then raise exception 'Check-in state changed'; end if;
 return jsonb_build_object('status','checked_in','ticket_code',found_ticket.ticket_code,
  'ticket_type',found_ticket.ticket_type,'event_name',found_ticket.event_name,
  'checked_in_at',admitted_at,'timezone',found_ticket.timezone);
end $$;

alter function public.validate_door_ticket(text,text) owner to postgres;
alter function public.check_in_door_ticket(text,text) owner to postgres;
revoke all on function public.validate_door_ticket(text,text),public.check_in_door_ticket(text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.validate_door_ticket(text,text),public.check_in_door_ticket(text,text) to service_role;
-- No new table privileges and no updates/backfills of existing tickets.
notify pgrst,'reload schema';
commit;
