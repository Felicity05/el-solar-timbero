import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("real webhook route verifies raw signatures, rejects live events and retries failed fulfillment",()=>{
 const result=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","--input-type=module","-e",`
  import assert from 'node:assert/strict';
  import Stripe from 'stripe';
  import { POST } from './src/app/api/stripe/webhook/route.ts';
  const stripe = new Stripe('sk_test_fixture');
  let calls=[]; let fail=false;
  global.fetch=async(input,init)=>{
    calls.push({url:String(input),body:JSON.parse(init.body)});
    return new Response(JSON.stringify(fail ? {code:'XX000'} : 'fulfilled'),{status:fail?500:200,headers:{'Content-Type':'application/json'}});
  };
  const body={id:'evt_local',type:'payment_intent.succeeded',livemode:false,data:{object:{id:'pi_local',amount:1000,amount_received:1000,currency:'usd',status:'succeeded',metadata:{order_id:'10000000-0000-4000-8000-000000000001',event_id:'10000000-0000-4000-8000-000000000002',ticket_type_id:'10000000-0000-4000-8000-000000000003'}}}};
  function request(payload, signed=true){const raw=JSON.stringify(payload);return new Request('http://localhost/api/stripe/webhook',{method:'POST',body:raw,headers:signed?{'stripe-signature':stripe.webhooks.generateTestHeaderString({payload:raw,secret:'whsec_fixture'})}:{}});}
  assert.equal((await POST(request(body,false))).status,400); assert.equal(calls.length,0);
  assert.equal((await POST(request({...body,livemode:true}))).status,400); assert.equal(calls.length,0);
  assert.equal((await POST(request(body))).status,200); assert.equal(calls.length,1);
  assert.equal(calls[0].body.p_amount,1000); assert.equal(calls[0].body.p_intent_id,'pi_local');
  assert.match(calls[0].body.p_ticket_token,/^[a-f0-9]{64}$/);
  assert.equal((await POST(request({...body,type:'payment_intent.payment_failed',data:{object:{...body.data.object,status:'requires_payment_method'}}}))).status,200);
  assert.equal(calls[1].body.p_event_type,'payment_intent.payment_failed');
  const before=calls.length;
  assert.equal((await POST(request({...body,data:{object:{...body.data.object,amount_received:999}}}))).status,500);assert.equal(calls.length,before);
  fail=true;assert.equal((await POST(request(body))).status,500);
  const raw=JSON.stringify(body);const signature=stripe.webhooks.generateTestHeaderString({payload:raw,secret:'wrong'});
  assert.equal((await POST(new Request('http://localhost/api/stripe/webhook',{method:'POST',body:raw,headers:{'stripe-signature':signature}}))).status,400);
 `],{encoding:"utf8",env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54329",SUPABASE_URL:"http://127.0.0.1:54329",SUPABASE_SERVICE_ROLE_KEY:"test-only-key",STRIPE_SECRET_KEY:"sk_test_fixture",STRIPE_WEBHOOK_SECRET:"whsec_fixture",STRIPE_LIVE_MODE:"false"}});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
