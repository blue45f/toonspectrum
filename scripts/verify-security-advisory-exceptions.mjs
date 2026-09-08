#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * GHSA-qwww-vcr4-c8h2 now correctly lists React Router 7.18.2 as patched.
 * The temporary metadata exception is retired: audits must report every
 * advisory, including development dependencies and low-severity findings.
 */
export function verifySecurityAdvisoryExceptions({ root = REPOSITORY_ROOT } = {}) {
  const workspace = parseYaml(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
  const ignored = Object.entries(workspace?.auditConfig ?? {}).filter(([key, value]) =>
    key.startsWith("ignore") && (!Array.isArray(value) || value.length > 0),
  );
  if (ignored.length > 0) {
    throw new Error(
      `Security advisory exceptions are not permitted: ${ignored.map(([key]) => key).join(", ")}.`,
    );
  }
  return Object.freeze({ ignoredGhsas: Object.freeze([]) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifySecurityAdvisoryExceptions();
  process.stdout.write("Verified that no security advisories are excluded from the audit.\n");
}
