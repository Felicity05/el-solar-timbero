import { test, expect, type Page } from "@playwright/test";

async function fillRsvp(page: Page, email = "dancer@example.com") {
  await page.getByLabel("Name", { exact: true }).fill("María Pérez");
  await page.getByLabel("Phone number", { exact: true }).fill("(201) 555-0123");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("How did you hear about us?").selectOption("Instagram");
}
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/reset"); });

test("automatically shows the next event and offers all available events", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("LOCAL ONLY — Browser Test Event");
  await expect(page.getByRole("navigation", { name: "Available events" }).getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("link", { name: /LOCAL ONLY — Later Event/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("LOCAL ONLY — Later Event");
  await expect(page.locator("time")).toHaveAttribute("datetime", "2027-01-04");
  await expect(page.locator(".event-date")).toContainText("Monday, Jan 4");
  await expect(page.locator(".event-date")).toContainText("8–11 PM");
  await expect(page.locator(".event-location").last()).toContainText("Local Test Venue");
});

test("selected event stays attached to its form and duplicate UI", async ({ page }) => {
  await page.goto("/?event=browser-later-event");
  await fillRsvp(page);
  await page.locator("form").evaluate(form => {
    const forged = document.createElement("input");
    forged.type="hidden"; forged.name="event_slug"; forged.value="browser-test-event"; form.appendChild(forged);
  });
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByText("Your RSVP has been confirmed.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "LOCAL ONLY — Later Event", exact: true })).toBeVisible();
  await expect(page.locator(".event-date time")).toHaveAttribute("datetime", "2027-01-04");
  await page.goto("/?event=browser-later-event");
  await fillRsvp(page, "different@example.com");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByText("Looks like this phone number has already RSVP’d for this event.")).toBeVisible();
});

test("unavailable selected event never silently switches to another event", async ({ page }) => {
  await page.goto("/?event=missing-event");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This event is no longer available for RSVP");
  await expect(page.locator("form")).toHaveCount(0);
});

test("no eligible events shows an accurate empty state", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/no-events");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No events are currently open for RSVP");
  await expect(page.locator("form")).toHaveCount(0);
});

test("database discovery failure is distinct from no available events", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/discovery-unavailable");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Events temporarily unavailable");
  await expect(page.getByText(/^Reference: [0-9a-f-]+\.$/)).toBeVisible();
});

test("write failures keep inputs and do not display success", async ({ page }) => {
  await page.goto("/");
  await fillRsvp(page, "failure@example.com");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t save your RSVP");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("failure@example.com");
});
