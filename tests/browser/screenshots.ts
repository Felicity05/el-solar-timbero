import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

export async function captureState(page: Page, info: TestInfo, state: string) {
  const directory = path.resolve("test-results", "screenshots", info.project.name);
  await mkdir(directory, { recursive: true });
  await page.evaluate(async () => {
    for (const image of document.images) image.loading = "eager";
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
  const file = path.join(directory, `${state}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
  await info.attach(state, { path: file, contentType: "image/png" });
}
