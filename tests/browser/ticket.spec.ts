import { test, expect } from "@playwright/test";
import Stripe from "stripe";

// Deliberate browser-side Stripe.js test double. It never simulates a real card
// payment. Real SDK/server/webhook/DB behavior is covered separately.
const mockStripeJs = `window.Stripe=function(){return {
 _registerWrapper(){},registerAppInfo(){},createToken(){},createPaymentMethod(){},confirmCardPayment(){},
 elements(){return {create(type,options){window.__paymentOptions=options;const listeners={};let frame;return {
   on(event,cb){listeners[event]=cb;},off(){},update(){},destroy(){frame?.remove();},
   mount(node){frame=document.createElement('iframe');frame.title='Stripe payment fields (test double)';frame.srcdoc='<p>Secure payment fields — test double</p>';node.appendChild(frame);setTimeout(()=>listeners.ready?.(),50);}
 };},update(){},submit:async()=>({})};},
 confirmPayment:async()=>window.__decline?{error:{message:'Your card was declined.'}}:{paymentIntent:{status:'succeeded'}}
};};`;
test.beforeEach(async({request,page})=>{
 await request.post('http://127.0.0.1:54329/reset');await request.post('http://127.0.0.1:54329/ticket-mode');
 await page.route('https://js.stripe.com/**',route=>route.fulfill({contentType:'application/javascript',body:mockStripeJs}));
});
test('ticket CTA stays on page; styled $10 form initializes once and embeds Payment Element',async({page,request})=>{
 await page.goto('/?event=browser-ticket-event');
 const before=await (await request.get('http://127.0.0.1:54329/ticket-state')).json();expect(before.orders).toHaveLength(0);
 await expect(page.getByRole('button',{name:'Get Ticket',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Get Ticket',exact:true}).click();
 await expect(page.locator('#ticket-name')).toBeFocused();expect(page.url()).toContain('/?event=browser-ticket-event');
 await expect(page.locator('#ticket-purchase')).toContainText('General Admission');await expect(page.locator('#ticket-purchase')).toContainText('$10');
 await expect(page.locator('input[name=quantity],select[name=quantity]')).toHaveCount(0);
 await page.getByLabel('Name',{exact:true}).fill('Test Buyer');await page.getByLabel('Phone number',{exact:true}).fill('2015550123');await page.getByLabel('Email',{exact:true}).fill('buyer@example.com');
 expect((await (await request.get('http://127.0.0.1:54329/ticket-state')).json()).orders).toHaveLength(0);
 await page.locator('#ticket-purchase form').first().evaluate(form=>{for(const [name,value]of [['price','1'],['event_id','forged'],['amount_cents','1']]){const i=document.createElement('input');i.name=name;i.value=value;form.appendChild(i);}});
 await page.getByLabel('How did you hear about us?').selectOption('Instagram');
 await expect(page.getByRole('button',{name:'Buy Now',exact:true})).toBeEnabled();
 await expect(page.locator('#ticket-purchase iframe')).toHaveCount(1);
 await expect(page.locator('#ticket-name')).toBeDisabled();
 await page.waitForTimeout(1200);
 const state=await (await request.get('http://127.0.0.1:54329/ticket-state')).json();
 expect(state.orders).toHaveLength(1);expect(state.intents).toHaveLength(1);expect(state.intents[0].amount).toBe(1000);expect(state.intents[0].currency).toBe('usd');expect(state.intents[0].payment_method_types).toEqual(['card']);
 expect(await page.evaluate(()=>(window as unknown as {__paymentOptions:unknown}).__paymentOptions)).toEqual({wallets:{applePay:'never',googlePay:'never',link:'never'}});
 await page.evaluate(()=>{(window as unknown as {__decline:boolean}).__decline=true;});
 await page.getByRole('button',{name:'Buy Now',exact:true}).click();await expect(page.locator('#ticket-purchase').getByRole('alert')).toContainText('declined');
 await page.evaluate(()=>{(window as unknown as {__decline:boolean}).__decline=false;});
 await page.getByRole('button',{name:'Buy Now',exact:true}).click();
 await expect(page.getByText("Payment received — we're preparing your ticket.",{exact:true})).toBeVisible();
 const payload=JSON.stringify({id:'evt_browser_success',type:'payment_intent.succeeded',livemode:false,data:{object:{...state.intents[0],status:'succeeded',amount_received:1000}}});
 const signature=new Stripe('sk_test_fixture').webhooks.generateTestHeaderString({payload,secret:'whsec_fixture'});
 for(let i=0;i<2;i++){const response=await request.post('/api/stripe/webhook',{data:payload,headers:{'Content-Type':'application/json','stripe-signature':signature}});expect(response.status()).toBe(200);}
 await expect(page.getByRole('heading',{name:"You're in!",exact:true})).toBeVisible();await expect(page.getByText(/^EST-[A-F0-9]{12}$/)).toBeVisible();
 await expect(page.getByText('Save or screenshot this confirmation and bring it with you.')).toBeVisible();
});
test('RSVP event keeps RSVP form and never shows payment controls',async({page})=>{
 await page.goto('/?event=browser-test-event');await expect(page.getByRole('button',{name:'RSVP',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Get Ticket',exact:true})).toHaveCount(0);await expect(page.locator('#ticket-purchase')).toHaveCount(0);
});
