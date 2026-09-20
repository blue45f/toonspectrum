#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  POSTGRES_INTEGRATION_SUITES,
  createPostgresIntegrationEnvironment,
  createVitestArguments,
  resolvePostgresIntegrationTarget,
  runPostgresIntegrationTests,
} from "./run-postgres-integration-tests.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** The root collection is unchanged; only the already executed DB files move to the serial phase. */
export function fullTestRemainderArguments() {
  return [createVitestArguments()[0], "run",
    ...POSTGRES_INTEGRATION_SUITES.flatMap((suite) => ["--exclude", suite])];
}

export function runFullTestChild(command, args, environment, spawnChild = spawn) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawnChild(command, args, { cwd: ROOT, env: environment, stdio: "inherit" });
    child.once("error", () => rejectRun(new Error("Full test process could not start.")));
    child.once("exit", (code, signal) => {
      if (signal || code !== 0) rejectRun(new Error(`Full test process failed (${signal ?? code ?? "unknown"}).`));
      else resolveRun();
    });
  });
}

/** Same root + perf union as pnpm test, with real database mutations serialized first. */
export async function runFullTestCi({
  environment = process.env,
  runDatabase = runPostgresIntegrationTests,
  runChild = runFullTestChild,
} = {}) {
  const target = resolvePostgresIntegrationTarget({ environment });
  const childEnvironment = createPostgresIntegrationEnvironment(target.databaseUrl, environment, {
    runtimeDatabaseRole: target.runtimeDatabaseRole,
    validatedRemoteDatabase: !target.loopback,
  });
  // This retains the PG preflight, every required DB suite, and the marketplace verifier.
  await runDatabase({ arguments_: [], environment });
  await runChild(process.execPath, fullTestRemainderArguments(), childEnvironment);
  await runChild("pnpm", ["run", "test:perf"], childEnvironment);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runFullTestCi().catch((error) => {
    console.error(error instanceof Error ? error.message : "Full test suite failed.");
    process.exitCode = 1;
  });
}
