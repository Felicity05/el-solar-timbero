import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/reset");
});
test("admin authorization, create, edit, configuration-only duplicate and toggleable PIN and form controls", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/admin/events/new");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("other@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByText("Unable to sign in with those admin credentials.", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Manage All Events", exact: true })).toBeVisible();
  const authCookies = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((c) => c.httpOnly && c.secure)).toBe(true);
  await page.getByRole("link", { name: "Create Event" }).click();
  await page.getByLabel("Event name", { exact: true }).fill("Admin browser test");
  await expect(page.getByLabel("Unique event slug")).toHaveAttribute("readonly", "");
  const localZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  await expect(page.getByRole("combobox", { name: "Event timezone", exact: true })).toHaveValue(localZone);
  await page.getByRole("combobox", { name: "Event timezone", exact: true }).selectOption("America/New_York");
  await page.getByLabel("Event date", { exact: true }).fill("2033-01-09");
  await page.getByLabel("Starts (event timezone)", { exact: true }).fill("20:00");
  await page.getByLabel("Ends (event timezone)", { exact: true }).fill("23:30");
  await page.getByLabel("Venue", { exact: true }).fill("Test venue");
  await page.getByLabel("Venue address", { exact: true }).fill("Test address");
  await page.getByLabel("Publish at (event timezone)", { exact: true }).fill("2033-01-01T10:00");
  await expect(page.getByLabel("Unique event slug")).toHaveValue("admin-browser-test-2033-01-09");
  await page.getByRole("combobox", { name: "Gift-card disclaimer", exact: true }).selectOption("guantanamera-ticket-2026-10-26");
  await page.getByRole("combobox", { name: "Ticket type", exact: true }).selectOption("VIP");
  await page.getByLabel("Unique event slug").evaluate((input: HTMLInputElement) => {
    input.value = "browser-forged-slug";
  });
  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page).toHaveURL(/\/admin\/events\/[a-f0-9-]{36}$/);
  await expect(page.getByLabel("Event name", { exact: true })).toHaveValue("Admin browser test");
  await expect(page.getByText("Tickets sold", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate PIN", exact: true }).click();
  await expect(page.locator("code")).toHaveText(/^\d{8}$/);
  const pin = await page.locator("code").textContent();
  await page.getByRole("button", { name: "Hide PIN", exact: true }).click();
  await expect(page.locator("code")).toHaveCount(0);
  await page.getByRole("button", { name: "Show PIN", exact: true }).click();
  await expect(page.locator("code")).toHaveText(pin!);
  await expect(page.getByRole("button", { name: "Regenerate PIN", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show PIN", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Gift-card disclaimer", exact: true })).toHaveValue("guantanamera-ticket-2026-10-26");
  await expect(page.getByRole("combobox", { name: "Ticket type", exact: true })).toHaveValue("VIP");
  await expect(page.getByRole("button", { name: "Regenerate PIN" })).toBeVisible();
  await page.getByLabel("Event name", { exact: true }).fill("Edited event");
  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByText("Event saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Event name", { exact: true })).toHaveValue("Edited event");
  await expect(page.getByLabel("Unique event slug")).toHaveValue("admin-browser-test-2033-01-09");
  await page.getByLabel("Event date", { exact: true }).fill("2033-01-10");
  await expect(page.getByLabel("Unique event slug")).toHaveValue("edited-event-2033-01-10");
  await page.getByRole("button", { name: "Save Event", exact: true }).click();
  await expect(page.getByText("Event saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Unique event slug")).toHaveValue("edited-event-2033-01-10");
  const original = page.url();
  await page.getByRole("button", { name: "Duplicate as Draft" }).click();
  await expect(page).not.toHaveURL(original);
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("draft");
  await expect(page.getByRole("button", { name: "Generate PIN", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Gift-card disclaimer", exact: true })).toHaveValue("guantanamera-ticket-2026-10-26");
  await expect(page.getByRole("combobox", { name: "Ticket type", exact: true })).toHaveValue("VIP");
  await expect(page.getByRole("combobox", { name: "Event timezone", exact: true })).toHaveValue("America/New_York");
  await expect(page.getByLabel("Unique event slug")).toHaveValue("edited-event-2033-01-10");
  const expectedPublishDate = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const date = new Date(`${parts}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 2);
    return date.toISOString().slice(0, 10);
  });
  await expect(page.getByLabel("Publish at (event timezone)", { exact: true })).toHaveValue(new RegExp(`^${expectedPublishDate}T`));
  await page.getByLabel("Publish at (event timezone)", { exact: true }).fill("2033-01-12T10:00");
  await page.getByLabel("Event date", { exact: true }).fill("2033-01-17");
  await expect(page.getByLabel("Publish at (event timezone)", { exact: true })).toHaveValue("2033-01-12T10:00");
  await expect(page.getByLabel("Unique event slug")).toHaveValue("edited-event-2033-01-17");
  await page.getByRole("button", { name: "Save Event", exact: true }).click();
  await expect(page.getByText("Event saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Unique event slug")).toHaveValue("edited-event-2033-01-17");
  await expect(page.getByLabel("Publish at (event timezone)", { exact: true })).toHaveValue("2033-01-12T10:00");
  await page.goto("/admin");
  expect(consoleErrors.filter((error) => error.includes("same key"))).toEqual([]);
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("heading", { name: "Admin sign in" })).toBeVisible();
  await page.goto("/admin/events/new");
  await expect(page).toHaveURL(/\/admin$/);
});

test("admin list separates past events and sorts upcoming nearest first and past newest first", async ({ page, request }) => {
  for (const [name, date] of [
    ["Far future", "2035-01-20"],
    ["Oldest past", "2020-01-01"],
    ["Nearest upcoming", "2035-01-10"],
    ["Recent past", "2021-01-01"],
  ]) {
    await request.post("http://127.0.0.1:54329/rest/v1/rpc/admin_save_event", {
      data: {
        p_event_id: null,
        p_config: {
          name,
          event_date: date,
          slug: name.toLowerCase().replaceAll(" ", "-"),
          starts_at_local: `${date}T20:00`,
          ends_at_local: `${date}T23:30`,
          publish_at_local: "2019-01-01T10:00",
          timezone: "America/New_York",
          status: "draft",
          admission_mode: "rsvp",
          rsvp_open: false,
        },
      },
    });
  }
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password-only");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("region", { name: "Upcoming Events" }).getByRole("link")).toHaveText(["Nearest upcoming", "Far future"]);
  await expect(page.getByRole("region", { name: "Past Events" }).getByRole("link")).toHaveText(["Recent past", "Oldest past"]);
});
