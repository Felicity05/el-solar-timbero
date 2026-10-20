// LOCAL ONLY: hard-coded Docker container. No project URLs, remote keys or db push.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const docker = process.env.LOCAL_DOCKER_BIN || '/Applications/Docker.app/Contents/Resources/bin/docker';
const container = 'supabase_db_el-solar-timbero';
const prefix = 'local-rpc-integration-';
async function sql(query) {
  const { stdout } = await exec(docker, ['exec', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  return stdout.trim();
}
const literal = v => v === null ? 'null' : typeof v === 'boolean' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
const phone = '+12025550191';
const phone2 = '+12025550192';
async function submit(event, number = phone, name = 'Local Test', email = 'local@example.com', accepted = false, version = null) {
  return sql(`set role service_role; select public.submit_normalized_rsvp(${[prefix+event,name,email,number,'Instagram',accepted,version].map(literal).join(',')});`)
    .then(s => s.split('\n').at(-1));
}
async function check(label, fn) { await fn(); console.log('PASS ' + label); }
const historyQuery = `select count(*)::text || ':' || coalesce(md5(jsonb_agg(to_jsonb(r) order by id)::text),'empty')
  from public.rsvps r where event_slug = 'cuban-night-social-2026-10-12'`;
const before = await sql(historyQuery);
// Do not touch prior fixtures/attendees with these identifiers.
assert.equal(await sql(`select count(*) from public.contacts where phone in (${literal(phone)},${literal(phone2)})`), '0', 'Fixture phones already exist; choose unused local test numbers');
try {
  for (const [name,status,open,promotion] of [['first','published',true,null],['second','published',true,null],['closed','published',false,null],['completed','completed',false,null],['promotion','published',true,'2026-10-12-v1'],['unsupported','published',true,'unknown-v1'],['failure','published',true,null]]) {
    await sql(`insert into public.events (slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,rsvp_open,gift_card_disclaimer_version)
      values (${literal(prefix+name)},'LOCAL ONLY — Integration Test',current_date+365,(current_date+365)::timestamp at time zone 'UTC',
      (current_date+366)::timestamp at time zone 'UTC','UTC','Local','LOCAL ONLY',${literal(status)},${open},${literal(promotion)});`);
  }
  await check('discovery includes all eligible events and excludes closed/completed events', async () => {
    const events = JSON.parse((await sql('set role service_role; select public.get_available_rsvp_events()')).split('\n').at(-1));
    const discovered = events.filter(event=>event.slug.startsWith(prefix)).map(event=>event.slug);
    assert.ok(discovered.includes(prefix+'first') && discovered.includes(prefix+'second'));
    assert.ok(!discovered.includes(prefix+'closed') && !discovered.includes(prefix+'completed'));
  });
  await check('new phone creates one contact and RSVP; no promotion stores null/null', async () => {
    assert.equal(await submit('first'), 'success');
    assert.equal(await sql(`select count(*) from public.contacts where phone=${literal(phone)}`), '1');
    assert.equal(await sql(`select count(*) from public.rsvps where phone=${literal(phone)} and gift_card_disclaimer_accepted is null and disclaimer_version is null`), '1');
  });
  const profile = await sql(`select to_jsonb(c)::text from public.contacts c where phone=${literal(phone)}`);
  await check('same event duplicate does not mutate contact or RSVP', async () => {
    assert.equal(await submit('first',phone,'Changed Name','changed@example.com'), 'duplicate');
    assert.equal(await sql(`select to_jsonb(c)::text from public.contacts c where phone=${literal(phone)}`), profile);
  });
  await check('different event reuses contact and updates profile while preserving snapshots', async () => {
    assert.equal(await submit('second',phone,'New Name','new@example.com'), 'success');
    assert.equal(await sql(`select count(distinct contact_id) from public.rsvps where phone=${literal(phone)}`), '1');
    assert.equal(await sql(`select email from public.contacts where phone=${literal(phone)}`), 'new@example.com');
    assert.equal(await sql(`select submitted_email from public.rsvps where phone=${literal(phone)} and event_slug=${literal(prefix+'first')}`), 'local@example.com');
  });
  await check('closed, completed, missing and unsupported events reject server calls', async () => {
    assert.equal(await submit('closed'), 'closed');
    assert.equal(await submit('completed'), 'closed');
    assert.equal(await submit('missing'), 'invalid_event');
    assert.equal(await submit('unsupported'), 'unsupported_disclaimer');
  });
  await check('promotion requires actual acknowledgment and the displayed supported version', async () => {
    assert.equal(await submit('promotion'), 'acknowledgment_required');
    assert.equal(await submit('promotion',phone,'Local Test','local@example.com',true,'stale'), 'acknowledgment_required');
    assert.equal(await submit('promotion',phone,'Local Test','local@example.com',true,'2026-10-12-v1'), 'success');
    assert.equal(await sql(`select count(*) from public.rsvps where event_slug=${literal(prefix+'promotion')} and gift_card_disclaimer_accepted is true and disclaimer_version='2026-10-12-v1'`), '1');
  });
  await check('8 independent concurrent database sessions create one contact and one RSVP', async () => {
    const results = await Promise.all(Array.from({length:8}, () => submit('first',phone2)));
    assert.equal(results.filter(r=>r==='success').length,1);
    assert.equal(results.filter(r=>r==='duplicate').length,7);
    assert.equal(await sql(`select count(*) from public.contacts where phone=${literal(phone2)}`), '1');
    assert.equal(await sql(`select count(*) from public.rsvps where phone=${literal(phone2)}`), '1');
  });
  await check('concurrent existing-contact registrations preserve duplicate profile', async () => {
    const before = await sql(`select to_jsonb(c)::text from public.contacts c where phone=${literal(phone2)}`);
    assert.ok((await Promise.all(Array.from({length:4}, () => submit('first',phone2,'Forged Name','forged@example.com')))).every(r=>r==='duplicate'));
    assert.equal(await sql(`select to_jsonb(c)::text from public.contacts c where phone=${literal(phone2)}`), before);
  });
  await check('unexpected insert failure rolls back a newly created contact', async () => {
    // Force only the test event to fail; remove this local constraint immediately.
    await sql(`alter table public.rsvps add constraint local_rpc_failure check (event_slug <> ${literal(prefix+'failure')})`);
    try {
      await assert.rejects(submit('failure','+12025550193'));
      assert.equal(await sql("select count(*) from public.contacts where phone='+12025550193'"),'0');
    } finally { await sql('alter table public.rsvps drop constraint local_rpc_failure'); }
  });
  await check('table access remains revoked; browser roles cannot execute either RPC', async () => {
    for (const role of ['anon','authenticated','service_role']) {
      assert.equal(await sql(`select count(*) from (values ('public.contacts'),('public.events'),('public.rsvps')) t(n)
        where has_table_privilege('${role}',n,'SELECT') or has_table_privilege('${role}',n,'INSERT') or has_table_privilege('${role}',n,'UPDATE') or has_table_privilege('${role}',n,'DELETE')`), '0');
      if(role!=='service_role') {
        await assert.rejects(sql(`set role ${role}; select public.get_available_rsvp_events()`));
        await assert.rejects(sql(`set role ${role}; select public.get_rsvp_event(${literal(prefix+'first')})`));
        await assert.rejects(sql(`set role ${role}; select public.submit_normalized_rsvp(${[prefix+'first','Local Test','local@example.com',phone,'Instagram',false,null].map(literal).join(',')})`));
      }
    }
  });
  await check('historical October RSVP rows remain unchanged', async () => assert.equal(await sql(historyQuery),before));
} finally {
  await sql(`delete from public.rsvps where event_slug like '${prefix}%';
    delete from public.events where slug like '${prefix}%';
    delete from public.contacts where phone in (${literal(phone)},${literal(phone2)});`);
}
console.log('Local integration checks passed; test fixtures removed.');
