// Local review artifact only. Screenshots use fake providers/attendees, not live payments.
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('test-results/screenshots');
const views=['desktop','mobile'];
const entries=new Map();
for(const view of views) for(const name of await readdir(path.join(root,view))) {
  if(!/^(rsvp|ticket)-[a-z0-9-]+\.png$/.test(name))continue;
  const state=name.slice(0,-4);
  if(!entries.has(state))entries.set(state,new Map());
  entries.get(state).set(view,`${view}/${name}`);
}
const sorted=[...entries].sort(([a],[b])=>a.localeCompare(b));
const label=state=>state.replace(/^rsvp-/,'RSVP — ').replace(/^ticket-/,'Ticket — ').replaceAll('-',' ');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>El Solar — RSVP and ticket states</title>
<style>body{font:16px system-ui;background:#f6efdf;color:#182c3a;margin:24px}header{max-width:1000px}article{margin:32px 0;border-top:1px solid #9a8266;padding-top:12px}.views{display:flex;gap:24px;align-items:start;flex-wrap:wrap}figure{margin:0;max-width:650px}img{display:block;max-width:100%;height:420px;object-fit:contain;object-position:top;background:white;border:1px solid #9a8266}figcaption{margin:8px 0}a{color:inherit}</style>
<header><h1>El Solar Timbero — screen states</h1><p>${sorted.length} states, ${sorted.reduce((n,[,v])=>n+v.size,0)} screenshots. Click an image for full resolution.</p><p>Generated from the actual app with isolated local fixtures. Stripe fields are a clearly labeled test double, not a real card-entry screenshot. These runs do not consume local Supabase/Stripe limits or prove a live payment.</p></header>
${sorted.map(([state,files])=>`<article id="${state}"><h2>${label(state)}</h2><div class="views">${views.filter(view=>files.has(view)).map(view=>`<figure><a href="${files.get(view)}"><img loading="lazy" src="${files.get(view)}" alt="${label(state)} — ${view}"></a><figcaption>${view}</figcaption></figure>`).join('')}</div></article>`).join('')}</html>`;
await writeFile(path.join(root,'index.html'),html);
await writeFile(path.join(root,'README.md'),`# RSVP and ticket screen states\n\nOpen index.html for the desktop/mobile gallery. Each PNG is a full-page capture of the real app with local test fixtures. Stripe iframe contents are a labeled test double. No real rate limits or live payments are used. Synthetic ticket QR credentials are fixtures, not customer tickets.\n\nRegenerate: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:screenshots\n\n${sorted.map(([state,files])=>`- ${label(state)}: ${views.filter(v=>files.has(v)).map(v=>`[${v}](${files.get(v)})`).join(' · ')}`).join('\n')}\n`);
console.log(`Saved ${sorted.length} states to test-results/screenshots/index.html`);
