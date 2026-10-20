import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { cancelUnpaidOrderPayment, paymentForOrder, cardPaymentApiVersion, type PendingOrder } from "../src/lib/tickets/payment";
const order: PendingOrder = {
  status: "pending",
  order_id: "order-1",
  event_id: "event-1",
  ticket_type_id: "type-1",
  amount_cents: 1000,
  currency: "usd",
  payment_intent_id: null,
};
const intent = {
  id: "pi_test",
  amount: 1000,
  currency: "usd",
  client_secret: "test-only",
  status: "requires_payment_method",
  payment_method_types: ["card"],
  metadata: { order_id: "order-1", event_id: "event-1", ticket_type_id: "type-1" },
};
test("PaymentIntent uses database amount and stable per-order idempotency key, then retrieves existing intent", async () => {
  const calls: unknown[] = [];
  const stripe = {
    paymentIntents: {
      create: async (...args: unknown[]) => {
        calls.push(args);
        return intent;
      },
      retrieve: async (id: string) => {
        calls.push(id);
        return intent;
      },
    },
  } as unknown as Pick<Stripe, "paymentIntents">;
  await paymentForOrder(order, stripe);
  await paymentForOrder(order, stripe);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], [
    {
      amount: 1000,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: intent.metadata,
    },
    { idempotencyKey: "ticket-order:order-1:v1", apiVersion: cardPaymentApiVersion },
  ]);
  await paymentForOrder({ ...order, payment_intent_id: "pi_test" }, stripe);
  assert.equal(calls[2], "pi_test");
});
test("mismatched amount, currency, metadata or canceled intent cannot be exposed", async () => {
  for (const patch of [{ amount: 999 }, { currency: "eur" }, { metadata: { ...intent.metadata, event_id: "wrong" } }, { status: "canceled" }]) {
    const stripe = {
      paymentIntents: { retrieve: async () => ({ ...intent, ...patch }) },
    } as unknown as Pick<Stripe, "paymentIntents">;
    await assert.rejects(paymentForOrder({ ...order, payment_intent_id: "pi_test" }, stripe));
  }
});

test("legacy dynamic-method sessions fail closed without creating a replacement", async () => {
  let creates = 0;
  const stripe = {
    paymentIntents: {
      retrieve: async () => ({
        ...intent,
        payment_method_types: ["card", "link", "us_bank_account", "cashapp", "klarna", "amazon_pay"],
      }),
      create: async () => {
        creates++;
        return intent;
      },
    },
  } as unknown as Pick<Stripe, "paymentIntents">;
  await assert.rejects(paymentForOrder({ ...order, payment_intent_id: "pi_test" }, stripe), /not card-only/);
  assert.equal(creates, 0);
});

test("replacement attempts use stable distinct keys without changing database price", async () => {
  const calls: unknown[][] = [];
  const stripe = {
    paymentIntents: {
      create: async (...args: unknown[]) => {
        calls.push(args);
        return intent;
      },
    },
  } as unknown as Pick<Stripe, "paymentIntents">;
  await paymentForOrder({ ...order, payment_attempt: 1 }, stripe);
  await paymentForOrder({ ...order, payment_attempt: 1 }, stripe);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0][1], {
    idempotencyKey: "ticket-order:order-1:v1:attempt:1",
    apiVersion: cardPaymentApiVersion,
  });
});
test("recovery cancels unpaid sessions but never succeeded or processing payments", async () => {
  for (const status of ["requires_payment_method", "requires_confirmation", "requires_action", "canceled", "processing", "succeeded"]) {
    let canceled = 0;
    const stripe = {
      paymentIntents: {
        retrieve: async () => ({ ...intent, status }),
        cancel: async () => {
          canceled++;
          return { ...intent, status: "canceled" };
        },
      },
    } as unknown as Pick<Stripe, "paymentIntents">;
    const result = await cancelUnpaidOrderPayment({ ...order, payment_intent_id: intent.id }, stripe);
    assert.equal(canceled, ["requires_payment_method", "requires_confirmation", "requires_action"].includes(status) ? 1 : 0);
    assert.equal(result.status, ["succeeded", "processing"].includes(status) ? status : "canceled");
  }
});
test("confirmation winning a cancellation race cannot be replaced", async () => {
  let reads = 0;
  const stripe = {
    paymentIntents: {
      retrieve: async () => ({
        ...intent,
        status: ++reads === 1 ? "requires_payment_method" : "succeeded",
      }),
      cancel: async () => {
        throw Error("State changed");
      },
    },
  } as unknown as Pick<Stripe, "paymentIntents">;
  const result = await cancelUnpaidOrderPayment({ ...order, payment_intent_id: intent.id }, stripe);
  assert.equal(result.status, "succeeded");
});
test("unconfirmed cancellation and mismatched payments fail closed", async () => {
  const stripe = {
    paymentIntents: {
      retrieve: async () => intent,
      cancel: async () => {
        throw Error("Network unavailable");
      },
    },
  } as unknown as Pick<Stripe, "paymentIntents">;
  await assert.rejects(cancelUnpaidOrderPayment({ ...order, payment_intent_id: intent.id }, stripe));
  let canceled = false;
  const mismatch = {
    paymentIntents: {
      retrieve: async () => ({ ...intent, amount: 999 }),
      cancel: async () => {
        canceled = true;
        return intent;
      },
    },
  } as unknown as Pick<Stripe, "paymentIntents">;
  await assert.rejects(cancelUnpaidOrderPayment({ ...order, payment_intent_id: intent.id }, mismatch));
  assert.equal(canceled, false);
});
