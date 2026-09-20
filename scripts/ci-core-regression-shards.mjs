#!/usr/bin/env node
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  SHARD_COMMANDS,
  SHARD_NAMES,
  assertShardManifest,
  executionTargetsByShard,
  targetsByShard,
  targetIsCovered,
} from "./ci-core-regression-shards-impl.mjs";

export * from "./ci-core-regression-shards-impl.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const GLOB_PATTERN = /[*?[\]]/u;

/** These mandatory suites belong to the real PostgreSQL lane, never to a DB-less shard. */
export const CORE_DATABASE_VITEST_TARGETS = Object.freeze([
  "apps/api/src/modules/studio-project-graph/studio-project-graph-review-race.integration.test.ts",
  "apps/api/src/modules/studio-project-graph/studio-review-preview-producer.integration.test.ts",
  "apps/api/src/modules/studio-project-graph/studio-world-publication.integration.test.ts",
]);

export function buildShardVitestArgs(targets) {
  const databaseOwned = CORE_DATABASE_VITEST_TARGETS.filter((target) => targetIsCovered(target, targets));
  return ["pnpm", "exec", "vitest", "run", ...targets,
    ...databaseOwned.flatMap((target) => ["--exclude", target]), "--pool=forks", "--maxWorkers=4"];
}

export function expandGlobTargets(
  targets,
  { cwd = ROOT, glob = globSync } = {},
) {
  const expanded = [];
  for (const target of targets) {
    if (!GLOB_PATTERN.test(target)) {
      expanded.push(target);
      continue;
    }

    const matches = glob(target, { cwd }).sort();
    if (matches.length === 0) {
      throw new Error(`CI regression glob did not match any files: ${target}`);
    }
    expanded.push(...matches);
  }
  return [...new Set(expanded)].sort();
}

function runCommand({ label, argv }) {
  console.log(`\n[core-regressions] ${label}`);
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

export function runShard(name) {
  if (!SHARD_NAMES.includes(name)) {
    throw new Error(`Unknown CI regression shard: ${name || "<empty>"}`);
  }
  assertShardManifest();

  for (const command of SHARD_COMMANDS[name]) runCommand(command);

  const targets = expandGlobTargets(executionTargetsByShard()[name]);
  runCommand({
    label: `Vitest shard ${name} (${targets.length} expanded execution targets)`,
    argv: buildShardVitestArgs(targets),
  });
}

function listManifest() {
  assertShardManifest();
  const required = targetsByShard();
  const execution = executionTargetsByShard();
  console.log(JSON.stringify({
    shards: SHARD_NAMES.map((name) => ({
      name,
      requiredTargets: required[name].length,
      executionTargets: execution[name],
      commands: SHARD_COMMANDS[name].map(({ label, argv }) => ({ label, argv })),
    })),
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "--list") listManifest();
    else runShard(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CI regression shard failed");
    process.exitCode = 1;
  }
}
