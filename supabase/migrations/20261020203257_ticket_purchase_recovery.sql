-- Safe recovery of abandoned/unpaid sessions. Never edits applied migrations.
begin;
set local lock_timeout = '5s';
alter table public.orders
 add column payment_attempt integer not null default 0 check (payment_attempt>=0),
 add column payment_attempt_started_at timestamptz not null default now(),
 add column superseded_payment_intent_ids text[] not null default '{}';
-- Preserve the original ambiguity window for existing, unlinked attempts.
update public.orders set payment_attempt_started_at=created_at;

create or replace function public.initialize_ticket_order(
 p_event_slug text,p_name text,p_email text,p_phone text,p_referral_source text,p_access_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events%rowtype; tt public.ticket_types%rowtype;
 c uuid; o public.orders%rowtype;
begin
 select * into e from public.events where slug=p_event_slug for share;
 if not found then return jsonb_build_object('status','invalid_event'); end if;
 if e.admission_mode <> 'ticketed' or e.status <> 'published' or not e.ticket_sales_open
 or e.starts_at <= clock_timestamp() then return jsonb_build_object('status','closed'); end if;
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
 insert into public.contacts(name,email,phone) values(p_name,p_email,p_phone) on conflict(phone) do nothing;
 select id into strict c from public.contacts where phone=p_phone for update;
 select * into o from public.orders where contact_id=c and event_id=e.id for update;
 if found then
   if o.status='paid' then return jsonb_build_object('status','already_purchased'); end if;
   if o.status<>'pending' then return jsonb_build_object('status','unavailable'); end if;
 else
   insert into public.orders(event_id,contact_id,ticket_type_id,amount_cents,currency,purchase_access_hash,
     submitted_name,submitted_email,submitted_phone,referral_source)
   values(e.id,c,tt.id,tt.price_cents,tt.currency,p_access_hash,p_name,p_email,p_phone,p_referral_source)
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

drop function public.attach_ticket_payment_intent(uuid,text,text);
create function public.attach_ticket_payment_intent(p_order_id uuid,p_access_hash text,p_intent_id text,p_attempt integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order_id and purchase_access_hash=p_access_hash for update;
 if not found or o.status<>'pending' or o.payment_attempt is distinct from p_attempt or p_intent_id is null or p_intent_id !~ '^pi_[a-zA-Z0-9]+$' then return false; end if;
 if o.stripe_payment_intent_id is not null and o.stripe_payment_intent_id<>p_intent_id then
 raise exception 'PaymentIntent association conflict'; end if;
 update public.orders set stripe_payment_intent_id=p_intent_id where id=o.id;
 return true;
end $$;

-- Called ONLY after the server has verified Stripe reports this attempt canceled.
-- Stripe cancellation prevents the old browser from completing payment before
-- this compare-and-swap rotates authorization and advances the payment attempt.
create function public.recover_ticket_order(
 p_order_id uuid,p_expected_attempt integer,p_canceled_intent_id text,p_access_hash text,
 p_name text,p_email text,p_phone text,p_referral_source text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
 if p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$'
 or p_canceled_intent_id is null or p_canceled_intent_id !~ '^pi_[a-zA-Z0-9]+$'
 or p_name is null or char_length(p_name) not between 2 and 100 or p_name<>btrim(p_name)
 or p_email is null or p_email<>lower(btrim(p_email)) or char_length(p_email)>254
 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_phone is null or p_phone !~ '^\+[1-9][0-9]{1,14}$'
 or p_referral_source is null or p_referral_source not in
 ('Instagram','WhatsApp','Friend / Word of mouth','Guantanamera','Dance class / studio','Other')
 then return false; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.status<>'pending' or o.payment_attempt is distinct from p_expected_attempt
 or o.submitted_phone<>p_phone
 or (o.stripe_payment_intent_id is not null and o.stripe_payment_intent_id<>p_canceled_intent_id)
 then return false; end if;
 update public.orders set purchase_access_hash=p_access_hash,stripe_payment_intent_id=null,
 payment_attempt=payment_attempt+1,payment_attempt_started_at=clock_timestamp(),
 superseded_payment_intent_ids=array_append(superseded_payment_intent_ids,p_canceled_intent_id),
 submitted_name=p_name,submitted_email=p_email,submitted_phone=p_phone,referral_source=p_referral_source
 where id=o.id;
 -- No profile or paid/ticket mutation here. Phone matching alone never grants
 -- access to a previously paid order or its confirmation.
 return true;
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
 select * into strict o from public.orders where id=p_order_id for update;
 if p_event_type='payment_intent.payment_failed' and p_intent_id=any(o.superseded_payment_intent_ids)
 and o.event_id=p_event_id and o.ticket_type_id=p_ticket_type_id
 and o.amount_cents=p_amount and o.currency=p_currency then return 'superseded'; end if;
 if o.stripe_payment_intent_id is distinct from p_intent_id or o.event_id is distinct from p_event_id
 or o.ticket_type_id is distinct from p_ticket_type_id or o.amount_cents is distinct from p_amount
 or o.currency is distinct from p_currency then raise exception 'Payment verification failed'; end if;
 if p_event_type='payment_intent.payment_failed' then return 'failed'; end if;
 if p_payment_status is distinct from 'succeeded' then raise exception 'Payment not succeeded'; end if;
 if o.status='paid' and exists(select 1 from public.tickets where order_id=o.id) then return 'fulfilled'; end if;
 if o.status<>'pending' then raise exception 'Order cannot be fulfilled'; end if;
 update public.orders set status='paid',paid_at=now() where id=o.id;
 insert into public.tickets(order_id,event_id,contact_id,ticket_type_id,ticket_token,ticket_code)
 values(o.id,o.event_id,o.contact_id,o.ticket_type_id,p_ticket_token,p_ticket_code);
 return 'fulfilled';
end $$;

alter function public.attach_ticket_payment_intent(uuid,text,text,integer) owner to postgres;
alter function public.recover_ticket_order(uuid,integer,text,text,text,text,text,text) owner to postgres;
revoke all on function public.attach_ticket_payment_intent(uuid,text,text,integer),
 public.recover_ticket_order(uuid,integer,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.attach_ticket_payment_intent(uuid,text,text,integer),
 public.recover_ticket_order(uuid,integer,text,text,text,text,text,text) to service_role;
-- CREATE OR REPLACE preserves existing owners and restricted grants on the
-- initialize/fulfillment functions. Direct table access remains revoked.
notify pgrst,'reload schema';
commit;
