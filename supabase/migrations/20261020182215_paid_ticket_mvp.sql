-- Additive paid-ticket MVP. Existing RSVP rows and applied migrations are untouched.
begin;
set local lock_timeout = '5s';
alter table public.events add column admission_mode text not null default 'rsvp'
  check (admission_mode in ('rsvp','ticketed'));
alter table public.events add column ticket_sales_open boolean not null default false;

create table public.ticket_types (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete restrict,
 name text not null check (char_length(btrim(name)) between 1 and 100),
 description text,
 price_cents integer not null check (price_cents > 0),
 currency text not null default 'usd' check (currency = 'usd'),
 active boolean not null default true,
 sales_start_at timestamptz, sales_end_at timestamptz,
 created_at timestamptz not null default now(),
 unique(id,event_id),
 check (sales_start_at is null or sales_end_at is null or sales_end_at > sales_start_at)
);
-- At most one active type; initialization/discovery also require one to exist.
create unique index ticket_types_one_active_per_event on public.ticket_types(event_id) where active;
create index ticket_types_event_idx on public.ticket_types(event_id);

create table public.orders (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete restrict,
 contact_id uuid not null references public.contacts(id) on delete restrict,
 ticket_type_id uuid not null,
 amount_cents integer not null check (amount_cents > 0),
 currency text not null check (currency = 'usd'),
 status text not null default 'pending' check (status in ('pending','paid','refunded','void')),
 stripe_payment_intent_id text unique,
 -- Bearer credential hash, never a phone-based authorization check.
 purchase_access_hash text not null check (purchase_access_hash ~ '^[a-f0-9]{64}$'),
 submitted_name text not null, submitted_email text not null, submitted_phone text not null,
 referral_source text not null,
 created_at timestamptz not null default now(), paid_at timestamptz,
 unique(contact_id,event_id),
 unique(event_id,purchase_access_hash),
 unique(id,event_id,contact_id,ticket_type_id),
 foreign key(ticket_type_id,event_id) references public.ticket_types(id,event_id) on delete restrict,
 check (status <> 'paid' or (paid_at is not null and stripe_payment_intent_id is not null))
);
create index orders_event_idx on public.orders(event_id);
create index orders_ticket_type_idx on public.orders(ticket_type_id);

create table public.tickets (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique,
 event_id uuid not null references public.events(id) on delete restrict,
 contact_id uuid not null references public.contacts(id) on delete restrict,
 ticket_type_id uuid not null references public.ticket_types(id) on delete restrict,
 ticket_token text not null unique check (ticket_token ~ '^[a-f0-9]{64}$'),
 ticket_code text not null unique check (ticket_code ~ '^EST-[A-F0-9]{12}$'),
 status text not null default 'valid' check (status in ('valid','refunded','void')),
 created_at timestamptz not null default now(), checked_in_at timestamptz,
 unique(contact_id,event_id),
 foreign key(order_id,event_id,contact_id,ticket_type_id)
 references public.orders(id,event_id,contact_id,ticket_type_id) on delete restrict
);
create index tickets_event_idx on public.tickets(event_id);
create index tickets_ticket_type_idx on public.tickets(ticket_type_id);
create table public.stripe_events (
 stripe_event_id text primary key, event_type text not null,
 processed_at timestamptz not null default now()
);
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;
alter table public.stripe_events enable row level security;
revoke all on public.ticket_types,public.orders,public.tickets,public.stripe_events
 from public,anon,authenticated,service_role;

