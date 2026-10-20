import { test } from "node:test";
import assert from "node:assert/strict";
import { existingCredential, purchaseCredential } from "../src/components/tickets/credential";

test("credentials are per normalized attendee/event and survive tab changes without exposing phones", async () => {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const storage = (values: Map<string, string>) => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  const globals = ["window", "localStorage", "sessionStorage"] as const;
  const previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const localStorage = storage(local), sessionStorage = storage(session);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, sessionStorage } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: sessionStorage });
  try {
    // The precise regression: a second attendee in the SAME browser/event
    // must not submit the first attendee's UNIQUE(event, access_hash) value.
    const first = await purchaseCredential("test-event", "+12025550111");
    const second = await purchaseCredential("test-event", "+12025550112");
    assert.match(first, /^[a-f0-9]{64}$/); assert.notEqual(first, second);
    assert.equal(existingCredential("test-event"), second);
    // Another tab changes its active attendee; this tab keeps its own selection.
    local.set("el-solar-purchase:test-event", first);
    assert.equal(existingCredential("test-event"), second);
    assert.equal(await purchaseCredential("test-event", "+12025550111"), first);
    assert.equal(existingCredential("test-event"), first);
    session.clear(); // Another tab/reopened browser retains attendee identity.
    assert.equal(await purchaseCredential("test-event", "+12025550112"), second);
    assert.notEqual(await purchaseCredential("other-event", "+12025550112"), second);
    assert.ok(![...local.keys(), ...session.keys()].some(key => key.includes("+1202555")));
    // Keep legacy confirmation access, but do not assume a legacy capability
    // belongs to whichever new phone is entered next.
    session.set("el-solar-purchase:legacy-event", "a".repeat(64));
    assert.equal(existingCredential("legacy-event"), "a".repeat(64));
    assert.notEqual(await purchaseCredential("legacy-event", "+12025550113"), "a".repeat(64));
    await assert.rejects(purchaseCredential("test-event", "2025550111"));
  } finally {
    globals.forEach((key, i) => {
      if (previous[i]) Object.defineProperty(globalThis, key, previous[i]!);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
