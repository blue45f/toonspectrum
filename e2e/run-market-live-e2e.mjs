#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  startIsolatedMarketApi,
  stopDetachedProcessTree,
  stopIsolatedMarketApi,
  validateIsolatedMarketApiTarget,
} from "../scripts/isolated-market-api.mjs";

const require = createRequire(import.meta.url);
const PLAYWRIGHT_ENTRYPOINT = require.resolve("@playwright/test/cli");
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const EMPTY_DATABASE_BOOTSTRAP = resolve(
  REPOSITORY_ROOT,
  "scripts/bootstrap-empty-production-database.mjs",
);
const EMPTY_DATABASE_BOOTSTRAP_CONFIRMATION =
  "BOOTSTRAP-EMPTY-TOONSPECTRUM-DATABASE";
const SIGNAL_EXIT_CODE = Object.freeze({ SIGINT: 130, SIGTERM: 143 });
const { Client } = pg;

let apiProcess = null;
let bootstrapProcess = null;
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
  const bootstrap = bootstrapProcess;
  cleanupPromise = (async () => {
    const stops = [
      ...(playwright ? [stopDetachedProcessTree(playwright)] : []),
      ...(api ? [stopIsolatedMarketApi(api)] : []),
      ...(bootstrap ? [stopDetachedProcessTree(bootstrap)] : []),
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
    if (bootstrapProcess === bootstrap) bootstrapProcess = null;
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

function resolveReleaseSha() {
  const environmentSha = process.env.GITHUB_SHA?.trim() ?? "";
  if (/^[0-9a-f]{40}$/u.test(environmentSha)) return environmentSha;

  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const repositorySha = result.status === 0 ? result.stdout.trim() : "";
  if (!/^[0-9a-f]{40}$/u.test(repositorySha)) {
    fail("Could not resolve the full repository SHA for isolated database bootstrap.");
  }
  return repositorySha;
}

async function databaseHasApplicationObjects(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      ) AS has_objects
    `);
    return result.rows[0]?.has_objects === true;
  } finally {
    await client.end();
  }
}

function bootstrapEmptyDatabase(target) {
  const runtimePassword = `Qa!${randomBytes(32).toString("base64url")}`;
  const releaseSha = resolveReleaseSha();

  bootstrapProcess = spawn(
    process.execPath,
    [
      EMPTY_DATABASE_BOOTSTRAP,
      "--execute",
      "--allow-loopback",
      "--runtime-database-role",
      "webdex_runtime",
      "--release-sha",
      releaseSha,
      "--confirmation",
      EMPTY_DATABASE_BOOTSTRAP_CONFIRMATION,
    ],
    {
      cwd: REPOSITORY_ROOT,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        BOOTSTRAP_RUNTIME_DATABASE_PASSWORD: runtimePassword,
        MIGRATION_DATABASE_URL: target.databaseUrl,
      },
      stdio: "inherit",
    },
  );

  return new Promise((resolvePromise, rejectPromise) => {
    const child = bootstrapProcess;
    child.once("error", () => {
      if (bootstrapProcess === child) bootstrapProcess = null;
      rejectPromise(new Error("The isolated database bootstrap process could not start."));
    });
    child.once("exit", (code, signal) => {
      if (bootstrapProcess === child) bootstrapProcess = null;
      if (signal) {
        rejectPromise(new Error("The isolated database bootstrap process was interrupted."));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error("The isolated database bootstrap failed."));
        return;
      }
      resolvePromise();
    });
  });
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
  if (!(await databaseHasApplicationObjects(target.databaseUrl))) {
    console.log(
      "Isolated marketplace QA database is empty; applying the verified production bootstrap.",
    );
    await bootstrapEmptyDatabase(target);
  }
  if (receivedSignal) return;

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
