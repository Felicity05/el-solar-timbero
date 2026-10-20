-- New migration: never rewrite the applied normalization migration.
begin;
set local lock_timeout = '5s';
alter table public.events add column gift_card_disclaimer_version text
  check (char_length(gift_card_disclaimer_version) between 1 and 100
    and gift_card_disclaimer_version = btrim(gift_card_disclaimer_version));
update public.events set gift_card_disclaimer_version = '2026-10-12-v1'
where slug = 'cuban-night-social-2026-10-12';

-- One public RPC, no wrapper or additional role. Owner executes bounded SQL only.
create function public.submit_normalized_rsvp(
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
  if v_event.status <> 'published' or not v_event.rsvp_open
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

-- Server-rendered form needs only this safe projection, never contact data.
create function public.get_rsvp_event(p_event_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('slug',slug,'name',name,'event_date',event_date,
    'starts_at',starts_at,'ends_at',ends_at,'timezone',timezone,
    'venue_name',venue_name,'venue_address',venue_address,
    'open',status = 'published' and rsvp_open and starts_at > statement_timestamp(),
    'disclaimer_version',gift_card_disclaimer_version)
  from public.events where slug = p_event_slug;
$$;
alter function public.get_rsvp_event(text) owner to postgres;
revoke all on function public.get_rsvp_event(text) from public, anon, authenticated, service_role;
grant execute on function public.get_rsvp_event(text) to service_role;
-- Explicitly retain the normalization security boundary, including defaults.
revoke all on public.contacts, public.events, public.rsvps from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
