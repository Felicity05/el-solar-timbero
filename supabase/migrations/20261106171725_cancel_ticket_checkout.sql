-- Browser capability authorizes only its own unpaid checkout; Stripe must confirm
-- cancellation before releasing inventory. Keep the order for one-order/event reuse.
begin;
create function public.get_ticket_checkout_for_cancellation(p_event_slug text,p_access_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when o.status='paid' then jsonb_build_object('status','paid')
 when o.status<>'pending' or o.reservation_released_at is not null then jsonb_build_object('status','canceled')
 else jsonb_build_object('status','pending','order_id',o.id,'event_id',o.event_id,'ticket_type_id',o.ticket_type_id,
 'amount_cents',o.amount_cents,'currency',o.currency,'payment_intent_id',o.stripe_payment_intent_id,
 'payment_attempt',o.payment_attempt,'payment_attempt_started_at',o.payment_attempt_started_at) end
 from public.orders o join public.events e on e.id=o.event_id
 where e.slug=p_event_slug and o.purchase_access_hash=p_access_hash;
$$;
create function public.cancel_ticket_checkout(p_event_slug text,p_access_hash text,p_expected_attempt integer,p_canceled_intent_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare e uuid; o public.orders%rowtype;
begin
 select id into e from public.events where slug=p_event_slug for update;
 if not found then return false; end if;
 select * into o from public.orders where event_id=e and purchase_access_hash=p_access_hash for update;
 if not found or o.status<>'pending' or p_canceled_intent_id is null or p_canceled_intent_id !~ '^pi_[a-zA-Z0-9]+$' then return false; end if;
 if o.reservation_released_at is not null and o.payment_attempt=p_expected_attempt+1
 and p_canceled_intent_id=any(o.superseded_payment_intent_ids) then return true; end if;
 if o.payment_attempt is distinct from p_expected_attempt or o.reservation_released_at is not null
 or (o.stripe_payment_intent_id is not null and o.stripe_payment_intent_id<>p_canceled_intent_id) then return false; end if;
 update public.orders set reservation_released_at=clock_timestamp(),reservation_expires_at=clock_timestamp(),
 stripe_payment_intent_id=null,payment_attempt=payment_attempt+1,payment_attempt_started_at=clock_timestamp(),
 superseded_payment_intent_ids=array_append(superseded_payment_intent_ids,p_canceled_intent_id) where id=o.id;
 return true;
end $$;
alter function public.get_ticket_checkout_for_cancellation(text,text) owner to postgres;
alter function public.cancel_ticket_checkout(text,text,integer,text) owner to postgres;
revoke all on function public.get_ticket_checkout_for_cancellation(text,text),public.cancel_ticket_checkout(text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.get_ticket_checkout_for_cancellation(text,text),public.cancel_ticket_checkout(text,text,integer,text) to service_role;
create or replace function public.initialize_ticket_order(
 p_event_slug text,p_name text,p_email text,p_phone text,p_referral_source text,p_access_hash text,
 p_disclaimer_accepted boolean default false,p_displayed_disclaimer_version text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; tt public.ticket_types%rowtype;
 c uuid; o public.orders%rowtype;
begin
 select * into e from public.events where slug=p_event_slug for update;
 if not found then return jsonb_build_object('status','invalid_event'); end if;
 if e.admission_mode <> 'ticketed' or e.status <> 'published' or not e.ticket_sales_open
 or e.publish_at > clock_timestamp() or e.starts_at <= clock_timestamp()
 or clock_timestamp() >= ((e.event_date + time '17:00') at time zone 'America/New_York') then return jsonb_build_object('status','closed'); end if;
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
   if p_disclaimer_accepted is distinct from true
    or p_displayed_disclaimer_version is distinct from e.gift_card_disclaimer_version then
     return jsonb_build_object('status','disclaimer_required');
   end if;
 end if;
 -- Existing contacts/orders are resolved first so an owner's final reserved place
 -- remains usable even when the event has no OTHER inventory available.
 select id into c from public.contacts where phone=p_phone;
 select * into o from public.orders where contact_id=c and event_id=e.id for update;
 if found and o.status='paid' then return jsonb_build_object('status','already_purchased'); end if;
 if e.ticket_capacity is not null and (o.id is null or o.reservation_released_at is not null)
 and public.event_ticket_allocated(e.id)>=e.ticket_capacity then return jsonb_build_object('status','capacity_full'); end if;
 insert into public.contacts(name,email,phone) values(p_name,p_email,p_phone) on conflict(phone) do nothing;
 select id into strict c from public.contacts where phone=p_phone for update;
 select * into o from public.orders where contact_id=c and event_id=e.id for update;
 if found then
   if o.status='paid' then return jsonb_build_object('status','already_purchased'); end if;
   if o.disclaimer_version is distinct from e.gift_card_disclaimer_version then
     return jsonb_build_object('status','disclaimer_changed');
   end if;
   if o.status<>'pending' then return jsonb_build_object('status','unavailable'); end if;
   if o.reservation_released_at is not null then
    update public.orders set reservation_released_at=null,reservation_expires_at=clock_timestamp()+interval '5 minutes',
     payment_attempt_started_at=clock_timestamp(),purchase_access_hash=p_access_hash,
     submitted_name=p_name,submitted_email=p_email,referral_source=p_referral_source where id=o.id returning * into o;
   elsif e.ticket_capacity is not null and o.reservation_expires_at is null then
    update public.orders set reservation_expires_at=clock_timestamp()+interval '5 minutes' where id=o.id returning * into o;
   end if;
 else
   insert into public.orders(event_id,contact_id,ticket_type_id,amount_cents,currency,purchase_access_hash,
     submitted_name,submitted_email,submitted_phone,referral_source,gift_card_disclaimer_accepted,disclaimer_version)
   values(e.id,c,tt.id,tt.price_cents,tt.currency,p_access_hash,p_name,p_email,p_phone,p_referral_source,
     case when e.gift_card_disclaimer_version is not null then true else null end,e.gift_card_disclaimer_version)
   returning * into o;
   if e.ticket_capacity is not null then
    update public.orders set reservation_expires_at=clock_timestamp()+interval '5 minutes' where id=o.id returning * into o;
   end if;
   update public.contacts set name=p_name,email=p_email where id=c;
 end if;
 -- Edits are permitted only for this browser's unpaid order, under the
 -- existing contact/order locks. Paid orders returned above remain immutable.
 if o.purchase_access_hash=p_access_hash and
  (o.submitted_name,o.submitted_email,o.referral_source) is distinct from (p_name,p_email,p_referral_source) then
   update public.orders set submitted_name=p_name,submitted_email=p_email,referral_source=p_referral_source
    where id=o.id;
   update public.contacts set name=p_name,email=p_email where id=c
    and (name,email) is distinct from (p_name,p_email);
 end if;
 -- Fixed Stripe idempotency keys are only retained >=24h. Never blindly retry
 -- an ambiguous, unlinked creation after that window: reconcile it manually.
 if o.stripe_payment_intent_id is null and o.payment_attempt_started_at < now()-interval '23 hours' then
 return jsonb_build_object('status','reconciliation_required'); end if;
 return jsonb_build_object('status',case when o.purchase_access_hash=p_access_hash then 'pending' else 'recovery_required' end,'order_id',o.id,'event_id',o.event_id,
 'ticket_type_id',o.ticket_type_id,'amount_cents',o.amount_cents,'currency',o.currency,
 'payment_intent_id',o.stripe_payment_intent_id,'payment_attempt',o.payment_attempt,'reservation_expires_at',case when e.ticket_capacity is not null then o.reservation_expires_at else null end);
end $$;
notify pgrst,'reload schema';
commit;
