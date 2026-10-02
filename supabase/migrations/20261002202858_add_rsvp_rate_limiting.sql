-- Shared atomic counters. Store keyed hashes rather than raw phones/IPs.
create schema if not exists rsvp_private;
revoke all on schema rsvp_private from public, anon, authenticated;
grant usage on schema rsvp_private to service_role;
create table rsvp_private.rsvp_rate_limits (
  scope text not null check (scope in ('global', 'ip', 'phone')),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null,
  primary key (scope, key_hash)
);
create index rsvp_rate_limits_expiry_idx on rsvp_private.rsvp_rate_limits (expires_at);
alter table rsvp_private.rsvp_rate_limits enable row level security;
revoke all on rsvp_private.rsvp_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on rsvp_private.rsvp_rate_limits to service_role;

-- Returns 0 if allowed, otherwise the remaining wait in seconds.
-- Invoker privileges: only the server's service role may use these counters.
create function public.consume_rsvp_rate_limit(p_scope text, p_key_hash text)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  max_attempts integer;
  window_seconds integer;
  v_now timestamptz := clock_timestamp();
  counter rsvp_private.rsvp_rate_limits%rowtype;
begin
  case p_scope
    when 'global' then max_attempts := 100; window_seconds := 60;
    when 'ip' then max_attempts := 10; window_seconds := 600;
    when 'phone' then max_attempts := 5; window_seconds := 900;
    else raise exception 'Invalid rate limit scope' using errcode = '22023';
  end case;
  -- Bounded, indexed cleanup: no scheduled job required.
  delete from rsvp_private.rsvp_rate_limits where (scope, key_hash) in (
    select old.scope, old.key_hash from rsvp_private.rsvp_rate_limits old
    where old.expires_at < v_now - interval '1 day'
    order by old.expires_at limit 100 for update skip locked
  );
  insert into rsvp_private.rsvp_rate_limits as limits (scope, key_hash, attempts, expires_at)
  values (p_scope, p_key_hash, 1, v_now + make_interval(secs => window_seconds))
  on conflict (scope, key_hash) do update set
    attempts = case when limits.expires_at <= v_now then 1
      else least(limits.attempts + 1, max_attempts + 1) end,
    expires_at = case when limits.expires_at <= v_now
      then v_now + make_interval(secs => window_seconds) else limits.expires_at end
  returning * into counter;
  if counter.attempts > max_attempts then
    return greatest(1, ceil(extract(epoch from counter.expires_at - v_now))::integer);
  end if;
  return 0;
end;
$$;
revoke all on function public.consume_rsvp_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_rsvp_rate_limit(text, text) to service_role;
