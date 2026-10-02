import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { clientIp, rateLimitKey } from "../src/lib/rsvp-rate-limit";
import { processRsvp, eventSlug } from "../src/lib/rsvp-submit";
import { disclaimerVersion } from "../src/lib/rsvp";

function submission(phone = "2015550123") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "María Pérez", phone, email: "maria@example.com", referralSource: "Instagram", giftCardDisclaimerAccepted: "on" })) data.set(key, value);
  return data;
}

test("IP identity ignores spoofed headers unless a trusted hosting proxy is configured", () => {
  const headers = new Headers({ "x-forwarded-for": "198.51.100.1", "x-vercel-forwarded-for": "203.0.113.1" });
  assert.equal(clientIp(headers, {}), "unknown");
  assert.equal(clientIp(headers, { vercel: "1" }), "203.0.113.1");
  assert.equal(clientIp(headers, { trustedHeader: "x-forwarded-for" }), "198.51.100.1");
  for (const value of ["", "malicious", "198.51.100.1, 203.0.113.1"]) {
    headers.set("x-vercel-forwarded-for", value);
    assert.equal(clientIp(headers, { vercel: "1" }), "unknown");
  }
  headers.set("x-vercel-forwarded-for", "2001:0db8:0000:0000:0000:0000:0000:0001");
  const canonical = clientIp(headers, { vercel: "1" });
  headers.set("x-vercel-forwarded-for", "2001:db8::1");
  assert.equal(clientIp(headers, { vercel: "1" }), canonical);
});

test("counter keys are deterministic keyed hashes separated by scope", () => {
  const key = rateLimitKey("phone", "+12015550123", "secret");
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, rateLimitKey("phone", "+12015550123", "secret"));
  assert.notEqual(key, rateLimitKey("phone", "+12015550123", "other-secret"));
  assert.notEqual(key, rateLimitKey("ip", "+12015550123", "secret"));
  assert.throws(() => rateLimitKey("ip", "unknown", ""));
});

test("database limits serialize attempts, expire, isolate keys, cap counters, and deny browser access", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(readFileSync(new URL("../supabase/migrations/20261002202858_add_rsvp_rate_limiting.sql", import.meta.url), "utf8"));
    await db.exec("set role service_role");
    const consume = async (scope: string, key = "a".repeat(64)) => {
      const result = await db.query<{ wait: number }>("select public.consume_rsvp_rate_limit($1, $2) as wait", [scope, key]);
      return result.rows[0].wait;
    };
    for (const [scope, limit, window] of [["ip", 10, 600], ["phone", 5, 900], ["global", 100, 60]] as const) {
      // Queue overlapping callers against the real atomic SQL, rather than a JS counter.
      const waits = await Promise.all(Array.from({ length: limit + 4 }, () => consume(scope)));
      assert.equal(waits.filter(wait => wait === 0).length, limit);
      assert.ok(waits.slice(limit).every(wait => wait > 0 && wait <= window));
      const row = await db.query<{ attempts: number }>("select attempts from rsvp_private.rsvp_rate_limits where scope = $1", [scope]);
      assert.equal(row.rows[0].attempts, limit + 1);
      assert.equal(await consume(scope, "b".repeat(64)), 0);
      await db.query("update rsvp_private.rsvp_rate_limits set expires_at = now() - interval '1 second' where scope = $1", [scope]);
      assert.equal(await consume(scope), 0);
    }
    await assert.rejects(consume("forged"), (error: { code?: string }) => error.code === "22023");
    await assert.rejects(consume("ip", "raw-phone"), (error: { code?: string }) => error.code === "23514");
    await db.exec("update rsvp_private.rsvp_rate_limits set expires_at = now() - interval '2 days'");
    await consume("ip");
    assert.equal((await db.query("select * from rsvp_private.rsvp_rate_limits")).rows.length, 1);
    await db.exec("reset role");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(consume("ip"), (error: { code?: string }) => error.code === "42501");
      await assert.rejects(db.query("select * from rsvp_private.rsvp_rate_limits"), (error: { code?: string }) => error.code === "42501");
      await db.exec("reset role");
    }
    const fn = await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc where proname = 'consume_rsvp_rate_limit'");
    assert.equal(fn.rows[0].prosecdef, false);
  } finally { await db.close(); }
});

test("each exceeded limit stops the insert and reports a retry wait", async () => {
  for (const blocked of ["global", "ip", "phone"]) {
    let inserted = false;
    const state = await processRsvp(submission(), "unknown", {
      consume: async scope => scope === blocked ? 61 : 0,
      insert: async () => { inserted = true; return { error: null }; },
    });
    assert.equal(inserted, false);
    assert.equal(state.status, "error");
    assert.match(state.message!, /try again in 2 minutes/);
  }
});

test("invalid requests and repeated honeypot values count toward limits without inserts", async () => {
  const invalid = submission(); invalid.set("phone", "invalid");
  const bot = submission(); bot.append("website", ""); bot.append("website", "spam");
  for (const data of [invalid, bot]) {
    const scopes: string[] = [];
    const state = await processRsvp(data, "unknown", {
      consume: async scope => { scopes.push(scope); return 0; },
      insert: async () => { assert.fail("must not insert"); },
    });
    assert.equal(state.status, "error");
    assert.deepEqual(scopes, ["global", "ip"]);
  }
});

test("phone formats share a limit and trusted fields ignore tampering", async () => {
  const keys: string[] = [];
  for (const phone of ["2015550123", "+1 201 555 0123"]) {
    const data = submission(phone); data.set("event_slug", "forged"); data.set("disclaimer_version", "forged");
    const state = await processRsvp(data, "unknown", {
      consume: async (scope, value) => { if (scope === "phone") keys.push(value); return 0; },
      insert: async row => {
        assert.equal(row.event_slug, eventSlug);
        assert.equal(row.disclaimer_version, disclaimerVersion);
        return { error: null };
      },
    });
    assert.equal(state.status, "success");
  }
  assert.equal(keys[0], keys[1]);
});

test("limiter outages block inserts, and only the phone constraint is a duplicate", async () => {
  const outage = await processRsvp(submission(), "unknown", {
    consume: async () => { throw new Error("offline"); },
    insert: async () => { assert.fail("must not insert without protection"); },
  });
  assert.equal(outage.status, "error");
  for (const [constraint, expected] of [["rsvps_event_phone_key", "duplicate"], ["rsvps_pkey", "error"]]) {
    const state = await processRsvp(submission(), "unknown", {
      consume: async () => 0,
      insert: async () => ({ error: { code: "23505", message: `duplicate key value violates unique constraint "${constraint}"` } }),
    });
    assert.equal(state.status, expected);
  }
});
