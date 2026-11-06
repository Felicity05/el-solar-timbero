-- Authenticated admin PIN retrieval and complimentary recipient reads only.
-- Existing hash-only PINs are unchanged and still validate at the door.
begin;
set local lock_timeout='5s';
alter table public.events add column check_in_pin_ciphertext text
 check(check_in_pin_ciphertext ~ '^v1\.[a-f0-9]{24}\.[a-f0-9]{32}\.[a-f0-9]{12,24}$');
-- Legacy callers can still regenerate, but must not leave stale encrypted data.
create or replace function public.admin_set_event_pin(p_event_id uuid,p_pin_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_pin_hash is null or p_pin_hash !~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$' then raise exception 'Invalid hash' using errcode='22023'; end if;
 update public.events set check_in_pin_hash=p_pin_hash,check_in_pin_ciphertext=null where id=p_event_id;
 return found;
end $$;
create function public.admin_set_event_pin(p_event_id uuid,p_pin_hash text,p_pin_ciphertext text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_pin_hash is null or p_pin_hash !~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$'
 or p_pin_ciphertext is null or p_pin_ciphertext !~ '^v1\.[a-f0-9]{24}\.[a-f0-9]{32}\.[a-f0-9]{12,24}$'
 then raise exception 'Invalid PIN storage' using errcode='22023'; end if;
 update public.events set check_in_pin_hash=p_pin_hash,check_in_pin_ciphertext=p_pin_ciphertext where id=p_event_id;
 return found;
end $$;
create function public.admin_get_event_pin(p_event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('pin_hash',check_in_pin_hash,'pin_ciphertext',check_in_pin_ciphertext)
 from public.events where id=p_event_id;
$$;
create function public.admin_list_complimentary_recipients(p_event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('name',o.submitted_name,'email',o.submitted_email,'phone',o.submitted_phone,
 'ticket_code',t.ticket_code,'status',case when o.status='paid' then t.status else 'void' end,'issued_at',t.created_at,'email_sent_at',t.email_sent_at,
 'email_attempted_at',t.email_attempted_at) order by t.created_at desc,t.id desc),'[]'::jsonb)
 from public.orders o join public.tickets t on t.order_id=o.id
 where o.event_id=p_event_id and o.order_kind='complimentary';
$$;
create or replace function public.admin_list_events() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg((to_jsonb(e)-'check_in_pin_hash'-'check_in_pin_ciphertext') || jsonb_build_object('has_check_in_pin',e.check_in_pin_hash is not null,
 'display_status',case when e.status='published' and e.ends_at<=statement_timestamp() then 'Ended' when e.status='published' and e.publish_at>statement_timestamp() then 'Scheduled' else e.status end)
 order by e.starts_at desc,e.id),'[]'::jsonb) from public.events e;
$$;
create or replace function public.admin_event_detail(p_event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('event',to_jsonb(e)-'check_in_pin_hash'-'check_in_pin_ciphertext' || jsonb_build_object('has_check_in_pin',e.check_in_pin_hash is not null),
 'ticket_type',(select to_jsonb(tt) from public.ticket_types tt where tt.event_id=e.id order by tt.active desc,tt.created_at desc,tt.id limit 1),
 'metrics',jsonb_build_object(
   'tickets_issued',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid'),
   'complimentary_tickets',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid' and o.order_kind='complimentary'),
   'pending_reservations',(select count(*) from public.orders o where o.event_id=e.id and o.status='pending' and o.reservation_released_at is null),
   'remaining_capacity',case when e.ticket_capacity is null then null else greatest(0,e.ticket_capacity-public.event_ticket_allocated(e.id)) end,
   'tickets_sold',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid' and o.order_kind='stripe'),
   'gross_revenue_cents',(select coalesce(sum(o.amount_cents),0) from public.orders o where o.event_id=e.id and o.status='paid'),
   'checked_in',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid' and t.checked_in_at is not null),
   'not_checked_in',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid' and t.checked_in_at is null),
   'rsvps',(select count(*) from public.rsvps r where r.event_id=e.id)))
 from public.events e where e.id=p_event_id;
$$;

-- No new browser or direct table access. Retrieval is invoked only by guarded admin actions.
do $$ declare signature text; begin
 foreach signature in array array['admin_set_event_pin(uuid,text)','admin_set_event_pin(uuid,text,text)',
 'admin_get_event_pin(uuid)','admin_list_complimentary_recipients(uuid)'] loop
  execute format('alter function public.%s owner to postgres',signature);
  execute format('revoke all on function public.%s from public,anon,authenticated,service_role',signature);
  execute format('grant execute on function public.%s to service_role',signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
