import { defineConfig } from "@playwright/test";

/**
 * Opt-in live API gate. The API and its isolated PostgreSQL database must already be running;
 * e2e/run-market-live-e2e.mjs validates that contract and deliberately starts neither service.
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
