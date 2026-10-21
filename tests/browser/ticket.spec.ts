import { test, expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import { captureState } from "./screenshots";

// Deliberate browser-side Stripe.js test double. It never simulates a real card
// payment. Real SDK/server/webhook/DB behavior is covered separately.
const mockStripeJs = `window.Stripe=function(){return {
 _registerWrapper(){},registerAppInfo(){},createToken(){},createPaymentMethod(){},confirmCardPayment(){},
 elements(){return {create(type,options){window.__paymentOptions=options;const listeners={};let frame;return {
   on(event,cb){listeners[event]=cb;},off(){},update(){},destroy(){frame?.remove();},
   mount(node){frame=document.createElement('iframe');frame.title='Stripe payment fields (test double)';frame.srcdoc='<p>Secure payment fields — test double</p>';node.appendChild(frame);setTimeout(()=>listeners.ready?.(),50);}
 };},update(){},submit:async()=>({})};},
 confirmPayment:async()=>{window.__confirmCalls=(window.__confirmCalls||0)+1;if(window.__holdPayment)await new Promise(resolve=>window.__finishPayment=resolve);return window.__decline?{error:{message:'Your card was declined.'}}:{paymentIntent:{status:'succeeded'}};}
};};`;
test.beforeEach(async ({ request, page }) => {
  await request.post("http://127.0.0.1:54329/reset");
  await request.post("http://127.0.0.1:54329/ticket-mode");
  await page.route("https://js.stripe.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: mockStripeJs }));
});
test("ticket CTA stays on page; styled $10 form initializes once and embeds Payment Element", async ({ page, request }, info) => {
  await page.goto("/?event=browser-ticket-event");
  const before = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(before.orders).toHaveLength(0);
  await captureState(page, info, "ticket-form");
  await expect(page.getByRole("button", { name: "Get Ticket", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Get Ticket", exact: true }).click();
  await expect(page.locator("#ticket-name")).toBeFocused();
  expect(page.url()).toContain("/?event=browser-ticket-event");
  await expect(page.locator("#ticket-purchase")).toContainText("General Admission");
  await expect(page.locator("#ticket-purchase")).toContainText("$10");
  await expect(page.locator("input[name=quantity],select[name=quantity]")).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("Test Buyer");
  await page.getByLabel("Phone number", { exact: true }).fill("2015550123");
  await page.getByLabel("Email", { exact: true }).fill("buyer@example.com");
  expect((await (await request.get("http://127.0.0.1:54329/ticket-state")).json()).orders).toHaveLength(0);
  await page
    .locator("#ticket-purchase form")
    .first()
    .evaluate((form) => {
      for (const [name, value] of [
        ["price", "1"],
        ["event_id", "forged"],
        ["amount_cents", "1"],
      ]) {
        const i = document.createElement("input");
        i.type = "hidden";
        i.name = name;
        i.value = value;
        form.appendChild(i);
      }
    });
  await page.getByLabel("How did you hear about us?").selectOption("Instagram");
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  await expect(page.locator("#ticket-purchase iframe")).toHaveCount(1);
  await expect(page.locator("#ticket-name")).toBeEnabled();
  await captureState(page, info, "ticket-payment-ready");
  await page.waitForTimeout(1200);
  const state = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(state.orders).toHaveLength(1);
  expect(state.intents).toHaveLength(1);
  expect(state.intents[0].amount).toBe(1000);
  expect(state.intents[0].currency).toBe("usd");
  expect(state.intents[0].payment_method_types).toEqual(["card"]);
  expect(await page.evaluate(() => (window as unknown as { __paymentOptions: unknown }).__paymentOptions)).toEqual({
    wallets: { applePay: "never", googlePay: "never", link: "never" },
    layout: { type: "accordion", defaultCollapsed: false },
  });
  await page.evaluate(() => {
    (window as unknown as { __holdPayment: boolean }).__holdPayment = true;
  });
  await page.getByRole("button", { name: "Buy Now", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Processing payment", exact: true })).toBeVisible();
  await expect(page.locator("[data-payment-page]")).toHaveAttribute("inert", "");
  await expect(page.locator('[aria-current="step"]')).toContainText("Processing payment…");
  await captureState(page, info, "ticket-processing-overlay");
  await page.evaluate(() => {
    (window as unknown as { __finishPayment: () => void }).__finishPayment();
  });
  await expect(page.locator('[aria-current="step"]')).toContainText("Preparing your ticket…");
  await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(0);
  await captureState(page, info, "ticket-payment-received");
  let releaseNavigation: () => void = () => {};
  const navigation = new Promise<void>((resolve) => {
    releaseNavigation = resolve;
  });
  await page.route("**/tickets/**", async (route) => {
    await navigation;
    await route.continue();
  });
  const payload = JSON.stringify({
    id: "evt_browser_success",
    type: "payment_intent.succeeded",
    livemode: false,
    data: { object: { ...state.intents[0], status: "succeeded", amount_received: 1000 } },
  });
  const signature = new Stripe("sk_test_fixture").webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_fixture",
  });
  for (let i = 0; i < 2; i++) {
    const response = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: { "Content-Type": "application/json", "stripe-signature": signature },
    });
    expect(response.status()).toBe(200);
  }
  await expect(page.locator('[aria-current="step"]')).toContainText("Ticket ready");
  await captureState(page, info, "ticket-ready-overlay");
  releaseNavigation();
  await expect(page.getByRole("heading", { name: "You're in!", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/^EST-[A-F0-9]{12}$/)).toBeVisible();
  await expect(page.getByText("Save or screenshot your ticket.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(1);
  await expect(page.locator(".event-date")).toHaveCount(1);
  await expect(page.locator(".event-date time")).toHaveAttribute("datetime", "2026-12-30");
  await expect(page.locator(".event-location").first()).toHaveText("$10");
  await captureState(page, info, "ticket-success");
  const ticketLink = page.getByRole("link", { name: "Open your ticket", exact: true });
  await expect(ticketLink).toHaveAttribute("href", /\/tickets\/[a-f0-9]{64}\?view=card$/);
  await ticketLink.click();
  await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(1);
  await expect(page.getByText("Present this QR code at the door.")).toBeVisible();
  await expect(page.locator(".event-date")).toHaveCount(1);
  await captureState(page, info, "ticket-individual-page");
  await page.goto("/?event=browser-ticket-event");
  await fillTicket(page);
  await expect(page.getByRole("heading", { name: "You already have a ticket!", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(1);
  await expect(page.locator(".event-date")).toHaveCount(1);
  await expect(page.locator(".event-date time")).toHaveAttribute("datetime", "2026-12-30");
  await captureState(page, info, "ticket-already-purchased");
  const afterDuplicate = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(afterDuplicate.orders).toHaveLength(1);
  expect(afterDuplicate.intents).toHaveLength(1);
  await expect(page.locator("form")).toHaveCount(0);
  await page.goto(`/tickets/${"0".repeat(64)}`);
  await expect(page.getByRole("heading", { name: "Ticket not found", exact: true })).toBeVisible();
  await captureState(page, info, "ticket-invalid-link");
});
test("Stripe decline leaves payment retryable without creating a ticket", async ({ page, request }, info) => {
  await page.goto("/?event=browser-ticket-event");
  await fillTicket(page);
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { __decline: boolean }).__decline = true;
  });
  await page.getByRole("button", { name: "Buy Now", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const state = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(state.orders.filter((order: { ticket_code?: string }) => order.ticket_code)).toHaveLength(0);
  // Stripe owns payment-field errors; the application adds no duplicate error panel.
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  await expect(page.locator("#ticket-purchase iframe")).toHaveCount(1);
  await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(0);
  await captureState(page, info, "ticket-payment-declined");
});

test("RSVP event keeps RSVP form and never shows payment controls", async ({ page }) => {
  await page.goto("/?event=browser-test-event");
  await expect(page.getByRole("button", { name: "RSVP", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Ticket", exact: true })).toHaveCount(0);
  await expect(page.locator("#ticket-purchase")).toHaveCount(0);
});

async function fillTicket(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill("Test Buyer");
  await page.getByLabel("Phone number", { exact: true }).fill("2015550123");
  await page.getByLabel("Email", { exact: true }).fill("buyer@example.com");
  await page.getByLabel("How did you hear about us?").selectOption("Instagram");
}

for (const scenario of [
  { name: "initialization-error", fixture: { ticketFailure: true }, text: "We couldn’t complete this request." },
  { name: "sales-closed", fixture: { ticketClosed: true }, text: "Sales are now closed" },
  { name: "rate-limited", fixture: { rateLimited: true }, text: "Too many attempts." },
  { name: "processing", fixture: { processing: true }, text: "Processing payment" },
  { name: "checking-existing-payment", fixture: { checking: true }, text: "We’re checking an existing payment." },
])
  test(`ticket visual state: ${scenario.name}`, async ({ page, request }, info) => {
    await request.post("http://127.0.0.1:54329/fixture", { data: scenario.fixture });
    await page.goto("/?event=browser-ticket-event");
    if (scenario.name !== "sales-closed") {
      await fillTicket(page);
    }
    if (scenario.name === "processing") {
      await expect(page.getByRole("dialog", { name: "Processing payment", exact: true })).toBeVisible();
    } else {
      await expect(page.getByText(scenario.text, { exact: false })).toBeVisible();
    }
    await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(0);
    await captureState(page, info, `ticket-${scenario.name}`);
  });

test("ticket validation and secure payment preparation", async ({ page, request }, info) => {
  await page.goto("/?event=browser-ticket-event");
  await page.getByLabel("Name", { exact: true }).fill("X");
  await page.getByLabel("Email", { exact: true }).focus();
  await expect(page.locator("#ticket-name")).toHaveAttribute("aria-invalid", "true");
  await captureState(page, info, "ticket-validation");
  await request.post("http://127.0.0.1:54329/fixture", { data: { ticketDelay: 3000 } });
  await fillTicket(page);
  await expect(page.getByText("Preparing secure payment…")).toBeVisible();
  await captureState(page, info, "ticket-payment-loading");
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
});

test("already purchased without browser credential shows event details but no ticket credential", async ({ page, request }, info) => {
  await page.goto("/?event=browser-ticket-event");
  await fillTicket(page);
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  const state = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  const payload = JSON.stringify({
    id: "evt_already_purchased",
    type: "payment_intent.succeeded",
    livemode: false,
    data: { object: { ...state.intents[0], status: "succeeded", amount_received: 1000 } },
  });
  const signature = new Stripe("sk_test_fixture").webhooks.generateTestHeaderString({ payload, secret: "whsec_fixture" });
  expect((await request.post("/api/stripe/webhook", { data: payload, headers: { "Content-Type": "application/json", "stripe-signature": signature } })).status()).toBe(200);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/?event=browser-ticket-event");
  await fillTicket(page);
  await expect(page.getByRole("heading", { name: "You already have a ticket!", exact: true })).toBeVisible();
  await expect(page.getByText(/use your saved ticket link or contact @el_solar_timbero/)).toBeVisible();
  await expect(page.locator(".event-date")).toHaveCount(1);
  await expect(page.locator(".event-date time")).toHaveAttribute("datetime", "2026-12-30");
  await expect(page.locator(".event-location").first()).toHaveText("$10");
  await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(0);
  await expect(page.getByText(/^EST-[A-F0-9]{12}$/)).toHaveCount(0);
  await captureState(page, info, "ticket-already-purchased-without-credential");
});

test("sales closed discovery and a direct initialization both reject sales without an order", async ({ page, request }, info) => {
  await request.post("http://127.0.0.1:54329/fixture", { data: { salesClosed: true } });
  await page.goto("/?event=browser-ticket-event");
  await expect(page.getByRole("heading", { name: "Sales are now closed for this event", exact: true })).toBeVisible();
  await expect(page.getByText("You can still come and pay at the door!", { exact: true })).toBeVisible();
  await expect(page.getByText("See you tonight at El Solar!", { exact: true })).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Ticket QR code", exact: true })).toHaveCount(0);
  await expect(page.locator(".event-date")).toHaveCount(1);
  const state = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(state.orders).toHaveLength(0);
  expect(state.intents).toHaveLength(0);
  await captureState(page, info, "ticket-sales-closed");
});

test("sales closing after payment fields load is checked again before Stripe confirmation", async ({ page, request }) => {
  await page.goto("/?event=browser-ticket-event");
  await fillTicket(page);
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  await request.post("http://127.0.0.1:54329/fixture", { data: { salesClosed: true } });
  await page.getByRole("button", { name: "Buy Now", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sales are now closed for this event", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __confirmCalls?: number }).__confirmCalls ?? 0)).toBe(0);
  await expect(page.locator("form")).toHaveCount(0);
});

test("ticket gift-card offer requires acknowledgment before creating an order or payment", async ({ page, request }, info) => {
  await request.post("http://127.0.0.1:54329/fixture", { data: { ticketPromotion: true } });
  await page.goto("/?event=browser-ticket-event");
  await fillTicket(page);
  const checkbox = page.getByRole("checkbox");
  await expect(checkbox).toHaveCount(1);
  await expect(page.getByText(/my ticket purchase includes a \$15 Guantanamera gift card/)).toBeVisible();
  await page.getByLabel("Name", { exact: true }).focus();
  await page.getByLabel("Email", { exact: true }).focus();
  await expect(page.locator("#ticket-gift-card-error")).toContainText("acknowledge");
  let state = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(state.orders).toHaveLength(0);
  expect(state.intents).toHaveLength(0);
  await checkbox.check();
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  state = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(state.orders).toHaveLength(1);
  expect(state.intents).toHaveLength(1);
  expect(state.orders[0].gift_card_disclaimer_accepted).toBe(true);
  expect(state.orders[0].disclaimer_version).toBe("2026-10-26-ticket-gift-card-v1");
  expect(state.intents[0].amount).toBe(1000);
  await captureState(page, info, "ticket-gift-card-offer");
});

test("attendee details remain editable after card loads and reuse the same pending payment", async ({ page, request }) => {
  await page.goto("/?event=browser-ticket-event");
  await fillTicket(page);
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  const before = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  await expect(page.getByLabel("Name", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Phone number", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Email", { exact: true })).toBeEnabled();
  await page.getByLabel("Name", { exact: true }).fill("Updated Buyer");
  await page.getByLabel("Email", { exact: true }).fill("updated@example.com");
  await page.getByLabel("How did you hear about us?").selectOption("Other");
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  await expect
    .poll(async () => {
      const state = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
      return state.orders[0].submitted_email;
    })
    .toBe("updated@example.com");
  const after = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(after.orders).toHaveLength(1);
  expect(after.intents).toHaveLength(1);
  expect(after.orders[0].order_id).toBe(before.orders[0].order_id);
  expect(after.intents[0].id).toBe(before.intents[0].id);
  expect(after.orders[0].submitted_name).toBe("Updated Buyer");
  expect(after.orders[0].referral_source).toBe("Other");
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toHaveCount(0);
  await page.getByLabel("Email", { exact: true }).fill("updated@example.com");
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  // A changed phone identifies a different attendee; never retain the old card session.
  await page.getByLabel("Phone number", { exact: true }).fill("2015550124");
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buy Now", exact: true })).toBeEnabled();
  const changed = await (await request.get("http://127.0.0.1:54329/ticket-state")).json();
  expect(changed.orders).toHaveLength(2);
  expect(changed.intents).toHaveLength(2);
});
