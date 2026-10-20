import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("server diagnostics identify RPC, transport, schema and config failures without leaking sensitive data", () => {
  const script = `
    import assert from 'node:assert/strict';
    import { callRsvpRpc } from './src/lib/rsvp/rsvp-rpc.ts';
    import { getAvailableRsvpEvents, getRsvpEventForSubmission } from './src/lib/rsvp/rsvp-event.ts';
    import { RsvpDiagnosticError } from './src/lib/rsvp/rsvp-diagnostics.ts';
    const errors = []; const info = [];
    console.error = (_tag, entry) => errors.push(entry);
    console.info = (_tag, entry) => info.push(entry);
    const sensitive = 'private-person@example.com secret-key-value duplicate key SQL DETAIL';
    async function failure(action, stage, code) {
      const before = errors.length;
      await assert.rejects(action, error => {
        assert.ok(error instanceof RsvpDiagnosticError);
        assert.ok(!error.message.includes(sensitive));
        assert.equal(errors.at(-1).reference, error.reference);
        return true;
      });
      assert.equal(errors.length, before + 1, 'one correlated failure log per failed operation');
      assert.equal(errors.at(-1).stage, stage);
      assert.equal(errors.at(-1).code, code);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({code:'42501',message:sensitive,details:sensitive}),{status:401});
    await failure(() => getAvailableRsvpEvents(), 'rpc', '42501');
    assert.equal(errors.at(-1).operation, 'event.discovery');
    assert.equal(errors.at(-1).rpc, 'get_available_rsvp_events');
    assert.equal(errors.at(-1).host, '127.0.0.1:54321');
    assert.equal(errors.at(-1).status, 401);
    assert.match(errors.at(-1).hint, /service_role/);

    globalThis.fetch = async () => { throw new Error(sensitive); };
    await failure(() => callRsvpRpc('rsvp.submit','submit_normalized_rsvp', {p_email:sensitive}), 'transport', 'TRANSPORT');

    const event = { slug:'test-event',name:'Test Event',event_date:'2026-12-31',starts_at:'2027-01-01T01:00:00Z',
      ends_at:'2027-01-01T04:00:00Z',timezone:'America/New_York',venue_name:'Test',venue_address:'Test',open:true };
    globalThis.fetch = async () => new Response(JSON.stringify([event]),{status:200});
    await failure(() => getAvailableRsvpEvents(), 'response_validation', 'INVALID_RESPONSE');
    assert.deepEqual(errors.at(-1).issues,[{path:'0.disclaimer_version',code:'invalid_type'}]);

    globalThis.fetch = async () => new Response('[]',{status:200});
    assert.deepEqual(await getAvailableRsvpEvents(), []);
    globalThis.fetch = async () => new Response('null',{status:200});
    assert.equal(await getRsvpEventForSubmission('missing-event'),null);

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await failure(() => getAvailableRsvpEvents(), 'configuration', 'MISSING_KEY');
    process.env.SUPABASE_SERVICE_ROLE_KEY='sb_publishable_not_a_server_key';
    await failure(() => getAvailableRsvpEvents(), 'configuration', 'BROWSER_KEY');
    process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_DO_NOT_LOG_THIS_KEY';
    process.env.SUPABASE_URL='invalid-url-containing-private-information';
    await failure(() => getAvailableRsvpEvents(), 'configuration', 'INVALID_URL');
    const serialized = JSON.stringify({errors,info});
    for (const forbidden of [sensitive,'DO_NOT_LOG_THIS_KEY','invalid-url-containing-private-information','sb_publishable_not_a_server_key']) {
      assert.ok(!serialized.includes(forbidden), 'logs must exclude ' + forbidden);
    }
    assert.ok(info.some(entry=>entry.stage==='start'));
    assert.ok(info.some(entry=>entry.stage==='complete'));
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], {
    encoding: "utf8", env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_DO_NOT_LOG_THIS_KEY", RSVP_ENABLED: "true", RSVP_DEBUG: "true" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
