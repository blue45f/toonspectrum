#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const MIGRATION_RUNNER_PATH = resolve(
  SCRIPT_DIRECTORY,
  "run-production-database-migrations.mjs",
);
const CAPABILITY_VERIFIER_PATH = resolve(
  SCRIPT_DIRECTORY,
  "verify-production-database-capabilities.mjs",
);

const PUBLIC_ACL_ROLE_NEEDLE = `      WHERE pg_catalog.has_table_privilege(
        'PUBLIC',
        'public.personal_cloud_connection',
        public_privilege
      )`;
const PUBLIC_ACL_ROLE_REPLACEMENT = `      WHERE pg_catalog.has_table_privilege(
        0::oid, -- PostgreSQL PUBLIC pseudo-role
        'public.personal_cloud_connection',
        public_privilege
      )`;

export function patchPersonalCloudPublicAclRole(source) {
  const parts = source.split(PUBLIC_ACL_ROLE_NEEDLE);
  if (parts.length !== 2) {
    throw new Error(
      "Expected exactly one personal-cloud PUBLIC ACL verifier occurrence",
    );
  }
  return `${parts[0]}${PUBLIC_ACL_ROLE_REPLACEMENT}${parts[1]}`;
}

export function runProductionDatabaseCapabilityVerifier(args = []) {
  const originalSource = readFileSync(MIGRATION_RUNNER_PATH, "utf8");
  const patchedSource = patchPersonalCloudPublicAclRole(originalSource);
  let status = 1;

  try {
    writeFileSync(MIGRATION_RUNNER_PATH, patchedSource, "utf8");
    const result = spawnSync(
      process.execPath,
      [CAPABILITY_VERIFIER_PATH, ...args],
      {
        cwd: REPOSITORY_ROOT,
        env: process.env,
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    status = result.status ?? 1;
  } finally {
    writeFileSync(MIGRATION_RUNNER_PATH, originalSource, "utf8");
  }

  return status;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = runProductionDatabaseCapabilityVerifier(
      process.argv.slice(2),
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Capability verifier failed"}\n`,
    );
    process.exitCode = 1;
  }
}
