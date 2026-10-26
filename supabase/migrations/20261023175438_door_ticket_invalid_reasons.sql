-- Staff-only invalid reasons. No ticket data, credentials or public pages change.
begin;
set local lock_timeout = '5s';

create or replace function public.validate_door_ticket(p_event_slug text, p_credential text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidate as (
    select t.ticket_code, t.checked_in_at, tt.name as ticket_type,
      e.name as event_name, e.timezone,
      case
        when e.slug is distinct from p_event_slug then 'wrong_event'
        when e.admission_mode <> 'ticketed' or e.status <> 'published' then 'event_unavailable'
        when t.status = 'refunded' or o.status = 'refunded' then 'refunded'
        when t.status = 'void' or o.status = 'void' then 'void'
        when o.status <> 'paid' then 'unpaid'
        else null
      end as reason
    from public.tickets t
    join public.orders o on o.id = t.order_id
    join public.events e on e.id = t.event_id
    join public.ticket_types tt on tt.id = t.ticket_type_id
    where ((p_credential ~ '^[a-f0-9]{64}$' and t.ticket_token = p_credential)
      or (p_credential ~ '^EST-[A-F0-9]{12}$' and t.ticket_code = p_credential))
  )
  select coalesce((select case when reason is not null
    then jsonb_build_object('status', 'invalid', 'reason', reason)
    else jsonb_build_object(
      'status', case when checked_in_at is null then 'valid' else 'already_checked_in' end,
      'ticket_code', ticket_code, 'ticket_type', ticket_type,
      'event_name', event_name, 'checked_in_at', checked_in_at, 'timezone', timezone)
    end from candidate), jsonb_build_object('status', 'invalid', 'reason', 'not_found'));
$$;

create or replace function public.check_in_door_ticket(p_event_slug text, p_credential text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare validation jsonb; admitted_at timestamptz;
begin
  -- Keep the existing order/ticket row locks and explicit admission requirement.
  perform 1 from public.orders o join public.tickets t on t.order_id = o.id
  where ((p_credential ~ '^[a-f0-9]{64}$' and t.ticket_token = p_credential)
    or (p_credential ~ '^EST-[A-F0-9]{12}$' and t.ticket_code = p_credential))
  for update of o, t;

  -- Recheck under the locks; validation and admission return identical reasons.
  validation := public.validate_door_ticket(p_event_slug, p_credential);
  if validation->>'status' <> 'valid' then
    return validation;
  end if;

  update public.tickets set checked_in_at = clock_timestamp()
  where status = 'valid' and checked_in_at is null
    and ((p_credential ~ '^[a-f0-9]{64}$' and ticket_token = p_credential)
      or (p_credential ~ '^EST-[A-F0-9]{12}$' and ticket_code = p_credential))
  returning checked_in_at into admitted_at;
  if not found then raise exception 'Check-in state changed'; end if;
  return validation || jsonb_build_object('status', 'checked_in', 'checked_in_at', admitted_at);
end;
$$;

-- CREATE OR REPLACE retains existing ownership and permissions; restate the restriction.
alter function public.validate_door_ticket(text, text) owner to postgres;
alter function public.check_in_door_ticket(text, text) owner to postgres;
revoke all on function public.validate_door_ticket(text, text), public.check_in_door_ticket(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.validate_door_ticket(text, text), public.check_in_door_ticket(text, text) to service_role;
notify pgrst, 'reload schema';
commit;
