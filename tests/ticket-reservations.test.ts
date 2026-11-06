import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("reservation cleanup releases only after confirmed cancellation, preserves succeeded/processing/ambiguous payments and uses a guarded attempt", () => {
  const code = `
 import assert from 'node:assert/strict';import Stripe from 'stripe';import {createRequire} from 'node:module';
 import {cleanupExpiredReservations} from './src/lib/tickets/reservations.ts';
 const base={order_id:'10000000-0000-4000-8000-000000000001',event_id:'10000000-0000-4000-8000-000000000002',ticket_type_id:'10000000-0000-4000-8000-000000000003',amount_cents:1000,currency:'usd',status:'pending',payment_intent_id:'pi_expired',payment_attempt:2,payment_attempt_started_at:new Date().toISOString()};
 let status='requires_payment_method',calls=[],released=false,effectiveReleases=0,fail=false,old=false,unlinked=false;
 console.error=()=>{};
 const request=async function(method,path,params){
  calls.push(path);
  if(path.endsWith('/cancel')){if(fail)throw new Error('private failure');status='canceled';}
  return {id:'pi_expired',amount:1000,currency:'usd',metadata:{order_id:base.order_id,event_id:base.event_id,ticket_type_id:base.ticket_type_id},status,payment_method_types:['card']};
 };
 for(const SDK of [Stripe,createRequire(import.meta.url)('stripe')]) SDK.StripeResource.prototype._makeRequest=request;
 global.fetch=async(input,init)=>{
  const name=String(input).split('/').at(-1),args=JSON.parse(init.body);
  if(name==='get_expired_ticket_reservations') return Response.json([{...base,payment_intent_id:unlinked?null:base.payment_intent_id,payment_attempt_started_at:old?'2020-01-01T00:00:00Z':base.payment_attempt_started_at}]);
  if(name==='release_ticket_reservation') {assert.equal(status,'canceled','Stripe cancellation must precede inventory release');assert.equal(args.p_expected_attempt,2);assert.equal(args.p_canceled_intent_id,'pi_expired');if(!released)effectiveReleases++;released=true;return Response.json(true);}
  throw new Error('Unexpected RPC '+name);
 };
 for(const state of ['requires_payment_method','requires_action','succeeded','processing']){
  status=state;calls=[];released=false;
  await cleanupExpiredReservations('event');
  assert.equal(released,['requires_payment_method','requires_action'].includes(state));
  assert.equal(calls.some(c=>c.endsWith('/cancel')),released);
 }
 status='requires_payment_method';fail=true;released=false;await cleanupExpiredReservations('event');assert.equal(released,false);fail=false;
 unlinked=true;old=true;released=false;calls=[];await cleanupExpiredReservations('event');assert.equal(released,false);assert.equal(calls.length,0,'never recreate an ambiguous intent after idempotency retention');
 unlinked=false;old=false;status='requires_payment_method';released=false;effectiveReleases=0;
 await Promise.all([cleanupExpiredReservations('event'),cleanupExpiredReservations('event')]);assert.equal(effectiveReleases,1);
 `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", code], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY: "fixture-only", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_LIVE_MODE: "false" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
