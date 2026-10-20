// LOCAL ONLY. Starts a production Next server against the named local Docker DB.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
const exec = promisify(execFile);
const docker = process.env.LOCAL_DOCKER_BIN || '/Applications/Docker.app/Contents/Resources/bin/docker';
const db = 'supabase_db_el-solar-timbero';
async function sql(query) {
  return (await exec(docker,['exec',db,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',query])).stdout.trim();
}
// Use the current modern LOCAL secret, held only in memory. Never print status
// stdout (it contains credentials), and never fall back to a legacy JWT.
let localStatus;
try {
  localStatus = JSON.parse((await exec('./node_modules/.bin/supabase', ['status','--output','json'], {
    env: { ...process.env, PATH: dirname(docker) + ':' + process.env.PATH },
  })).stdout);
} catch { throw new Error('Could not read local Supabase status; verify Docker/CLI access.'); }
const key = localStatus.SECRET_KEY;
assert.ok(typeof key === 'string' && key.startsWith('sb_secret_'), 'Current local modern secret key not found');
const probe = await fetch('http://127.0.0.1:54321/rest/v1/rpc/get_available_rsvp_events', {
  method:'POST', headers:{apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json'},
  body:JSON.stringify({}),
});
assert.equal(probe.status,200,'Local RPC authentication/installation preflight failed');
const slug = 'local-browser-rsvp-test';
const phone = '+12025550194';
assert.equal(await sql(`select count(*) from public.contacts where phone='${phone}'`),'0','Test phone already exists');
await sql(`insert into public.events (slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,rsvp_open)
  values ('${slug}','LOCAL DEV — Browser RSVP Test',current_date+365,(current_date+365)::timestamp at time zone 'UTC',
  (current_date+366)::timestamp at time zone 'UTC','UTC','Local Test Venue','LOCAL ONLY','published',true)`);
const server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3117'],{
  env:{...process.env,SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',SUPABASE_SERVICE_ROLE_KEY:key,
    RSVP_ENABLED:'true'},stdio:['ignore','pipe','pipe'],
});
let browser;
try {
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Local server startup timed out')),20000);
    server.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready')) {clearTimeout(timeout);resolve();}});
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error('Local server exited '+code));});
  });
  browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:3117/?event=${slug}`);
  await page.getByRole('heading',{name:'LOCAL DEV — Browser RSVP Test'}).waitFor();
  await page.goto('http://127.0.0.1:3117');
  const discovery = await fetch('http://127.0.0.1:54321/rest/v1/rpc/get_available_rsvp_events', {
    method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',
  }).then(response=>response.json());
  const next = discovery.find(event=>event.disclaimer_version === null || event.disclaimer_version === '2026-10-12-v1');
  await page.getByRole('heading',{name:next.name,exact:true}).first().waitFor();
  if(next.slug !== slug) await page.getByRole('link').filter({hasText:'LOCAL DEV — Browser RSVP Test'}).click();
  await page.getByRole('heading',{name:'LOCAL DEV — Browser RSVP Test',exact:true}).waitFor();
  console.log('PASS automatic next event and database-driven event selection (no configured slug)');
  assert.equal(await page.locator('[name="giftCardDisclaimerAccepted"]').count(),0);
  async function fill() {
    await page.locator('[name="name"]').fill('Local Browser');
    await page.locator('[name="phone"]').fill(phone);
    await page.locator('[name="email"]').fill('local-browser@example.com');
    await page.locator('[name="referralSource"]').selectOption('Instagram');
  }
  await fill();
  await page.getByRole('button',{name:'RSVP',exact:true}).click();
  await page.getByText('Your RSVP has been confirmed.').waitFor();
  assert.equal(await sql(`select count(*) from public.rsvps where event_slug='${slug}' and phone='${phone}' and gift_card_disclaimer_accepted is null`),'1');
  console.log('PASS production Server Action -> local Supabase RPC -> success UI (no promotion)');
  await page.goto(`http://127.0.0.1:3117/?event=${slug}`);
  await fill();
  await page.getByRole('button',{name:'RSVP',exact:true}).click();
  await page.getByText('Looks like this phone number has already RSVP’d for this event.').waitFor();
  console.log('PASS duplicate returned to production UI');
  await page.goto(`http://127.0.0.1:3117/?event=${slug}`);
  await fill();
  // Close after rendering: stale/open form must not allow a direct server write.
  await sql(`update public.events set rsvp_open=false where slug='${slug}'`);
  await page.getByRole('button',{name:'RSVP',exact:true}).click();
  await page.getByText('RSVPs are now closed for this event.').first().waitFor();
  console.log('PASS event closed after render rejects Server Action submission');
} finally {
  if(browser) await browser.close();
  server.kill('SIGTERM');
  await sql(`delete from public.rsvps where event_slug='${slug}'; delete from public.events where slug='${slug}';
    delete from public.contacts where phone='${phone}'`);
}