create function public.initialize_ticket_order(
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
   if o.purchase_access_hash<>p_access_hash then return jsonb_build_object('status','pending_elsewhere'); end if;
 else
   insert into public.orders(event_id,contact_id,ticket_type_id,amount_cents,currency,purchase_access_hash,
     submitted_name,submitted_email,submitted_phone,referral_source)
   values(e.id,c,tt.id,tt.price_cents,tt.currency,p_access_hash,p_name,p_email,p_phone,p_referral_source)
   returning * into o;
   update public.contacts set name=p_name,email=p_email where id=c;
 end if;
 -- Fixed Stripe idempotency keys are only retained >=24h. Never blindly retry
 -- an ambiguous, unlinked creation after that window: reconcile it manually.
 if o.stripe_payment_intent_id is null and o.created_at < now()-interval '23 hours' then
 return jsonb_build_object('status','reconciliation_required'); end if;
 return jsonb_build_object('status','pending','order_id',o.id,'event_id',o.event_id,
 'ticket_type_id',o.ticket_type_id,'amount_cents',o.amount_cents,'currency',o.currency,
 'payment_intent_id',o.stripe_payment_intent_id);
end $$;

create function public.attach_ticket_payment_intent(p_order_id uuid,p_access_hash text,p_intent_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order_id and purchase_access_hash=p_access_hash for update;
 if not found or o.status<>'pending' or p_intent_id is null or p_intent_id !~ '^pi_[a-zA-Z0-9]+$' then return false; end if;
 if o.stripe_payment_intent_id is not null and o.stripe_payment_intent_id<>p_intent_id then
 raise exception 'PaymentIntent association conflict'; end if;
 update public.orders set stripe_payment_intent_id=p_intent_id where id=o.id;
 return true;
end $$;

-- Only the signature-verified webhook calls this RPC. All state changes share
-- one DB transaction. Exceptions roll back event dedupe and fulfillment together.
create function public.process_ticket_payment(
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

create function public.get_ticket_purchase(p_event_slug text,p_access_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('status',o.status,'ticket_code',t.ticket_code,'ticket_status',t.status,
 'event_name',e.name,'event_date',e.event_date,'starts_at',e.starts_at,'ends_at',e.ends_at,
 'timezone',e.timezone,'venue_name',e.venue_name,'venue_address',e.venue_address,
 'ticket_type',tt.name,'amount_cents',o.amount_cents,'currency',o.currency)
 from public.orders o join public.events e on e.id=o.event_id
 join public.ticket_types tt on tt.id=o.ticket_type_id left join public.tickets t on t.order_id=o.id
 where e.slug=p_event_slug and o.purchase_access_hash=p_access_hash;
$$;

create or replace function public.get_available_rsvp_events()
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'slug',e.slug,'name',e.name,'event_date',e.event_date,'starts_at',e.starts_at,'ends_at',e.ends_at,
 'timezone',e.timezone,'venue_name',e.venue_name,'venue_address',e.venue_address,'open',true,
 'disclaimer_version',e.gift_card_disclaimer_version,'admission_mode',e.admission_mode,
 'price_cents',tt.price_cents,'currency',tt.currency,'ticket_type_name',tt.name
 ) order by e.starts_at,e.id),'[]'::jsonb)
 from public.events e left join public.ticket_types tt on tt.event_id=e.id and tt.active
 where e.status='published' and e.starts_at>statement_timestamp() and
 ((e.admission_mode='rsvp' and e.rsvp_open) or
 (e.admission_mode='ticketed' and e.ticket_sales_open and tt.id is not null
 and (tt.sales_start_at is null or tt.sales_start_at<=statement_timestamp())
 and (tt.sales_end_at is null or tt.sales_end_at>statement_timestamp())));
$$;
create or replace function public.submit_normalized_rsvp(
  p_event_slug text, p_name text, p_email text, p_phone text,
  p_referral_source text, p_disclaimer_accepted boolean,
  p_displayed_disclaimer_version text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_contact_id uuid;
  v_rsvp_id uuid;
begin
  select * into v_event from public.events where slug = p_event_slug for share;
  if not found then return 'invalid_event'; end if;
  if v_event.admission_mode <> 'rsvp' or v_event.status <> 'published' or not v_event.rsvp_open
     or v_event.starts_at <= clock_timestamp() then return 'closed'; end if;

  -- The app performs country-aware parsing. RPC accepts canonical data only.
  if p_name is null or char_length(p_name) not between 2 and 100 or p_name <> btrim(p_name)
     or p_email is null or char_length(p_email) not between 3 and 254
     or p_email <> lower(btrim(p_email))
     or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or p_phone is null or p_phone !~ '^\+[1-9][0-9]{1,14}$'
     or p_referral_source is null or p_referral_source not in (
       'Instagram','WhatsApp','Friend / Word of mouth','Guantanamera','Dance class / studio','Other')
  then return 'invalid_input'; end if;

  if v_event.gift_card_disclaimer_version is not null then
    if v_event.gift_card_disclaimer_version <> '2026-10-12-v1' then
      return 'unsupported_disclaimer';
    end if;
    if p_disclaimer_accepted is distinct from true
       or p_displayed_disclaimer_version is distinct from v_event.gift_card_disclaimer_version then
      return 'acknowledgment_required';
    end if;
  end if;

  insert into public.contacts (name,email,phone) values (p_name,p_email,p_phone)
  on conflict (phone) do nothing;
  select id into strict v_contact_id from public.contacts where phone = p_phone for update;
  -- All writers of this operation lock event then contact. A duplicate never
  -- updates profile values or timestamps. Unique pair is the final safeguard.
  if exists (select 1 from public.rsvps where contact_id = v_contact_id and event_id = v_event.id) then
    return 'duplicate';
  end if;
  insert into public.rsvps (
    contact_id,event_id,submitted_name,submitted_email,submitted_phone,
    name,email,phone,event_slug,referral_source,gift_card_disclaimer_accepted,disclaimer_version
  ) values (
    v_contact_id,v_event.id,p_name,p_email,p_phone,
    p_name,p_email,p_phone,v_event.slug,p_referral_source,
    case when v_event.gift_card_disclaimer_version is not null then true else null end,
    v_event.gift_card_disclaimer_version
  ) on conflict on constraint rsvps_contact_event_key do nothing
  returning id into v_rsvp_id;
  if v_rsvp_id is null then return 'duplicate'; end if;
  update public.contacts set name = p_name, email = p_email where id = v_contact_id;
  return 'success';
  -- No catch-all handler: unexpected failures roll back the entire RPC.
end;
$$;
alter function public.submit_normalized_rsvp(text,text,text,text,text,boolean,text) owner to postgres;
revoke all on function public.submit_normalized_rsvp(text,text,text,text,text,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_normalized_rsvp(text,text,text,text,text,boolean,text) to service_role;


-- The legacy lookup remains compatible but cannot open a ticketed RSVP form.
create or replace function public.get_rsvp_event(p_event_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('slug',slug,'name',name,'event_date',event_date,
 'starts_at',starts_at,'ends_at',ends_at,'timezone',timezone,'venue_name',venue_name,'venue_address',venue_address,
 'open',admission_mode='rsvp' and status='published' and rsvp_open and starts_at>statement_timestamp(),
 'disclaimer_version',gift_card_disclaimer_version)
 from public.events where slug=p_event_slug;
$$;

alter function public.initialize_ticket_order(text,text,text,text,text,text) owner to postgres;
alter function public.attach_ticket_payment_intent(uuid,text,text) owner to postgres;
alter function public.process_ticket_payment(text,text,uuid,uuid,uuid,text,integer,text,text,text,text) owner to postgres;
alter function public.get_ticket_purchase(text,text) owner to postgres;
revoke all on function public.initialize_ticket_order(text,text,text,text,text,text),
 public.attach_ticket_payment_intent(uuid,text,text),
 public.process_ticket_payment(text,text,uuid,uuid,uuid,text,integer,text,text,text,text),
 public.get_ticket_purchase(text,text) from public,anon,authenticated,service_role;
grant execute on function public.initialize_ticket_order(text,text,text,text,text,text),
 public.attach_ticket_payment_intent(uuid,text,text),
 public.process_ticket_payment(text,text,uuid,uuid,uuid,text,integer,text,text,text,text),
 public.get_ticket_purchase(text,text) to service_role;
notify pgrst,'reload schema';
commit;
