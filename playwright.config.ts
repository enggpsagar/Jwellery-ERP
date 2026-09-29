import { defineConfig, devices } from "@playwright/test"

// Regression suite — see e2e/README.md. Runs against a local production
// build (`pnpm build` first) backed by a THROWAWAY database; e2e/global-setup
// refuses to run against anything that isn't localhost.
const PORT = Number(process.env.E2E_PORT || 3100)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Specs share one seeded store; the write flows (invoice) assert on rows
  // they create themselves, so they stay independent of run order.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    storageState: "e2e/.auth/admin.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})
