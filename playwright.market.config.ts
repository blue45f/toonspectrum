import { defineConfig, devices } from "@playwright/test";

const MARKET_E2E_PORT = Number(process.env.TOONSPECTRUM_MARKET_E2E_PORT ?? "5219");
if (!Number.isSafeInteger(MARKET_E2E_PORT) || MARKET_E2E_PORT < 1 || MARKET_E2E_PORT > 65_535) {
  throw new Error("TOONSPECTRUM_MARKET_E2E_PORT must be a valid TCP port.");
}

const CHANNEL = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";
const SOFTWARE_GPU_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

/**
 * Market mock/browser gate. It owns one strict-port Vite process and never reuses an unrelated
 * checkout's server, which keeps the assertions bound to the current worktree.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "market.spec.ts",
    "comprehensive-browser-audit.spec.ts",
    "studio-full-verification.spec.ts",
  ],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${MARKET_E2E_PORT}`,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
                args: SOFTWARE_GPU_ARGS,
              },
            }
          : {
              ...(CHANNEL ? { channel: CHANNEL } : {}),
              launchOptions: { args: SOFTWARE_GPU_ARGS },
            }),
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${MARKET_E2E_PORT} --strictPort`,
    url: `http://127.0.0.1:${MARKET_E2E_PORT}/market`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
