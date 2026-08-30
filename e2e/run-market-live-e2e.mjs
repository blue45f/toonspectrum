#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePostgresIntegrationUrl } from "../scripts/run-postgres-integration-tests.mjs";

const require = createRequire(import.meta.url);
const PLAYWRIGHT_ENTRYPOINT = require.resolve("@playwright/test/cli");
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const TEST_DATABASE_NAME_PATTERN =
  /(?:^|[_-])test(?:$|[_-])/iu;
const LOOPBACK_API_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fail(message) {
  throw new Error(message);
}

function requireLiveEnvironment() {
  if (process.env.TOONSPECTRUM_MARKET_LIVE_E2E !== "1") {
    fail("Set TOONSPECTRUM_MARKET_LIVE_E2E=1 to opt into the live marketplace gate.");
  }

  const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
  const database = validatePostgresIntegrationUrl(databaseUrl, {
    environment: process.env,
  });
  if (!database.loopback || !TEST_DATABASE_NAME_PATTERN.test(database.databaseName)) {
    fail("The live marketplace gate requires a loopback database with a test-scoped name.");
  }

  const rawApiUrl = process.env.TOONSPECTRUM_MARKET_LIVE_API_URL?.trim();
  if (!rawApiUrl) {
    fail("TOONSPECTRUM_MARKET_LIVE_API_URL is required.");
  }
  let apiUrl;
  try {
    apiUrl = new URL(rawApiUrl);
  } catch {
    fail("TOONSPECTRUM_MARKET_LIVE_API_URL is malformed.");
  }
  if (
    apiUrl.protocol !== "http:"
    || !LOOPBACK_API_HOSTS.has(apiUrl.hostname.toLowerCase())
    || apiUrl.username
    || apiUrl.password
    || apiUrl.pathname !== "/"
    || apiUrl.search
    || apiUrl.hash
  ) {
    fail("The live marketplace API must be an unauthenticated loopback HTTP origin.");
  }

  const email = process.env.TOONSPECTRUM_MARKET_LIVE_EMAIL?.trim();
  const password = process.env.TOONSPECTRUM_MARKET_LIVE_PASSWORD;
  if (!email || !password || password.length < 6) {
    fail("Explicit live test-account email and password values are required.");
  }

  return { apiOrigin: apiUrl.origin };
}

async function requireRunningApi(apiOrigin) {
  let response;
  try {
    response = await fetch(`${apiOrigin}/api/health/live`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    fail("The opted-in marketplace API is not reachable; start it before running this gate.");
  }
  if (!response.ok) {
    fail("The opted-in marketplace API did not pass its liveness endpoint.");
  }
}

function runPlaywright() {
  const child = spawn(
    process.execPath,
    [
      PLAYWRIGHT_ENTRYPOINT,
      "test",
      "--config=playwright.market-live.config.ts",
    ],
    {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: "inherit",
    },
  );
  return new Promise((resolvePromise, rejectPromise) => {
    child.once("error", () => {
      rejectPromise(new Error("The live marketplace Playwright process could not start."));
    });
    child.once("exit", (code, signal) => {
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
  const { apiOrigin } = requireLiveEnvironment();
  await requireRunningApi(apiOrigin);
  console.log("Live marketplace API preflight passed (loopback test target; credentials hidden).");
  await runPlaywright();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown live marketplace E2E failure.";
  console.error(`Live marketplace E2E failed: ${message}`);
  process.exitCode = 1;
});
