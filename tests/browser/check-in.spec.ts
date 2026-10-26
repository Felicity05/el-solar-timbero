import { test, expect } from "@playwright/test";
import QRCode from "qrcode";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/reset");
});
test("PIN session, manual validation, explicit admission and duplicate admission", async ({ page, context }) => {
  await page.goto("/check-in");
  await page.getByLabel("Staff PIN").fill("00000000");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await expect(page.getByText("Incorrect PIN.")).toBeVisible();
  await page.getByLabel("Staff PIN").fill("12345678");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await expect(page.getByRole("button", { name: "Start Camera" })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "el_solar_door");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(cookie?.path).toBe("/check-in");
  await page.reload();
  await expect(page.getByRole("button", { name: "Start Camera" })).toBeVisible();
  await page.getByLabel("Or enter ticket code").fill("EST-ABCDEF012345");
  await page.getByRole("button", { name: "Validate Ticket" }).click();
  await expect(page.getByRole("heading", { name: "VALID TICKET", exact: true })).toBeVisible();
  await expect(page.getByText("General Admission", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check In", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^CHECKED IN(?: ✓)?$/ })).toBeVisible();
  await page.getByRole("button", { name: "Scan Next" }).click();
  await page.getByLabel("Or enter ticket code").fill("EST-ABCDEF012345");
  await page.getByRole("button", { name: "Validate Ticket" }).click();
  await expect(page.getByRole("heading", { name: "ALREADY CHECKED IN" })).toBeVisible();
  await expect(page.getByText(/^\s*Checked in:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check In", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Lock Scanner" }).click();
  await expect(page.getByLabel("Staff PIN")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Staff PIN")).toBeVisible();
});
test("camera decodes existing public QR and never checks in automatically", async ({ page }) => {
  const qr = await QRCode.toDataURL(`http://127.0.0.1:3100/tickets/${"a".repeat(64)}?view=card`, { width: 500, margin: 4 });
  await page.addInitScript(
    ({ qr }) => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const canvas = document.createElement("canvas");
          canvas.width = 600;
          canvas.height = 600;
          const ctx = canvas.getContext("2d")!;
          const img = new Image();
          img.src = qr;
          await img.decode();
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 600, 600);
          ctx.drawImage(img, 150, 150, 300, 300);
          const stream = canvas.captureStream(15);
          const interval = setInterval(() => {
            ctx.drawImage(img, 150, 150, 300, 300);
          }, 60);
          stream.getTracks().forEach((track) => {
            const stop = track.stop.bind(track);
            track.stop = () => {
              clearInterval(interval);
              stop();
            };
          });
          return stream;
        },
      });
    },
    { qr },
  );
  await page.goto("/check-in");
  await page.getByLabel("Staff PIN").fill("12345678");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await page.getByRole("button", { name: "Start Camera" }).click();
  await expect(page.getByRole("heading", { name: "VALID TICKET", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check In", exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Or enter ticket code").fill("EST-ABCDEF012345");
  await page.getByRole("button", { name: "Validate Ticket" }).click();
  await expect(page.getByRole("heading", { name: "VALID TICKET", exact: true })).toBeVisible();
});
test("invalid code and expired/tampered session fail safely", async ({ page, context }) => {
  await page.goto("/check-in");
  await page.getByLabel("Staff PIN").fill("12345678");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await page.getByLabel("Or enter ticket code").fill("EST-000000000000");
  await page.getByRole("button", { name: "Validate Ticket" }).click();
  await expect(page.getByRole("heading", { name: "INVALID TICKET", exact: true })).toBeVisible();
  await expect(page.getByText(/^No ticket was found for this QR or ticket code\./)).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "el_solar_door")!;
  await context.addCookies([{ ...cookie, value: "tampered" }]);
  await page.getByRole("button", { name: "Scan Next" }).click();
  await page.getByLabel("Or enter ticket code").fill("EST-ABCDEF012345");
  await page.getByRole("button", { name: "Validate Ticket" }).click();
  await expect(page.getByLabel("Staff PIN")).toBeVisible();
  await page.getByLabel("Staff PIN").fill("12345678");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await expect(page.getByRole("button", { name: "Start Camera" })).toBeVisible();
  await expect(page.getByLabel("Or enter ticket code")).toHaveValue("");
});
test("PIN guessing is rate limited and limiter outages fail closed", async ({ page, request }) => {
  await page.goto("/check-in");
  for (let i = 0; i < 10; i++) {
    await page.getByLabel("Staff PIN").fill("00000000");
    await page.getByRole("button", { name: "Unlock Scanner" }).click();
    await expect(page.getByText("Incorrect PIN.")).toBeVisible();
  }
  await page.getByLabel("Staff PIN").fill("12345678");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await expect(page.getByText("Too many attempts. Please wait before trying again.")).toBeVisible();
  await request.post("http://127.0.0.1:54329/reset");
  await request.post("http://127.0.0.1:54329/limiter-unavailable");
  await page.getByLabel("Staff PIN").fill("12345678");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await expect(page.getByText(/^We couldn’t complete this request\./)).toBeVisible();
  await expect(page.getByLabel("Staff PIN")).toBeVisible();
});

