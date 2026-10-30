import { test, expect, type Page } from "@playwright/test";
import { captureState } from "./screenshots";

async function fillRsvp(page: Page, email = "dancer@example.com") {
  await page.getByLabel("Name", { exact: true }).fill("María Pérez");
  await page.getByLabel("Phone number", { exact: true }).fill("(201) 555-0123");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("How did you hear about us?").selectOption("Instagram");
}

async function expectCenteredEventClosed(page: Page) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector("main")!.getBoundingClientRect();
    const message = document.querySelector('section[aria-labelledby="rsvp-title"]')!.getBoundingClientRect();
    const footer = document.querySelector("footer")!.getBoundingClientRect();
    return {
      mainCenterX: main.x + main.width / 2,
      mainCenterY: main.y + main.height / 2,
      messageCenterX: message.x + message.width / 2,
      messageCenterY: message.y + message.height / 2,
      footerBottom: footer.bottom,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  expect(Math.abs(layout.messageCenterX - layout.mainCenterX)).toBeLessThan(1);
  expect(Math.abs(layout.messageCenterY - layout.mainCenterY)).toBeLessThan(1);
  expect(Math.abs(layout.footerBottom - layout.viewportHeight)).toBeLessThan(1);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/reset");
});

test("automatically shows the next event without rendering the preserved upcoming list", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("LOCAL ONLY — Browser Test Event");
  await expect(page.getByRole("navigation", { name: "Available events" })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await captureState(page, info, "rsvp-form");
  await page.goto("/?event=browser-later-event");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("LOCAL ONLY — Later Event");
  await expect(page.locator("time")).toHaveAttribute("datetime", "2027-01-04");
  await expect(page.locator(".event-date")).toContainText("Monday, Jan 4");
  await expect(page.locator(".event-date")).toContainText("8–11 PM");
  await expect(page.locator(".event-location").last()).toContainText("Local Test Venue");
});

test("selected event stays attached to its form and duplicate UI", async ({ page }, info) => {
  await page.goto("/?event=browser-later-event");
  await fillRsvp(page);
  await page.locator("form").evaluate((form) => {
    const forged = document.createElement("input");
    forged.type = "hidden";
    forged.name = "event_slug";
    forged.value = "browser-test-event";
    form.appendChild(forged);
  });
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByText("Your RSVP has been confirmed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "LOCAL ONLY — Later Event", exact: true })).toBeVisible();
  await expect(page.locator(".event-date time")).toHaveAttribute("datetime", "2027-01-04");
  await captureState(page, info, "rsvp-success");
  await page.goto("/?event=browser-later-event");
  await fillRsvp(page, "different@example.com");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByText("Looks like this phone number has already RSVP’d for this event.")).toBeVisible();
  await captureState(page, info, "rsvp-already-registered");
});

test("unavailable selected event never silently switches to another event", async ({ page }, info) => {
  await page.goto("/?event=missing-event");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This event is no longer available");
  await captureState(page, info, "rsvp-event-unavailable");
  await expectCenteredEventClosed(page);
  await expect(page.getByRole("link", { name: "View available events" })).toHaveAttribute("href", "/");
  await expect(page.locator("form")).toHaveCount(0);
});

test("no eligible events shows an accurate empty state", async ({ page, request }, info) => {
  await request.post("http://127.0.0.1:54329/no-events");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No events are currently open.");
  await captureState(page, info, "event-closed");
  await expectCenteredEventClosed(page);
  await expect(page.getByRole("link", { name: "View available events" })).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);
});

test("database discovery failure is distinct from no available events", async ({ page, request }, info) => {
  await request.post("http://127.0.0.1:54329/discovery-unavailable");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Events temporarily unavailable");
  await expect(page.getByText(/^Reference: [0-9a-f-]+\.$/)).toBeVisible();
  await captureState(page, info, "rsvp-discovery-error");
});

test("write failures keep inputs and do not display success", async ({ page }, info) => {
  await page.goto("/");
  await fillRsvp(page, "failure@example.com");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t save your RSVP");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("failure@example.com");
  await captureState(page, info, "rsvp-server-error");
});

test("RSVP validation, submitting and rate-limit states", async ({ page, request }, info) => {
  await page.goto("/?event=browser-test-event");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await captureState(page, info, "rsvp-validation");
  await fillRsvp(page);
  await request.post("http://127.0.0.1:54329/fixture", { data: { rsvpDelay: 2500 } });
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  await captureState(page, info, "rsvp-submitting");
  await expect(page.getByText("Your RSVP has been confirmed.")).toBeVisible();
  await page.goto("/?event=browser-test-event");
  await request.post("http://127.0.0.1:54329/fixture", { data: { rateLimited: true } });
  await fillRsvp(page);
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText(/wait|many|try again/i);
  await captureState(page, info, "rsvp-rate-limited");
});
