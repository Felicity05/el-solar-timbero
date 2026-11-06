import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { hashDoorPin } from "../src/lib/check-in/security";

test("stored PIN encryption is randomized, event-bound and rejects tampering, key changes and missing configuration", () => {
  const script = `
 import assert from 'node:assert/strict';
 import {encryptDoorPin,decryptDoorPin} from './src/lib/admin/door-pin.ts';
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',secret='s'.repeat(64),pin='12345678';
 const first=encryptDoorPin(pin,id,secret),second=encryptDoorPin(pin,id,secret);
 assert.notEqual(first,second);assert.match(first,/^v1\\.[a-f0-9]{24}\\.[a-f0-9]{32}\\.[a-f0-9]{16}$/);
 assert.equal(decryptDoorPin(first,id,secret),pin);assert.equal(decryptDoorPin(second,id,secret),pin);
 assert.ok(!first.includes(pin));
 for(const bad of ['12345678','',first.slice(0,-1)+(first.endsWith('a')?'b':'a')]) assert.throws(()=>decryptDoorPin(bad,id,secret));
 assert.throws(()=>decryptDoorPin(first,other,secret));assert.throws(()=>decryptDoorPin(first,id,'t'.repeat(64)));
 assert.throws(()=>encryptDoorPin(pin,id,''));assert.throws(()=>encryptDoorPin('invalid',id,secret));assert.throws(()=>decryptDoorPin(first,id,''));
 assert.equal(decryptDoorPin(encryptDoorPin(pin,id.toUpperCase(),secret),id,secret),pin);
 `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("PIN storage remains server-only, ordinary admin reads omit credentials, and legacy hash writes invalidate old encrypted data", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;");
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const name of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort())
      await db.exec(readFileSync(new URL(name, directory), "utf8"));
    const id = (
      await db.query<{ id: string }>(`insert into public.events(slug,name,event_date,starts_at,ends_at,timezone,venue_name,venue_address,status,admission_mode)
  values('pin-storage','LOCAL ONLY PIN',current_date+365,(current_date+365+time '20:00') at time zone 'UTC',(current_date+365+time '23:30') at time zone 'UTC','UTC','Venue','Local','draft','ticketed') returning id`)
    ).rows[0].id;
    const hash = hashDoorPin("12345678"),
      cipher = `v1.${"a".repeat(24)}.${"b".repeat(32)}.${"c".repeat(16)}`;
    assert.equal((await db.query<{ ok: boolean }>("select public.admin_set_event_pin($1,$2,$3) ok", [id, hash, cipher])).rows[0].ok, true);
    const stored = (await db.query<{ value: { pin_hash: string; pin_ciphertext: string } }>("select public.admin_get_event_pin($1) value", [id])).rows[0].value;
    assert.deepEqual(stored, { pin_hash: hash, pin_ciphertext: cipher });
    for (const query of ["select public.admin_list_events() value", "select public.admin_event_detail($1) value"]) {
      const result = await db.query(query, query.includes("$1") ? [id] : []),
        json = JSON.stringify(result.rows);
      assert.ok(!json.includes(hash));
      assert.ok(!json.includes(cipher));
      assert.ok(!json.includes("check_in_pin_ciphertext"));
    }
    const copy = (await db.query<{ id: string }>("select public.admin_duplicate_event($1) id", [id])).rows[0].id;
    assert.deepEqual((await db.query<{ value: unknown }>("select public.admin_get_event_pin($1) value", [copy])).rows[0].value, { pin_hash: null, pin_ciphertext: null });
    await db.query("select public.admin_set_event_pin($1,$2)", [id, hashDoorPin("87654321")]);
    assert.equal((await db.query<{ value: { pin_ciphertext: null } }>("select public.admin_get_event_pin($1) value", [id])).rows[0].value.pin_ciphertext, null);
    for (const role of ["anon", "authenticated"])
      for (const fn of ["admin_get_event_pin(uuid)", "admin_set_event_pin(uuid,text,text)", "admin_list_complimentary_recipients(uuid)"])
        assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, `public.${fn}`])).rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
