import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("the server action rejects valid and forged submissions before request or database access", () => {
  // React's server condition allows the real server-only action to run in Node.
  // Outside a request, headers() would throw if the guard failed to run first.
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "tsx", "--input-type=module", "-e",
    `import assert from 'node:assert/strict';
     import { submitRsvp } from './src/app/actions.ts';
     import { RSVP_OPEN } from './src/lib/rsvp-config.ts';
     assert.equal(RSVP_OPEN, false);
     for (const fields of [{}, {
       name: 'María Pérez', phone: '2015550123', email: 'maria@example.com',
       referralSource: 'Instagram', giftCardDisclaimerAccepted: 'on', RSVP_OPEN: 'true'
     }]) {
       const data = new FormData();
       for (const [key, value] of Object.entries(fields)) data.set(key, value);
       const state = await submitRsvp('forged-event', { status: 'idle' }, data);
       assert.equal(state.status, 'error');
       assert.match(state.message, /RSVPs are now closed/);
       assert.equal(state.errors, undefined);
     }`,
  ], { encoding: "utf8", env: { ...process.env, RSVP_ENABLED: "false", NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
