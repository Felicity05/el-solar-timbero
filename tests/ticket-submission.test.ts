import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("ticket submission supports both database migrations and never cancels without recovery support", () => {
  const script = `
    import assert from 'node:assert/strict';
    import Stripe from 'stripe';
    import { createRequire } from 'node:module';
    import { initializePurchase, ticketFailure } from './src/lib/tickets/server.ts';
    const buyer={name:'Test Buyer',email:'test@example.com',phone:'+12025550111',referralSource:'Instagram'};
    let modern=false, owner=true, paid=false, order, intents, rpcCalls, stripeCalls;
    const base={status:'pending',order_id:'10000000-0000-4000-8000-000000000001',event_id:'10000000-0000-4000-8000-000000000002',ticket_type_id:'10000000-0000-4000-8000-000000000003',amount_cents:1000,currency:'usd',payment_intent_id:null};
    function reset(isModern){modern=isModern;owner=true;paid=false;order={...base,payment_attempt:0};intents=new Map();rpcCalls=[];stripeCalls=[];}
    const fakeStripeRequest=async function(method,path,params,options){
      stripeCalls.push({method,path,params,options});
      if(method==='POST'&&path==='/v1/payment_intents'){
        const id='pi_fixture'+intents.size;
        const pi={id,amount:params.amount,currency:params.currency,metadata:params.metadata,payment_method_types:['card'],status:'requires_payment_method',client_secret:id+'_secret_fixture'};
        intents.set(id,pi);return pi;
      }
      const id=path.split('/')[3];const pi=intents.get(id);assert.ok(pi,'known intent');
      if(path.endsWith('/cancel')){assert.ok(!['succeeded','processing'].includes(pi.status));pi.status='canceled';}
      return {...pi};
    };
    // tsx loads server TS through CJS while this isolated runner is ESM.
    // Patch both SDK module instances; no request can reach real Stripe.
    for(const SDK of [Stripe,createRequire(import.meta.url)('stripe')]) SDK.StripeResource.prototype._makeRequest=fakeStripeRequest;
    globalThis.fetch=async(input,init)=>{
      const name=String(input).split('/').at(-1),args=JSON.parse(init.body);rpcCalls.push({name,args});
      const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
      if(name==='initialize_ticket_order'){
        if(paid)return response({status:'already_purchased'});
        if(!modern&&!owner)return response({status:'pending_elsewhere'});
        const value={...order,status:owner?'pending':'recovery_required'};
        if(!modern)delete value.payment_attempt;
        return response(value);
      }
      if(name==='attach_ticket_payment_intent'){
        if(Object.hasOwn(args,'p_attempt')!==modern)return response({code:'PGRST202'},404);
        if(modern&&args.p_attempt!==order.payment_attempt)return response(false);
        order.payment_intent_id=args.p_intent_id;return response(true);
      }
      if(name==='recover_ticket_order'){
        assert.ok(modern,'must never invoke recovery before migration');
        assert.equal(intents.get(args.p_canceled_intent_id).status,'canceled');
        assert.equal(args.p_expected_attempt,order.payment_attempt);
        owner=true;order.payment_attempt++;order.payment_intent_id=null;return response(true);
      }
      throw Error('Unexpected RPC');
    };
    const submit=()=>initializePurchase('fixture-event',buyer,'a'.repeat(64));
    for(const schema of [false,true]){
      reset(schema);
      assert.equal((await submit()).status,'ready');
      const attachment=rpcCalls.find(c=>c.name==='attach_ticket_payment_intent').args;
      assert.equal(Object.hasOwn(attachment,'p_attempt'),schema);
      if(schema)assert.equal(attachment.p_attempt,0);
      assert.equal((await submit()).status,'ready');
      assert.equal(intents.size,1,'pending order reuses its intent');
      assert.equal(stripeCalls[0].params.amount,1000);
      assert.equal(stripeCalls[0].params.currency,'usd');
      assert.deepEqual(stripeCalls[0].params.payment_method_types,['card']);
      paid=true;assert.equal((await submit()).status,'already_purchased');assert.equal(intents.size,1);
    }
    reset(false);owner=false;
    assert.equal((await submit()).status,'error');assert.equal(stripeCalls.length,0);
    for(const mode of ['canceled','non-card']){
      reset(false);await submit();const pi=intents.get(order.payment_intent_id);
      if(mode==='canceled')pi.status='canceled';else pi.payment_method_types=['card','link'];
      assert.equal((await submit()).status,'error');
      assert.ok(!stripeCalls.some(c=>c.path.endsWith('/cancel')),'no cancellation without recovery migration');
      assert.ok(!rpcCalls.some(c=>c.name==='recover_ticket_order'));
    }
    reset(true);await submit();owner=false;
    const oldId=order.payment_intent_id;
    assert.equal((await submit()).status,'ready');
    assert.equal(intents.get(oldId).status,'canceled');assert.equal(intents.size,2);
    assert.equal(order.payment_attempt,1);
    const replacements=stripeCalls.filter(c=>c.method==='POST'&&c.path==='/v1/payment_intents');
    assert.equal(replacements[1].options.idempotencyKey,'ticket-order:'+order.order_id+':v1:attempt:1');
    for(const status of ['succeeded','processing']){
      reset(true);await submit();owner=false;
      intents.get(order.payment_intent_id).status=status;
      assert.equal((await submit()).status,status==='succeeded'?'already_purchased':'checking');
      assert.ok(!stripeCalls.some(c=>c.path.endsWith('/cancel')));
      assert.equal(intents.size,1);
    }
    const entries=[];console.error=(...args)=>entries.push(args);
    const message=ticketFailure('initialize',new Error('sensitive@example.com raw private error'));
    const diagnostic=JSON.parse(entries[0][1]);
    assert.ok(message.includes(diagnostic.reference));assert.equal(diagnostic.operation,'initialize');
    assert.ok(!JSON.stringify(entries).includes('sensitive@example.com'));
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:54329", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY: "test-only-placeholder-key", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_LIVE_MODE: "false" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
