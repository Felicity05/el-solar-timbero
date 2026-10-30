import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

for (const rsvpEnabled of ["true", "false"]) {
  test(`ticket discovery preserves Nov 9 and recurring disclosures with RSVP_ENABLED=${rsvpEnabled}`, () => {
    const script = `
      import assert from 'node:assert/strict';
      import { getAvailableRsvpEvents,getRsvpEventForSubmission } from './src/lib/rsvp/rsvp-event.ts';
      const event = {
        slug: 'cuban-night-social-2026-11-09', name: 'Nov 9 Event',
        event_date: '2026-11-09', starts_at: '2026-11-10T01:00:00Z', ends_at: '2026-11-10T04:30:00Z',
        timezone: 'America/New_York', venue_name: 'Test Venue', venue_address: 'Test Address',
        admission_mode: 'ticketed', rsvp_open: false, open: true, sales_closed: false,
        disclaimer_version: '2026-11-09-v1', price_cents: 1000, currency: 'usd', ticket_type_name: 'General Admission'
      };
      const rows = [event,
        {...event,slug:'closed-ticket',open:false,sales_closed:true},
        {...event,slug:'future-ticket',disclaimer_version:'future-offer-v2'},
        {...event,slug:'rsvp-event',admission_mode:'rsvp',disclaimer_version:null},
        {...event,slug:'rsvp-recurring',admission_mode:'rsvp',disclaimer_version:'unknown'},
        {...event,slug:'unavailable-ticket',open:false},
        {...event,slug:'missing-price',price_cents:null},
        {...event,slug:'wrong-currency',currency:'eur'},
        {...event,slug:'missing-type',ticket_type_name:null}
      ];
      let lookup = {...event,admission_mode:'rsvp',disclaimer_version:'future-rsvp-v3'};
      globalThis.fetch = async (input) => {
        if(String(input).endsWith('/rpc/get_rsvp_event')) return new Response(JSON.stringify(lookup),{status:200,headers:{'content-type':'application/json'}});
        assert.ok(String(input).endsWith('/rpc/get_available_rsvp_events'));
        return new Response(JSON.stringify(rows), {status:200,headers:{'content-type':'application/json'}});
      };
      const events = await getAvailableRsvpEvents();
      assert.deepEqual(events.map(e=>e.slug), ['cuban-night-social-2026-11-09','closed-ticket','future-ticket',
        ...(process.env.RSVP_ENABLED==='true'?['rsvp-event','rsvp-recurring']:[])]);
      assert.equal(events[0].disclaimer_version,'2026-11-09-v1');
      assert.equal(events[0].price_cents,1000);
      const selected=await getRsvpEventForSubmission(event.slug);
      assert.equal(selected?.disclaimer_version??null,process.env.RSVP_ENABLED==='true'?'future-rsvp-v3':null);
      lookup={...lookup,admission_mode:'ticketed'};
      assert.equal(await getRsvpEventForSubmission(event.slug),null);
      lookup={...lookup,admission_mode:'rsvp',open:false};
      assert.equal(await getRsvpEventForSubmission(event.slug),null);
    `;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, RSVP_ENABLED: rsvpEnabled, SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture_only" },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
