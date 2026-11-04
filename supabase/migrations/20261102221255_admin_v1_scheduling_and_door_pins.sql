-- Admin V1: configuration only. Sold tickets, credentials and payment records are untouched.
begin;
set local lock_timeout = '5s';
alter table public.events add column publish_at timestamptz,
  add column check_in_pin_hash text check (check_in_pin_hash ~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$');
-- Preserve existing visibility in event order. Legacy published ticketed events
-- receive consecutive windows, so later events wait until the previous one ends.
update public.events set publish_at = least(created_at, starts_at);
with ordered as (
  select id, max(ends_at) over (order by starts_at,id rows between unbounded preceding and 1 preceding) previous_end
  from public.events where status='published' and admission_mode='ticketed'
)
update public.events e set publish_at=greatest(e.publish_at,o.previous_end) from ordered o where o.id=e.id;
alter table public.events alter column publish_at set default now(), alter column publish_at set not null;
alter table public.events add constraint events_publish_time_check check (
  isfinite(publish_at) and (status<>'published' or publish_at<ends_at));
-- Static range exclusion also prevents FUTURE scheduled collisions, atomically.
-- Back-to-back windows may share a boundary; no clock-based partial index/cron.
alter table public.events add constraint events_one_public_ticketed_window
  exclude using gist (tstzrange(publish_at,ends_at,'[)') with &&)
  where (status='published' and admission_mode='ticketed');
create index events_publication_idx on public.events(publish_at,starts_at) where status='published';

create function public.admin_list_events() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg((to_jsonb(e)-'check_in_pin_hash') || jsonb_build_object('has_check_in_pin',e.check_in_pin_hash is not null,
 'display_status',case when e.status='published' and e.ends_at<=statement_timestamp() then 'Ended' when e.status='published' and e.publish_at>statement_timestamp() then 'Scheduled' else e.status end)
 order by e.starts_at desc,e.id),'[]'::jsonb) from public.events e;
