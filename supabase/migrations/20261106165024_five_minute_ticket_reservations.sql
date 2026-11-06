-- New reservations use five minutes. Existing deadlines and paid tickets remain unchanged.
begin;
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
   if e.ticket_capacity is not null and o.reservation_released_at is not null then
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
create or replace function public.admin_save_event(p_event_id uuid,p_config jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_event_id uuid; existing public.events%rowtype; type_id uuid;
  zone text:=p_config->>'timezone'; start_time timestamptz; end_time timestamptz; publication timestamptz;
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then
   raise exception 'Invalid timezone' using errcode='22023';
 end if;
 start_time:=(p_config->>'starts_at_local')::timestamp at time zone zone;
 end_time:=(p_config->>'ends_at_local')::timestamp at time zone zone;
 publication:=(p_config->>'publish_at_local')::timestamp at time zone zone;
 if (start_time at time zone zone)<>(p_config->>'starts_at_local')::timestamp
 or (end_time at time zone zone)<>(p_config->>'ends_at_local')::timestamp
 or (publication at time zone zone)<>(p_config->>'publish_at_local')::timestamp then
  raise exception 'Nonexistent daylight-saving time' using errcode='22023';
 end if;
 if p_config->>'publication_mode'='scheduled' and publication<=clock_timestamp() then
  raise exception 'Scheduled publication must be in the future' using errcode='P2001'; end if;
 if p_config->>'publication_mode'='published' and publication>clock_timestamp() then
  raise exception 'Choose Scheduled for a future publication' using errcode='P2002'; end if;
 if p_config->>'publication_mode' in('published','scheduled') and p_config->>'admission_mode'='ticketed'
 and (p_config->>'ticket_active')::boolean is distinct from true then
  raise exception 'Activate ticket type before publication' using errcode='P2004'; end if;
 if p_event_id is not null then
  select * into strict existing from public.events where id=p_event_id for update;
  if existing.admission_mode<>(p_config->>'admission_mode') and (
    exists(select 1 from public.orders where event_id=p_event_id) or exists(select 1 from public.rsvps where event_id=p_event_id)) then
    raise exception 'Cannot change admission mode after registrations' using errcode='22023';
  end if;
  v_event_id:=existing.id;
 else
  insert into public.events(slug,name,event_date,description,venue_name,venue_address,starts_at,ends_at,timezone,publish_at,status,admission_mode)
  values(p_config->>'slug',p_config->>'name',(p_config->>'event_date')::date,nullif(p_config->>'description',''),
   p_config->>'venue_name',p_config->>'venue_address',start_time,end_time,zone,publication,'draft',p_config->>'admission_mode') returning id into v_event_id;
 end if;
 update public.events set slug=p_config->>'slug',name=p_config->>'name',description=nullif(p_config->>'description',''),
 event_date=(p_config->>'event_date')::date,venue_name=p_config->>'venue_name',venue_address=p_config->>'venue_address',
 starts_at=start_time,ends_at=end_time,timezone=zone,publish_at=publication,status=p_config->>'status',admission_mode=p_config->>'admission_mode',
 rsvp_open=(p_config->>'rsvp_open')::boolean,ticket_sales_open=(p_config->>'ticket_sales_open')::boolean,
 gift_card_disclaimer_version=nullif(p_config->>'gift_card_disclaimer_version',''),
 ticket_capacity=case when p_config?'ticket_capacity' then (p_config->>'ticket_capacity')::integer else ticket_capacity end where id=v_event_id;
 if (select ticket_capacity is not null from public.events where id=v_event_id) then
  update public.orders set reservation_expires_at=clock_timestamp()+interval '5 minutes'
   where event_id=v_event_id and status='pending' and reservation_released_at is null and reservation_expires_at is null;
 end if;
 if p_config->>'admission_mode'='ticketed' then
  select id into type_id from public.ticket_types where ticket_types.event_id=v_event_id order by active desc,created_at desc,id limit 1 for update;
  if type_id is null then
   insert into public.ticket_types(event_id,name,price_cents,currency,active) values(v_event_id,p_config->>'ticket_name',(p_config->>'price_cents')::integer,'usd',false) returning id into type_id;
  end if;
  update public.ticket_types set name=p_config->>'ticket_name',description=nullif(p_config->>'ticket_description',''),price_cents=(p_config->>'price_cents')::integer,
   currency='usd',active=(p_config->>'ticket_active')::boolean,
   sales_start_at=nullif(p_config->>'sales_start_local','')::timestamp at time zone zone,
   sales_end_at=nullif(p_config->>'sales_end_local','')::timestamp at time zone zone where id=type_id;
 end if;
 return v_event_id;
end;
$$;
notify pgrst,'reload schema';
commit;
