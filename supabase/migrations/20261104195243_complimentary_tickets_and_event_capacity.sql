-- Complimentary admissions and shared event capacity. Existing events default to unlimited.
-- No existing order, ticket, token, email state or applied migration is rewritten.
begin;
set local lock_timeout='5s';
alter table public.events add column ticket_capacity integer check(ticket_capacity>0);
alter table public.orders add column order_kind text not null default 'stripe' check(order_kind in('stripe','complimentary')),
 add column complimentary_issued_by uuid,
 add column reservation_expires_at timestamptz,
 add column reservation_released_at timestamptz;
alter table public.orders drop constraint orders_amount_cents_check;
-- Locate the legacy unnamed paid/Stripe check without assuming its generated name.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.orders'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%paid_at%' and pg_get_constraintdef(oid) like '%stripe_payment_intent_id%'
 loop execute format('alter table public.orders drop constraint %I',c.conname); end loop;
end $$;
alter table public.orders add constraint orders_admission_source_check check (
 (order_kind='stripe' and amount_cents>0 and complimentary_issued_by is null) or
 (order_kind='complimentary' and amount_cents=0 and complimentary_issued_by is not null and stripe_payment_intent_id is null and status in('paid','void'))),
 add constraint orders_paid_source_check check(status<>'paid' or (paid_at is not null and (order_kind='complimentary' or stripe_payment_intent_id is not null))),
 add constraint orders_reservation_release_check check(reservation_released_at is null or reservation_expires_at is not null);
create index orders_expired_reservations_idx on public.orders(event_id,reservation_expires_at)
 where status='pending' and reservation_released_at is null;