$$;
create function public.admin_event_detail(p_event_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('event',to_jsonb(e)-'check_in_pin_hash' || jsonb_build_object('has_check_in_pin',e.check_in_pin_hash is not null),
 'ticket_type',(select to_jsonb(tt) from public.ticket_types tt where tt.event_id=e.id order by tt.active desc,tt.created_at desc,tt.id limit 1),
 'metrics',jsonb_build_object(
   'tickets_sold',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid'),
   'gross_revenue_cents',(select coalesce(sum(o.amount_cents),0) from public.orders o where o.event_id=e.id and o.status='paid'),
   'checked_in',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid' and t.checked_in_at is not null),
   'not_checked_in',(select count(*) from public.tickets t join public.orders o on o.id=t.order_id where t.event_id=e.id and t.status='valid' and o.status='paid' and t.checked_in_at is null),
   'rsvps',(select count(*) from public.rsvps r where r.event_id=e.id)))
 from public.events e where e.id=p_event_id;
$$;
create function public.admin_save_event(p_event_id uuid,p_config jsonb) returns uuid
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
 gift_card_disclaimer_version=nullif(p_config->>'gift_card_disclaimer_version','') where id=v_event_id;
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
create function public.admin_duplicate_event(p_event_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare source public.events%rowtype; copy_id uuid;
begin
 select * into strict source from public.events where id=p_event_id for share;
 insert into public.events(slug,name,description,event_date,venue_name,venue_address,starts_at,ends_at,timezone,status,rsvp_open,
 admission_mode,ticket_sales_open,gift_card_disclaimer_version,publish_at)
 values(left(source.slug,100)||'-copy-'||substr(replace(gen_random_uuid()::text,'-',''),1,8),source.name,source.description,source.event_date,
 source.venue_name,source.venue_address,source.starts_at,source.ends_at,source.timezone,'draft',false,source.admission_mode,false,
 source.gift_card_disclaimer_version,source.publish_at) returning id into copy_id;
 insert into public.ticket_types(event_id,name,description,price_cents,currency,active,sales_start_at,sales_end_at)
 select copy_id,name,description,price_cents,currency,active,sales_start_at,sales_end_at from public.ticket_types where event_id=p_event_id;
 -- No PIN/hash, people, registrations, payment IDs, email state or tickets are copied.
 return copy_id;
end;
$$;
create function public.admin_set_event_pin(p_event_id uuid,p_pin_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_pin_hash is null or p_pin_hash !~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$' then raise exception 'Invalid hash' using errcode='22023'; end if;
 update public.events set check_in_pin_hash=p_pin_hash where id=p_event_id;
 return found;
end;
$$;
create function public.get_active_door_event() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('slug',slug,'pin_hash',check_in_pin_hash) from public.events
 where status='published' and admission_mode='ticketed' and publish_at<=clock_timestamp() and ends_at>clock_timestamp()
 and check_in_pin_hash is not null order by starts_at,id limit 1;
$$;

-- Every new capability remains server-only. No general table CRUD is granted.
revoke all on function public.admin_list_events(),public.admin_event_detail(uuid),public.admin_save_event(uuid,jsonb),
 public.admin_duplicate_event(uuid),public.admin_set_event_pin(uuid,text),public.get_active_door_event() from public,anon,authenticated,service_role;
grant execute on function public.admin_list_events(),public.admin_event_detail(uuid),public.admin_save_event(uuid,jsonb),
 public.admin_duplicate_event(uuid),public.admin_set_event_pin(uuid,text),public.get_active_door_event() to service_role;

-- Revalidate publication inside both existing transactional write operations.
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
 'payment_intent_id',o.stripe_payment_intent_id,'payment_attempt',o.payment_attempt);
end $$;

alter function public.initialize_ticket_order(text,text,text,text,text,text,boolean,text) owner to postgres;
revoke all on function public.initialize_ticket_order(text,text,text,text,text,text,boolean,text)
 from public,anon,authenticated,service_role;
grant execute on function public.initialize_ticket_order(text,text,text,text,text,text,boolean,text) to service_role;

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
     or v_event.publish_at > clock_timestamp() or v_event.starts_at <= clock_timestamp() then return 'closed'; end if;

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




create or replace function public.get_available_rsvp_events()
returns jsonb language sql stable security definer set search_path='' as $$
 with listed as (
 select e.*,tt.price_cents,tt.currency,tt.name ticket_type_name,
 (e.admission_mode='rsvp' or (e.ticket_sales_open and e.starts_at>clock_timestamp()
 and clock_timestamp()<((e.event_date+time '17:00') at time zone 'America/New_York')
 and (tt.sales_end_at is null or tt.sales_end_at>clock_timestamp()))) sale_open
 from public.events e left join public.ticket_types tt on tt.event_id=e.id and tt.active
 where e.status='published' and e.publish_at<=clock_timestamp() and (
 (e.admission_mode='rsvp' and e.rsvp_open and e.starts_at>statement_timestamp()) or
 (e.admission_mode='ticketed' and e.ends_at>clock_timestamp() and tt.id is not null
 and (tt.sales_start_at is null or tt.sales_start_at<=clock_timestamp())))
 )
 select coalesce(jsonb_agg(jsonb_build_object(
 'slug',slug,'name',name,'event_date',event_date,'starts_at',starts_at,'ends_at',ends_at,
 'timezone',timezone,'venue_name',venue_name,'venue_address',venue_address,'open',sale_open,
 'sales_closed',admission_mode='ticketed' and not sale_open,
 'disclaimer_version',gift_card_disclaimer_version,'admission_mode',admission_mode,
 'price_cents',price_cents,'currency',currency,'ticket_type_name',ticket_type_name
 ) order by starts_at,id),'[]'::jsonb) from listed;
$$;


create or replace function public.get_rsvp_event(p_event_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('slug',slug,'name',name,'event_date',event_date,
 'starts_at',starts_at,'ends_at',ends_at,'timezone',timezone,'venue_name',venue_name,'venue_address',venue_address,
 'open',admission_mode='rsvp' and status='published' and publish_at<=statement_timestamp() and rsvp_open and starts_at>statement_timestamp(),
 'disclaimer_version',gift_card_disclaimer_version)
 from public.events where slug=p_event_slug and publish_at<=statement_timestamp();
$$;


create or replace function public.validate_door_ticket(p_event_slug text, p_credential text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidate as (
    select t.ticket_code, t.checked_in_at, tt.name as ticket_type,
      e.name as event_name, e.timezone,
      case
        when e.slug is distinct from p_event_slug then 'wrong_event'
        when e.admission_mode <> 'ticketed' or e.status <> 'published' or e.publish_at > clock_timestamp() or e.ends_at <= clock_timestamp() then 'event_unavailable'
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


notify pgrst, 'reload schema';
commit;
