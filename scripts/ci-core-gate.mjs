#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Must match the real job dependencies in ci.yml; no configurable bypass. */
export const REQUIRED_CORE_GATES = Object.freeze(["static", "serial", "build"]);

export function assertCoreResults(results) {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    throw new Error("core requires a non-empty GitHub needs object");
  }
  const unexpected = Object.keys(results).filter((key) => !REQUIRED_CORE_GATES.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`core has unrecognized dependencies: ${unexpected.join(", ")}`);
  }
  for (const name of REQUIRED_CORE_GATES) {
    if (!Object.hasOwn(results, name) || results[name]?.result !== "success") {
      throw new Error(`core requires actual success from ${name}; missing, skipped, cancelled and failed results are rejected`);
    }
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
