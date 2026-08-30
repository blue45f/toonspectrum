import { defineConfig } from "@playwright/test";

/**
 * Opt-in live API gate. e2e/run-market-live-e2e.mjs validates the isolated PostgreSQL target,
 * requires an unused loopback port, and starts the API with that exact DATABASE_URL.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "market-live.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
});
