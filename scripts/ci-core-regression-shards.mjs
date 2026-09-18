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
} from "./ci-core-regression-shards-impl.mjs";

export * from "./ci-core-regression-shards-impl.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const GLOB_PATTERN = /[*?[\]]/u;

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
    argv: ["pnpm", "exec", "vitest", "run", ...targets, "--pool=forks", "--maxWorkers=4"],
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
