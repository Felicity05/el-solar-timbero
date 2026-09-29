import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1100 } } },
  ],
  webServer: [
    { command: "node tests/mock-supabase.mjs", url: "http://127.0.0.1:54329/health", reuseExistingServer: false },
    { command: "npm run start -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", SUPABASE_SERVICE_ROLE_KEY: "test-only-placeholder-key" } },
  ],
});
