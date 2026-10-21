import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("server email embeds the existing QR credential once; Gmail failures never invalidate a paid ticket", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import QRCode from 'qrcode';
    import nodemailer from 'nodemailer';
    import {deliverTicketEmail,ticketEmailMessage,ticketEmailFrom} from './src/lib/tickets/email.ts';
    const token='a'.repeat(64),url='https://elsolartimbero.com/tickets/'+token+'?view=card';
    const ticket={recipient:'snapshot@example.com',ticket_token:token,ticket_code:'EST-123456ABCDEF',event_name:'LOCAL ONLY <Ticket Event>',event_date:'2027-12-30',starts_at:'2027-12-31T01:00:00Z',ends_at:'2027-12-31T04:00:00Z',timezone:'America/New_York',venue_name:'Test venue',venue_address:'LOCAL ONLY address',ticket_type:'General Admission',amount_cents:1000,currency:'usd'};
    assert.deepEqual(ticketEmailFrom('sender@example.com','El Solar Tickets'),{name:'El Solar Tickets',address:'sender@example.com'});
    assert.deepEqual(ticketEmailFrom('sender@example.com'),{name:'El Solar Timbero',address:'sender@example.com'});
    assert.deepEqual(ticketEmailFrom('sender@example.com','alias@example.com'),{name:'El Solar Timbero',address:'alias@example.com'});
    assert.deepEqual(ticketEmailFrom('sender@example.com','El Solar <alias@example.com>'),{name:'El Solar',address:'alias@example.com'});
    assert.throws(()=>ticketEmailFrom('sender@example.com','Name\\r\\nBcc:evil@example.com'));
    const message=await ticketEmailMessage(ticket,'sender@example.com');
    assert.equal(message.to.address,'snapshot@example.com');
    for(const text of ['El Solar Timbero',"You're in!",'General Admission','$10','EST-123456ABCDEF','All ticket sales are final and non-refundable.','December 30, 2027','8:00 PM EST','Test venue','LOCAL ONLY address']) assert.ok(message.text.includes(text),text);
    assert.ok(message.html.includes('LOCAL ONLY &lt;Ticket Event&gt;'));
    assert.ok(message.html.includes('cid:ticket-qr@elsolartimbero'));
    assert.ok(message.html.includes('href="'+url+'"'));
    assert.ok(message.text.includes(url));
    assert.equal(message.attachments.length,1);
    assert.deepEqual(message.attachments[0].content,await QRCode.toBuffer(url,{type:'png',width:560,margin:4,errorCorrectionLevel:'M'}));
    assert.equal(message.html.includes(ticket.recipient),false);
    const transport=nodemailer.createTransport({streamTransport:true,buffer:true});
    const mime=await transport.sendMail(message);
    assert.match(mime.message.toString(),/Content-ID: <ticket-qr@elsolartimbero>/);
    let claimed=false,sent=false,emails=0,fail=false;const logs=[];
    console.error=(...args)=>logs.push(args.join(' '));
    global.fetch=async(input,init)=>{
      const name=String(input).split('/').at(-1);
      if(name==='claim_ticket_email') {if(claimed)return Response.json(null);claimed=true;return Response.json(ticket);}
      if(name==='mark_ticket_email_sent') {sent=true;return Response.json(true);}
      throw new Error('Unexpected database write');
    };
    const sender=()=>({from:'sender@example.com',send:async()=>{emails++;if(fail)throw new Error('private recipient secret smtp password');return {accepted:['snapshot@example.com'],rejected:[]};}});
    await Promise.all(Array.from({length:8},()=>deliverTicketEmail('order','intent',sender)));
    assert.equal(emails,1);assert.equal(sent,true);
    await deliverTicketEmail('order','intent',sender);assert.equal(emails,1);
    claimed=false;sent=false;fail=true;
    await deliverTicketEmail('order2','intent2',sender);assert.equal(sent,false);
    await deliverTicketEmail('order2','intent2',sender);assert.equal(emails,2);
    assert.ok(logs.some(log=>log.includes('email.send')));
    assert.equal(logs.join('').includes('private recipient secret'),false);
    delete process.env.GMAIL_USER;delete process.env.GMAIL_APP_PASSWORD;
    claimed=false;await deliverTicketEmail('order3','intent3');assert.equal(claimed,false);
  `,
    ],
    { encoding: "utf8", env: { ...process.env, SITE_URL: "https://elsolartimbero.com", SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY: "test-only-key" } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