create function public.event_ticket_allocated(p_event_id uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from public.orders where event_id=p_event_id and
 (status='paid' or (status='pending' and reservation_released_at is null));
$$;
-- The expiry timestamp does NOT free a place. Stripe cancellation must happen first.
create function public.guard_event_ticket_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.ticket_capacity is not null and public.event_ticket_allocated(new.id)>new.ticket_capacity then
 raise exception 'Capacity cannot be below issued tickets and active reservations' using errcode='P2003'; end if;
 return new;
end $$;
create trigger guard_event_ticket_capacity before update of ticket_capacity on public.events
 for each row execute function public.guard_event_ticket_capacity();

create function public.get_expired_ticket_reservations(p_event_slug text default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (
 select o.id order_id,o.event_id,o.ticket_type_id,o.amount_cents,o.currency,o.stripe_payment_intent_id payment_intent_id,
 o.payment_attempt,o.payment_attempt_started_at,o.reservation_expires_at,'pending'::text status
 from public.orders o join public.events e on e.id=o.event_id
 where e.ticket_capacity is not null and (p_event_slug is null or e.slug=p_event_slug)
 and o.order_kind='stripe' and o.status='pending' and o.reservation_released_at is null
 and o.reservation_expires_at<=clock_timestamp()
 order by o.reservation_expires_at,o.id limit 5) x;
$$;
create function public.release_ticket_reservation(p_order_id uuid,p_expected_attempt integer,p_canceled_intent_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; target uuid;
begin
 select event_id into target from public.orders where id=p_order_id;
 perform 1 from public.events where id=target for update;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.order_kind<>'stripe' or o.status<>'pending' or o.reservation_released_at is not null
 or o.reservation_expires_at is null or o.reservation_expires_at>clock_timestamp()
 or o.payment_attempt is distinct from p_expected_attempt
 or p_canceled_intent_id is null or p_canceled_intent_id !~ '^pi_[a-zA-Z0-9]+$'
 or (o.stripe_payment_intent_id is not null and o.stripe_payment_intent_id<>p_canceled_intent_id) then return false; end if;
 update public.orders set reservation_released_at=clock_timestamp(),stripe_payment_intent_id=null,
 payment_attempt=payment_attempt+1,payment_attempt_started_at=clock_timestamp(),
 superseded_payment_intent_ids=array_append(superseded_payment_intent_ids,p_canceled_intent_id) where id=o.id;
 return true;
end $$;
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
    update public.orders set reservation_released_at=null,reservation_expires_at=clock_timestamp()+interval '15 minutes',
     payment_attempt_started_at=clock_timestamp(),purchase_access_hash=p_access_hash,
     submitted_name=p_name,submitted_email=p_email,referral_source=p_referral_source where id=o.id returning * into o;
   elsif e.ticket_capacity is not null and o.reservation_expires_at is null then
    update public.orders set reservation_expires_at=clock_timestamp()+interval '15 minutes' where id=o.id returning * into o;
   end if;
 else
   insert into public.orders(event_id,contact_id,ticket_type_id,amount_cents,currency,purchase_access_hash,
     submitted_name,submitted_email,submitted_phone,referral_source,gift_card_disclaimer_accepted,disclaimer_version)
   values(e.id,c,tt.id,tt.price_cents,tt.currency,p_access_hash,p_name,p_email,p_phone,p_referral_source,
     case when e.gift_card_disclaimer_version is not null then true else null end,e.gift_card_disclaimer_version)
   returning * into o;
   if e.ticket_capacity is not null then
    update public.orders set reservation_expires_at=clock_timestamp()+interval '15 minutes' where id=o.id returning * into o;
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
create or replace function public.process_ticket_payment(
 p_stripe_event_id text,p_event_type text,p_order_id uuid,p_event_id uuid,p_ticket_type_id uuid,
 p_intent_id text,p_amount integer,p_currency text,p_payment_status text,
 p_ticket_token text,p_ticket_code text
) returns text language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
 if p_event_type not in ('payment_intent.succeeded','payment_intent.payment_failed') then
 raise exception 'Unsupported event'; end if;
 insert into public.stripe_events(stripe_event_id,event_type) values(p_stripe_event_id,p_event_type)
 on conflict do nothing;
 if not found then return 'duplicate'; end if;
 perform 1 from public.events where id=p_event_id for update;
 select * into strict o from public.orders where id=p_order_id for update;
 if p_event_type='payment_intent.payment_failed' and p_intent_id=any(o.superseded_payment_intent_ids)
 and o.event_id=p_event_id and o.ticket_type_id=p_ticket_type_id
 and o.amount_cents=p_amount and o.currency=p_currency then return 'superseded'; end if;
 if o.order_kind='complimentary' and p_event_type='payment_intent.payment_failed'
 and p_intent_id=any(o.superseded_payment_intent_ids) then return 'superseded'; end if;
 if o.order_kind<>'stripe' then raise exception 'Not a Stripe order'; end if;
 if o.stripe_payment_intent_id is distinct from p_intent_id or o.event_id is distinct from p_event_id
 or o.ticket_type_id is distinct from p_ticket_type_id or o.amount_cents is distinct from p_amount
 or o.currency is distinct from p_currency then raise exception 'Payment verification failed'; end if;
 if p_event_type='payment_intent.payment_failed' then return 'failed'; end if;
 if p_payment_status is distinct from 'succeeded' then raise exception 'Payment not succeeded'; end if;
 if o.status='paid' and exists(select 1 from public.tickets where order_id=o.id) then return 'fulfilled'; end if;
 if o.reservation_released_at is not null then raise exception 'Reservation released'; end if;
 if o.status<>'pending' then raise exception 'Order cannot be fulfilled'; end if;
 update public.orders set status='paid',paid_at=now() where id=o.id;
 insert into public.tickets(order_id,event_id,contact_id,ticket_type_id,ticket_token,ticket_code)
 values(o.id,o.event_id,o.contact_id,o.ticket_type_id,p_ticket_token,p_ticket_code);
 return 'fulfilled';
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
  update public.orders set reservation_expires_at=clock_timestamp()+interval '15 minutes'
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
create or replace function public.admin_event_detail(p_event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('event',to_jsonb(e)-'check_in_pin_hash' || jsonb_build_object('has_check_in_pin',e.check_in_pin_hash is not null),
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
create or replace function public.admin_duplicate_event(p_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare source public.events%rowtype; copy_id uuid;
begin
 select * into strict source from public.events where id=p_event_id for share;
 insert into public.events(slug,name,description,event_date,venue_name,venue_address,starts_at,ends_at,timezone,status,rsvp_open,
 admission_mode,ticket_sales_open,gift_card_disclaimer_version,publish_at,ticket_capacity)
 values('draft-'||replace(gen_random_uuid()::text,'-',''),source.name,source.description,source.event_date,
 source.venue_name,source.venue_address,source.starts_at,source.ends_at,source.timezone,'draft',false,source.admission_mode,false,
 source.gift_card_disclaimer_version,(date_trunc('minute',statement_timestamp() at time zone source.timezone)+interval '2 days') at time zone source.timezone,source.ticket_capacity) returning id into copy_id;
 insert into public.ticket_types(event_id,name,description,price_cents,currency,active,sales_start_at,sales_end_at)
 select copy_id,name,description,price_cents,currency,active,sales_start_at,sales_end_at from public.ticket_types where event_id=p_event_id;
 -- No PIN/hash, people, registrations, payment IDs, email state or tickets are copied.
 return copy_id;
end;
$$;

create function public.admin_issue_complimentary_ticket(p_event_id uuid,p_name text,p_email text,p_phone text,
 p_issued_by uuid,p_access_hash text,p_ticket_token text,p_ticket_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; c uuid; tt public.ticket_types%rowtype; o public.orders%rowtype; t public.tickets%rowtype;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found or e.admission_mode<>'ticketed' or e.status in('cancelled','completed') or e.ends_at<=clock_timestamp()
 then return jsonb_build_object('status','unavailable'); end if;
 if p_name is null or char_length(p_name) not between 2 and 100 or p_name<>btrim(p_name)
 or p_email is null or p_email<>lower(btrim(p_email)) or char_length(p_email)>254
 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_phone is null or p_phone !~ '^\+[1-9][0-9]{1,14}$' or p_issued_by is null
 or p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$'
 or p_ticket_token is null or p_ticket_token !~ '^[a-f0-9]{64}$'
 or p_ticket_code is null or p_ticket_code !~ '^EST-[A-F0-9]{12}$' then return jsonb_build_object('status','invalid_input'); end if;
 select id into c from public.contacts where phone=p_phone;
 select * into o from public.orders where contact_id=c and event_id=e.id for update;
 if found then
  if o.status='paid' then
   select * into t from public.tickets where order_id=o.id;
   return jsonb_build_object('status','already_issued','order_id',o.id,'ticket_token',t.ticket_token,'ticket_code',t.ticket_code);
  end if;
  if o.status<>'pending' then return jsonb_build_object('status','unavailable'); end if;
  if o.reservation_released_at is null or o.stripe_payment_intent_id is not null then
   return jsonb_build_object('status','purchase_in_progress'); end if;
 end if;
 if e.ticket_capacity is not null and public.event_ticket_allocated(e.id)>=e.ticket_capacity
 then return jsonb_build_object('status','capacity_full'); end if;
 select * into tt from public.ticket_types where event_id=e.id order by active desc,created_at desc,id limit 1 for share;
 if not found then return jsonb_build_object('status','unavailable'); end if;
 insert into public.contacts(name,email,phone) values(p_name,p_email,p_phone) on conflict(phone) do nothing;
 select id into strict c from public.contacts where phone=p_phone for update;
 -- The contact may have been created for a different event while this transaction waited.
 if o.id is null then
  insert into public.orders(event_id,contact_id,ticket_type_id,amount_cents,currency,status,paid_at,order_kind,complimentary_issued_by,
   purchase_access_hash,submitted_name,submitted_email,submitted_phone,referral_source)
  values(e.id,c,tt.id,0,'usd','paid',clock_timestamp(),'complimentary',p_issued_by,p_access_hash,p_name,p_email,p_phone,'Other') returning * into o;
 else
  update public.orders set ticket_type_id=tt.id,amount_cents=0,status='paid',paid_at=clock_timestamp(),order_kind='complimentary',
   complimentary_issued_by=p_issued_by,purchase_access_hash=p_access_hash,
   submitted_name=p_name,submitted_email=p_email,submitted_phone=p_phone,referral_source='Other',
   gift_card_disclaimer_accepted=null,disclaimer_version=null
   where id=o.id returning * into o;
 end if;
 insert into public.tickets(order_id,event_id,contact_id,ticket_type_id,ticket_token,ticket_code)
 values(o.id,e.id,c,tt.id,p_ticket_token,p_ticket_code) returning * into t;
 update public.contacts set name=p_name,email=p_email where id=c;
 return jsonb_build_object('status','issued','order_id',o.id,'ticket_token',t.ticket_token,'ticket_code',t.ticket_code);
end $$;

create function public.claim_complimentary_ticket_email(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 with claimed as (
  update public.tickets t set email_attempted_at=clock_timestamp() from public.orders o
  where t.order_id=o.id and o.id=p_order_id and o.order_kind='complimentary' and o.status='paid' and t.status='valid'
   and t.email_attempted_at is null and t.email_sent_at is null returning t.*)
 select jsonb_build_object('recipient',o.submitted_email,'ticket_token',t.ticket_token,'ticket_code',t.ticket_code,
  'event_name',e.name,'event_date',e.event_date,'starts_at',e.starts_at,'ends_at',e.ends_at,'timezone',e.timezone,
  'venue_name',e.venue_name,'venue_address',e.venue_address,'ticket_type',tt.name,'amount_cents',o.amount_cents,'currency',o.currency)
 into payload from claimed t join public.orders o on o.id=t.order_id join public.events e on e.id=t.event_id
 join public.ticket_types tt on tt.id=t.ticket_type_id;
 return payload;
end $$;

create function public.check_ticket_reservation(p_event_slug text,p_access_hash text) returns text
language plpgsql stable security definer set search_path='' as $$
declare e public.events%rowtype; o public.orders%rowtype; tt public.ticket_types%rowtype;
begin
 select * into e from public.events where slug=p_event_slug;
 if not found or e.status<>'published' or e.publish_at>clock_timestamp() or e.admission_mode<>'ticketed' or not e.ticket_sales_open
 or e.starts_at<=clock_timestamp() or clock_timestamp()>=((e.event_date+time '17:00') at time zone 'America/New_York') then return 'closed'; end if;
 select * into tt from public.ticket_types where event_id=e.id and active;
 if not found or tt.sales_start_at>clock_timestamp() or tt.sales_end_at<=clock_timestamp() then return 'closed'; end if;
 select * into o from public.orders where event_id=e.id and purchase_access_hash=p_access_hash;
 if not found then return 'expired'; end if;
 if o.status='paid' then return 'open'; end if;
 if o.status<>'pending' then return 'closed'; end if;
 if e.ticket_capacity is not null and (o.reservation_released_at is not null or o.reservation_expires_at<=clock_timestamp()) then return 'expired'; end if;
 return 'open';
end $$;
create or replace function public.get_available_rsvp_events()
returns jsonb language sql stable security definer set search_path='' as $$
 with listed as (
 select e.*,public.event_ticket_allocated(e.id) allocated,exists(select 1 from public.orders o where o.event_id=e.id and o.status='pending' and o.reservation_released_at is null and o.reservation_expires_at<=clock_timestamp()) needs_cleanup,tt.sales_start_at ticket_sales_start_at,tt.price_cents,tt.currency,tt.name ticket_type_name,
 (e.admission_mode='rsvp' or (e.ticket_sales_open and (tt.sales_start_at is null or tt.sales_start_at<=clock_timestamp()) and e.starts_at>clock_timestamp()
 and clock_timestamp()<((e.event_date+time '17:00') at time zone 'America/New_York')
 and (tt.sales_end_at is null or tt.sales_end_at>clock_timestamp()))) sale_open
 from public.events e left join public.ticket_types tt on tt.event_id=e.id and tt.active
 where e.status='published' and e.publish_at<=clock_timestamp() and (
 (e.admission_mode='rsvp' and e.rsvp_open and e.starts_at>statement_timestamp()) or
 (e.admission_mode='ticketed' and e.ends_at>clock_timestamp() and tt.id is not null
 ))
 )
 select coalesce(jsonb_agg(jsonb_build_object(
 'slug',slug,'name',name,'event_date',event_date,'starts_at',starts_at,'ends_at',ends_at,
 'timezone',timezone,'venue_name',venue_name,'venue_address',venue_address,'open',sale_open and (ticket_capacity is null or allocated<ticket_capacity),
 'sold_out',admission_mode='ticketed' and ticket_capacity is not null and allocated>=ticket_capacity,
 'needs_reservation_cleanup',ticket_capacity is not null and needs_cleanup,
 'sales_closed',admission_mode='ticketed' and not sale_open and (ticket_sales_start_at is null or ticket_sales_start_at<=clock_timestamp()),
 'sales_not_started',admission_mode='ticketed' and coalesce(ticket_sales_start_at>clock_timestamp(),false),
 'disclaimer_version',gift_card_disclaimer_version,'admission_mode',admission_mode,
 'price_cents',price_cents,'currency',currency,'ticket_type_name',ticket_type_name
 ) order by starts_at,id),'[]'::jsonb) from listed;
$$;

-- Trusted server capabilities only. Never grant table CRUD or browser RPC access.
do $$ declare signature text; begin
 foreach signature in array array[
  'event_ticket_allocated(uuid)','guard_event_ticket_capacity()',
  'get_expired_ticket_reservations(text)','release_ticket_reservation(uuid,integer,text)',
  'admin_issue_complimentary_ticket(uuid,text,text,text,uuid,text,text,text)',
  'claim_complimentary_ticket_email(uuid)','check_ticket_reservation(text,text)'] loop
  execute format('alter function public.%s owner to postgres',signature);
  execute format('revoke all on function public.%s from public,anon,authenticated,service_role',signature);
  execute format('grant execute on function public.%s to service_role',signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
