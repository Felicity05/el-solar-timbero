-- Read the existing check-in timestamp; no ticket/check-in mutations.
begin;
create or replace function public.admin_list_complimentary_recipients(p_event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('name',o.submitted_name,'email',o.submitted_email,'phone',o.submitted_phone,
 'ticket_code',t.ticket_code,'status',case when o.status='paid' then t.status else 'void' end,'issued_at',t.created_at,'email_sent_at',t.email_sent_at,
 'email_attempted_at',t.email_attempted_at,'checked_in_at',t.checked_in_at) order by t.created_at desc,t.id desc),'[]'::jsonb)
 from public.orders o join public.tickets t on t.order_id=o.id
 where o.event_id=p_event_id and o.order_kind='complimentary';
$$;
alter function public.admin_list_complimentary_recipients(uuid) owner to postgres;
revoke all on function public.admin_list_complimentary_recipients(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_list_complimentary_recipients(uuid) to service_role;
notify pgrst,'reload schema';
commit;
