import { test, expect, type Page } from "@playwright/test";

async function screenshot(page: Page, path: string) {
  await page.locator("img").evaluateAll(async images => {
    await Promise.all(images.map(async image => {
      if (image instanceof HTMLImageElement) { image.loading = "eager"; await image.decode(); }
    }));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path, fullPage: true });
}

async function fillRsvp(page: Page, email = "dancer@example.com", phone = "(201) 555-0123") {
  await page.getByLabel("Name", { exact: true }).fill("María Pérez");
  await page.getByLabel("Phone number", { exact: true }).fill(phone);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("How did you hear about us?").selectOption("Instagram");
  await page.getByRole("checkbox").check();
}

test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/reset"); });

test("landing page has event information, accessible inputs, and no horizontal overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CubanNight Social");
  await expect(page.getByText("Monday, Oct 12", { exact: false })).toBeVisible();
  await expect(page.locator(".event-date time")).toHaveAttribute("datetime", "2026-10-12");
  await expect(page.getByLabel("How did you hear about us?").locator("option")).toHaveCount(7);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByText("An RSVP does not guarantee a gift card.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await screenshot(page, `test-results/${testInfo.project.name}-rsvp.png`);
});

test("server rejects invalid fields, focuses errors, and keeps entered details", async ({ page }) => {
  await page.goto("/");
  await fillRsvp(page);
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Please acknowledge the phone-sharing notice to RSVP.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("María Pérez");
  await expect(page.getByLabel("How did you hear about us?")).toHaveValue("Instagram");
});

test("successful insert shows confirmation; repeat phone shows duplicate without overwriting", async ({ page }, testInfo) => {
  await page.goto("/");
  await fillRsvp(page);
  // Simulate a tampered browser request. The test API requires trusted server values.
  await page.locator("form").evaluate(form => {
    for (const [name, value] of [["event_slug", "invented-event"], ["disclaimer_version", "forged"]]) {
      const input = document.createElement("input");
      input.type = "hidden"; input.name = name; input.value = value;
      form.appendChild(input);
    }
  });
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving your RSVP…" })).toBeDisabled();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¡Nos vemosen el Solar!");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await screenshot(page, `test-results/${testInfo.project.name}-success.png`);
  await page.getByRole("link", { name: "Back to home" }).click();
  await fillRsvp(page, "different@example.com", "+1 201 555 0123");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re alreadyon the list!");
  await expect(page.getByText("Looks like this phone number has already RSVP’d for this event.")).toBeVisible();
  await screenshot(page, `test-results/${testInfo.project.name}-duplicate.png`);
  await page.getByRole("link", { name: "View event" }).click();
  await expect(page.getByRole("button", { name: "RSVP", exact: true })).toBeVisible();
});

test("database failure never displays success and retains input for retry", async ({ page }) => {
  await page.goto("/");
  await fillRsvp(page, "failure@example.com");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t save your RSVP");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("failure@example.com");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await expect(page.getByLabel("How did you hear about us?")).toHaveValue("Instagram");
  await page.getByLabel("Email", { exact: true }).fill("retry@example.com");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByText("Your RSVP has been confirmed.")).toBeVisible();
});

test("repeated submissions are limited, retain details, and allow retry after expiry", async ({ page, request }) => {
  await page.goto("/");
  await fillRsvp(page, "failure@example.com");
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.getByRole("button", { name: "RSVP", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t save your RSVP");
    await expect(page.getByRole("button", { name: "RSVP", exact: true })).toBeEnabled();
  }
  // Changing email does not bypass the normalized phone limit.
  await page.getByLabel("Email", { exact: true }).fill("retry@example.com");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Too many RSVP attempts");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("retry@example.com");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await request.post("http://127.0.0.1:54329/expire-limits");
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByText("Your RSVP has been confirmed.")).toBeVisible();
});

test("limiter outage blocks submission and preserves the form", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/limiter-unavailable");
  await page.goto("/");
  await fillRsvp(page);
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("We couldn’t connect to save your RSVP");
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue("(201) 555-0123");
  await expect(page.getByRole("checkbox")).toBeChecked();
});
