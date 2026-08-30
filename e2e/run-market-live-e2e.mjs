#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  startIsolatedMarketApi,
  stopDetachedProcessTree,
  stopIsolatedMarketApi,
  validateIsolatedMarketApiTarget,
} from "../scripts/isolated-market-api.mjs";

const require = createRequire(import.meta.url);
const PLAYWRIGHT_ENTRYPOINT = require.resolve("@playwright/test/cli");
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SIGNAL_EXIT_CODE = Object.freeze({ SIGINT: 130, SIGTERM: 143 });

let apiProcess = null;
let playwrightProcess = null;
let cleanupPromise = null;
let receivedSignal = null;
let signalCleanupFailed = false;

function fail(message) {
  throw new Error(message);
}

function requireLiveEnvironment() {
  if (process.env.TOONSPECTRUM_MARKET_LIVE_E2E !== "1") {
    fail("Set TOONSPECTRUM_MARKET_LIVE_E2E=1 to opt into the live marketplace gate.");
  }

  const rawApiUrl = process.env.TOONSPECTRUM_MARKET_LIVE_API_URL?.trim();
  if (!rawApiUrl) {
    fail("TOONSPECTRUM_MARKET_LIVE_API_URL is required.");
  }

  const email = process.env.TOONSPECTRUM_MARKET_LIVE_EMAIL?.trim();
  const password = process.env.TOONSPECTRUM_MARKET_LIVE_PASSWORD;
  if (!email || !password || password.length < 6) {
    fail("Explicit live test-account email and password values are required.");
  }

  return validateIsolatedMarketApiTarget({
    rawApiUrl,
    rawDatabaseUrl: process.env.TEST_DATABASE_URL,
  });
}

async function cleanupChildren() {
  if (cleanupPromise) {
    await cleanupPromise;
    return;
  }
  const playwright = playwrightProcess;
  const api = apiProcess;
  cleanupPromise = (async () => {
    const stops = [
      ...(playwright ? [stopDetachedProcessTree(playwright)] : []),
      ...(api ? [stopIsolatedMarketApi(api)] : []),
    ];
    const results = await Promise.allSettled(stops);
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "Marketplace live child cleanup failed.");
    }
  })().finally(() => {
    if (playwrightProcess === playwright) playwrightProcess = null;
    if (apiProcess === api) apiProcess = null;
    cleanupPromise = null;
  });
  await cleanupPromise;
}

function installSignalHandlers() {
  for (const signal of Object.keys(SIGNAL_EXIT_CODE)) {
    process.once(signal, () => {
      if (receivedSignal) return;
      receivedSignal = signal;
      void cleanupChildren()
        .catch((error) => {
          signalCleanupFailed = true;
          const message = error instanceof Error ? error.message : "Unknown child cleanup failure.";
          console.error(`Live marketplace signal cleanup failed: ${message}`);
          process.exitCode = 1;
        })
        .finally(() => {
          if (!signalCleanupFailed) process.exitCode = SIGNAL_EXIT_CODE[signal];
        });
    });
  }
}

function runPlaywright(apiOrigin) {
  playwrightProcess = spawn(
    process.execPath,
    [
      PLAYWRIGHT_ENTRYPOINT,
      "test",
      "--config=playwright.market-live.config.ts",
    ],
    {
      cwd: REPOSITORY_ROOT,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        TOONSPECTRUM_MARKET_LIVE_API_URL: apiOrigin,
      },
      stdio: "inherit",
    },
  );
  return new Promise((resolvePromise, rejectPromise) => {
    playwrightProcess.once("error", () => {
      rejectPromise(new Error("The live marketplace Playwright process could not start."));
    });
    playwrightProcess.once("exit", (code, signal) => {
      if (signal) {
        rejectPromise(new Error("The live marketplace Playwright process was interrupted."));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error("The live marketplace Playwright gate failed."));
        return;
      }
      resolvePromise();
    });
  });
}

async function main() {
  const target = requireLiveEnvironment();
  apiProcess = await startIsolatedMarketApi(target, {
    onSpawn(child) {
      apiProcess = child;
      if (receivedSignal) {
        throw new Error("The live marketplace gate was interrupted during API startup.");
      }
    },
  });
  try {
    if (receivedSignal) return;
    console.log(
      "Live marketplace API preflight passed (self-started isolated DB target; credentials hidden).",
    );
    await runPlaywright(target.apiOrigin);
  } finally {
    await cleanupChildren();
  }
}

installSignalHandlers();
main()
  .catch((error) => {
    if (receivedSignal) return;
    const message = error instanceof Error
      ? error.message
      : "Unknown live marketplace E2E failure.";
    console.error(`Live marketplace E2E failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupChildren();
    if (receivedSignal && !signalCleanupFailed) {
      process.exitCode = SIGNAL_EXIT_CODE[receivedSignal];
    }
  })
  .catch((error) => {
    if (signalCleanupFailed) return;
    const message = error instanceof Error ? error.message : "Unknown final child cleanup failure.";
    console.error(`Live marketplace final cleanup failed: ${message}`);
    process.exitCode = 1;
  });
