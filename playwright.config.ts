/**
 * v0.34 — Playwright config E2E.
 *
 * Installation locale (pas dans package.json pour ne pas alourdir le bundle prod) :
 *   bun add -D @playwright/test
 *   bunx playwright install chromium
 *
 * Lancement :
 *   bun run test:e2e            # full
 *   bun run test:e2e:ui         # UI mode
 *   bun run test:e2e -- --shard=1/4
 *
 * En CI (.github/workflows/e2e.yml) on utilise 4 shards en parallèle pour viser <15min.
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "admin-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      testMatch: /.*\.admin\.spec\.ts/,
    },
    {
      name: "chef-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/chef.json" },
      testMatch: /.*\.chef\.spec\.ts/,
    },
    {
      name: "employe-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/employe.json" },
      testMatch: /.*\.employe-desktop\.spec\.ts/,
    },
    {
      name: "employe-mobile",
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/employe.json" },
      testMatch: /.*\.employe-mobile\.spec\.ts/,
    },
    {
      name: "smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /.*\.smoke\.spec\.ts/,
    },
  ],

  webServer: isCI
    ? undefined
    : {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
