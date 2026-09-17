#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Must match the real protected dependencies in .github/workflows/ci.yml. */
export const REQUIRED_CORE_GATES = Object.freeze([
  "preflight",
  "lint",
  "typecheck",
  "static",
  "serial",
  "build",
]);

export function assertCoreResults(results) {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    throw new Error("core requires a non-empty GitHub needs object");
  }

  const unexpected = Object.keys(results).filter((key) => !REQUIRED_CORE_GATES.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`core has unrecognized dependencies: ${unexpected.join(", ")}`);
  }

  const failed = REQUIRED_CORE_GATES.filter(
    (name) => !Object.hasOwn(results, name) || results[name]?.result !== "success",
  );
  if (failed.length > 0) {
    throw new Error(
      `core requires actual success from ${failed.join(", ")}; missing, skipped, cancelled and failed results are rejected`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertCoreResults(JSON.parse(process.env.CORE_RESULTS ?? "null"));
    console.log(`core: all required checks succeeded (${REQUIRED_CORE_GATES.join(", ")})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid core results");
    process.exitCode = 1;
  }
}
