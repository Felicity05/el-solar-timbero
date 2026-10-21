-- Preserve historical RSVP consent. Ticket purchases store their own offer snapshot.
begin;
set local lock_timeout='5s';
alter table public.orders add column gift_card_disclaimer_accepted boolean,
 add column disclaimer_version text,
 add constraint orders_gift_card_disclaimer_pair check (
 (gift_card_disclaimer_accepted is null and disclaimer_version is null) or
 (gift_card_disclaimer_accepted is true and disclaimer_version is not null
  and char_length(disclaimer_version) between 1 and 100 and disclaimer_version=btrim(disclaimer_version))
 );
-- Replace the signature; six-argument non-promotion callers still use defaults.
-- Removing the old overload prevents a consent-bypassing write path.
drop function public.initialize_ticket_order(text,text,text,text,text,text);

create or replace function public.initialize_ticket_order(
 p_event_slug text,p_name text,p_email text,p_phone text,p_referral_source text,p_access_hash text,
 p_disclaimer_accepted boolean default false,p_displayed_disclaimer_version text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; tt public.ticket_types%rowtype;
 c uuid; o public.orders%rowtype;
begin
 select * into e from public.events where slug=p_event_slug for share;
 if not found then return jsonb_build_object('status','invalid_event'); end if;
 if e.admission_mode <> 'ticketed' or e.status <> 'published' or not e.ticket_sales_open
 or e.starts_at <= clock_timestamp()
 or clock_timestamp() >= ((e.event_date + time '12:00') at time zone e.timezone) then return jsonb_build_object('status','closed'); end if;
 select * into tt from public.ticket_types where event_id=e.id and active for share;
 if not found or (tt.sales_start_at is not null and tt.sales_start_at > clock_timestamp())
 or (tt.sales_end_at is not null and tt.sales_end_at <= clock_timestamp()) then
 return jsonb_build_object('status','closed'); end if;
 if p_name is null or char_length(p_name) not between 2 and 100 or p_name <> btrim(p_name)
 or p_email is null or p_email <> lower(btrim(p_email)) or char_length(p_email)>254
 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_phone is null or p_phone !~ '^\+[1-9][0-9]{1,14}$'
 or p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$'
 or p_referral_source is null or p_referral_source not in
 ('Instagram','WhatsApp','Friend / Word of mouth','Guantanamera','Dance class / studio','Other')
 then return jsonb_build_object('status','invalid_input'); end if;
 if e.gift_card_disclaimer_version is not null then
   if e.gift_card_disclaimer_version <> '2026-10-26-ticket-gift-card-v1' then
     return jsonb_build_object('status','unsupported_disclaimer');
   end if;
   if p_disclaimer_accepted is distinct from true
    or p_displayed_disclaimer_version is distinct from e.gift_card_disclaimer_version then
     return jsonb_build_object('status','disclaimer_required');
   end if;
 end if;
 insert into public.contacts(name,email,phone) values(p_name,p_email,p_phone) on conflict(phone) do nothing;
 select id into strict c from public.contacts where phone=p_phone for update;
 select * into o from public.orders where contact_id=c and event_id=e.id for update;
 if found then
   if o.status='paid' then return jsonb_build_object('status','already_purchased'); end if;
   if o.disclaimer_version is distinct from e.gift_card_disclaimer_version then
     return jsonb_build_object('status','disclaimer_changed');
   end if;
   if o.status<>'pending' then return jsonb_build_object('status','unavailable'); end if;
 else
   insert into public.orders(event_id,contact_id,ticket_type_id,amount_cents,currency,purchase_access_hash,
     submitted_name,submitted_email,submitted_phone,referral_source,gift_card_disclaimer_accepted,disclaimer_version)
   values(e.id,c,tt.id,tt.price_cents,tt.currency,p_access_hash,p_name,p_email,p_phone,p_referral_source,
     case when e.gift_card_disclaimer_version is not null then true else null end,e.gift_card_disclaimer_version)
   returning * into o;
   update public.contacts set name=p_name,email=p_email where id=c;
 end if;
 -- Fixed Stripe idempotency keys are only retained >=24h. Never blindly retry
 -- an ambiguous, unlinked creation after that window: reconcile it manually.
 if o.stripe_payment_intent_id is null and o.payment_attempt_started_at < now()-interval '23 hours' then
 return jsonb_build_object('status','reconciliation_required'); end if;
 return jsonb_build_object('status',case when o.purchase_access_hash=p_access_hash then 'pending' else 'recovery_required' end,'order_id',o.id,'event_id',o.event_id,
 'ticket_type_id',o.ticket_type_id,'amount_cents',o.amount_cents,'currency',o.currency,
 'payment_intent_id',o.stripe_payment_intent_id,'payment_attempt',o.payment_attempt);
end $$;

alter function public.initialize_ticket_order(text,text,text,text,text,text,boolean,text) owner to postgres;
revoke all on function public.initialize_ticket_order(text,text,text,text,text,text,boolean,text)
 from public,anon,authenticated,service_role;
grant execute on function public.initialize_ticket_order(text,text,text,text,text,text,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