for (const [reason, message] of [
  ["wrong_event", "This ticket is for a different event."],
  ["event_unavailable", "This event is not currently available for ticket check-in."],
  ["unpaid", "The order for this ticket is not marked as paid."],
  ["refunded", "This ticket or its payment has been refunded."],
  ["void", "This ticket or its order has been voided."],
  ["unknown", "This ticket could not be validated."],
]) {
  test(`invalid ticket explains ${reason} without offering admission`, async ({ page, request }) => {
    await request.post("http://127.0.0.1:54329/fixture", { data: { doorReason: reason } });
    await page.goto("/check-in");
    await page.getByLabel("Staff PIN").fill("12345678");
    await page.getByRole("button", { name: "Unlock Scanner" }).click();
    await page.getByLabel("Or enter ticket code").fill("EST-000000000000");
    await page.getByRole("button", { name: "Validate Ticket" }).click();
    await expect(page.getByRole("heading", { name: "INVALID TICKET", exact: true })).toBeVisible();
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check In", exact: true })).toHaveCount(0);
  });
}
test("unrecognized ticket input explains accepted QR/code format", async ({ page }) => {
  await page.goto("/check-in");
  await page.getByLabel("Staff PIN").fill("12345678");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await page.getByLabel("Or enter ticket code").fill("not-a-ticket");
  await page.getByRole("button", { name: "Validate Ticket" }).click();
  await expect(page.getByText(/^This QR or ticket code is not recognized\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check In", exact: true })).toHaveCount(0);
});

test("PIN visibility toggle reveals and masks digits without submitting or changing them", async ({ page }) => {
  await page.goto("/check-in");
  const pin = page.getByLabel("Staff PIN", { exact: true });
  await expect(pin).toHaveAttribute("type", "password");
  await pin.fill("1234");
  await page.getByRole("button", { name: "Show PIN", exact: true }).click();
  await expect(pin).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide PIN" })).toHaveAttribute("aria-pressed", "true");
  await expect(pin).toHaveValue("1234");
  await pin.fill("12345678");
  await page.getByRole("button", { name: "Hide PIN", exact: true }).click();
  await expect(pin).toHaveAttribute("type", "password");
  await expect(pin).toHaveValue("12345678");
  await expect(page.getByRole("button", { name: "Show PIN" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Start Camera" })).toHaveCount(0);
  await expect(page.getByText("Incorrect PIN.")).toHaveCount(0);
  await page.getByRole("button", { name: "Show PIN" }).focus();
  await page.keyboard.press("Space");
  await expect(pin).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Unlock Scanner" }).click();
  await expect(page.getByRole("button", { name: "Start Camera" })).toBeVisible();
  await page.getByRole("button", { name: "Lock Scanner" }).click();
  await expect(pin).toHaveAttribute("type", "password");
  await expect(pin).toHaveValue("");
});
