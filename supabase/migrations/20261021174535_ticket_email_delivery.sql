-- Email delivery bookkeeping only; fulfillment and existing tickets are unchanged.
begin;
set local lock_timeout = '5s';
alter table public.tickets
 add column email_attempted_at timestamptz,
 add column email_sent_at timestamptz,
 add constraint ticket_email_timestamps check (email_sent_at is null or (email_attempted_at is not null and email_sent_at >= email_attempted_at));

-- An atomic, persistent claim prevents simultaneous/duplicate webhook sends.
-- Never expire a claim automatically: SMTP may accept mail before a connection
-- fails, so retrying an ambiguous send could duplicate a customer's email.
create function public.claim_ticket_email(p_order_id uuid, p_intent_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb;
begin
 with claimed as (
   update public.tickets t set email_attempted_at=clock_timestamp()
   from public.orders o
   where t.order_id=o.id and o.id=p_order_id
    and o.stripe_payment_intent_id=p_intent_id and o.status='paid' and t.status='valid'
    and t.email_attempted_at is null and t.email_sent_at is null
   returning t.*
 )
 select jsonb_build_object('recipient',o.submitted_email,'ticket_token',t.ticket_token,
   'ticket_code',t.ticket_code,'event_name',e.name,'event_date',e.event_date,
   'starts_at',e.starts_at,'ends_at',e.ends_at,'timezone',e.timezone,
   'venue_name',e.venue_name,'venue_address',e.venue_address,
   'ticket_type',tt.name,'amount_cents',o.amount_cents,'currency',o.currency)
 into payload from claimed t join public.orders o on o.id=t.order_id
 join public.events e on e.id=t.event_id join public.ticket_types tt on tt.id=t.ticket_type_id;
 return payload;
end $$;

create function public.mark_ticket_email_sent(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 update public.tickets set email_sent_at=clock_timestamp()
 where order_id=p_order_id and email_attempted_at is not null and email_sent_at is null;
 return found;
end $$;
alter function public.claim_ticket_email(uuid,text) owner to postgres;
alter function public.mark_ticket_email_sent(uuid) owner to postgres;
revoke all on function public.claim_ticket_email(uuid,text),public.mark_ticket_email_sent(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.claim_ticket_email(uuid,text),public.mark_ticket_email_sent(uuid) to service_role;
-- Direct table privileges remain revoked; no browser email/read/send capability.
notify pgrst,'reload schema';
commit;
