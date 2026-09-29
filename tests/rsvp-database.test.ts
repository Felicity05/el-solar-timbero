import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../supabase/migrations/20260929170927_create_rsvps.sql", import.meta.url), "utf8");
const columns = ["event_slug", "name", "phone", "email", "referral_source", "gift_card_disclaimer_accepted", "disclaimer_version"];
const insert = `insert into public.rsvps (${columns.join(",")}) values ($1,$2,$3,$4,$5,$6,$7)`;
const valid = ["cuban-night-social-2026-10-12", "María Pérez", "+12015550123", "maria@example.com", "Instagram", true, "2026-10-12-v1"];

test("migration enforces event-scoped duplicates, constraints, defaults, and API access", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;");
    await db.exec(migration);
    await db.exec("set role service_role");
    await db.query(insert, valid);
    // Neither a changed name nor a changed email bypasses event/phone uniqueness.
    const duplicate = [...valid]; duplicate[1] = "Different name"; duplicate[3] = "different@example.com";
    await assert.rejects(db.query(insert, duplicate), (e: { code?: string; constraint?: string }) => e.code === "23505" && e.constraint === "rsvps_event_phone_key");
    // The same contact may attend a future event.
    const futureEvent = [...valid]; futureEvent[0] = "cuban-night-social-2026-11-09";
    await db.query(insert, futureEvent);
    // A shared email does not prevent another phone from registering.
    const sharedEmail = [...valid]; sharedEmail[2] = "+12015550124";
    await db.query(insert, sharedEmail);
    await assert.rejects(db.query("select * from public.rsvps"), (e: { code?: string }) => e.code === "42501");
    await assert.rejects(db.query("update public.rsvps set name = 'Tampered'"), (e: { code?: string }) => e.code === "42501");
    await assert.rejects(db.query("delete from public.rsvps"), (e: { code?: string }) => e.code === "42501");
    await db.exec("reset role");
    const saved = await db.query<{ id: string; created_at: Date; name: string }>("select id, created_at, name from public.rsvps");
    assert.equal(saved.rows.length, 3);
    for (const row of saved.rows) {
      assert.match(row.id, /^[0-9a-f-]{36}$/);
      assert.ok(row.created_at);
      assert.equal(row.name, "María Pérez");
    }
    for (const [index, value] of [[0, ""], [0, "Invalid Event"], [1, " "], [1, " Untrimmed "], [2, "invalid"], [2, "2015550123"], [3, "not-email"], [3, "UPPER@example.com"], [4, "Forged"], [5, false], [6, ""]] as const) {
      const row = [...valid]; row[2] = "+12015550125"; row[index] = value;
      await assert.rejects(db.query(insert, row), (e: { code?: string }) => e.code === "23514");
    }
    for (let index = 0; index < columns.length; index++) {
      const row: (string | boolean | null)[] = [...valid]; row[2] = "+12015550125"; row[index] = null;
      await assert.rejects(db.query(insert, row), (e: { code?: string }) => e.code === "23502");
    }
    // Omission must not silently accept the disclaimer or choose an event.
    await assert.rejects(db.query("insert into public.rsvps (event_slug, name, phone, email, referral_source, disclaimer_version) values ($1,$2,$3,$4,$5,$6)", [...valid.slice(0, 5), valid[6]]), (e: { code?: string }) => e.code === "23502");
    await assert.rejects(db.query("insert into public.rsvps (name, phone, email, referral_source, gift_card_disclaimer_accepted, disclaimer_version) values ($1,$2,$3,$4,$5,$6)", valid.slice(1)), (e: { code?: string }) => e.code === "23502");
    const metadata = await db.query<{ column_name: string; is_nullable: string; column_default: string | null }>("select column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'rsvps'");
    assert.equal(metadata.rows.length, 9);
    assert.ok(metadata.rows.every(column => column.is_nullable === "NO"));
    assert.equal(metadata.rows.find(column => column.column_name === "gift_card_disclaimer_accepted")?.column_default, null);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select * from public.rsvps"), (e: { code?: string }) => e.code === "42501");
      await assert.rejects(db.query(insert, valid), (e: { code?: string }) => e.code === "42501");
      await assert.rejects(db.query("update public.rsvps set name = 'Tampered'"), (e: { code?: string }) => e.code === "42501");
      await assert.rejects(db.query("delete from public.rsvps"), (e: { code?: string }) => e.code === "42501");
      await db.exec("reset role");
    }
    const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = 'public.rsvps'::regclass");
    assert.equal(rls.rows[0].relrowsecurity, true);
  } finally { await db.close(); }
});
