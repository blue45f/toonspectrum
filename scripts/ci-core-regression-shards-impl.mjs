#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TARGETS_FILE = new URL("./ci-required-vitest-targets.txt", import.meta.url);
const GLOB_PATTERN = /[*?[\]]/u;
const SAFE_TARGET = /^(?:apps|deploy|packages|scripts|tests)\/[A-Za-z0-9_./*?\[\]-]+$/u;

export const SHARD_NAMES = Object.freeze([
  "product",
  "studio-foundation",
  "studio-editing",
  "studio-3d",
  "studio-character",
]);

export const SHARD_COMMANDS = Object.freeze({
  product: Object.freeze([
    Object.freeze({
      label: "API follow-up and repository contracts",
      argv: Object.freeze([
        "bash",
        "-lc",
        [
          "node --experimental-strip-types --test --test-concurrency=1",
          "scripts/api-followup-unit.test.mjs",
          "scripts/api-followup-ci-policy.test.mjs",
          "&& pnpm run validate:architecture",
          "&& pnpm run verify:csp",
          "&& pnpm run verify:toolchain-coverage",
        ].join(" "),
      ]),
    }),
  ]),
  "studio-foundation": Object.freeze([
    Object.freeze({
      label: "Studio dependency-free contracts",
      argv: Object.freeze([
        "node",
        "--test",
        "--test-concurrency=1",
        "scripts/verify-studio-p2p-huddle.test.mjs",
        "scripts/studio-offline-resilience.test.mjs",
        "scripts/verify-studio-menus-ci.test.mjs",
      ]),
    }),
  ]),
  "studio-editing": Object.freeze([
    Object.freeze({
      label: "Material brush and portfolio contracts",
      argv: Object.freeze([
        "bash",
        "-lc",
        "pnpm run test:studio-material-brush && pnpm exec tsx scripts/audit-studio-brush-quality-portfolio.mts",
      ]),
    }),
  ]),
  "studio-3d": Object.freeze([]),
  "studio-character": Object.freeze([]),
});

export function parseRequiredTargets(source) {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const REQUIRED_VITEST_TARGETS = Object.freeze(
  parseRequiredTargets(readFileSync(TARGETS_FILE, "utf8")),
);

function isDirectoryTarget(target) {
  return !GLOB_PATTERN.test(target) && extname(target) === "";
}

export function shardForTarget(target) {
  if (
    target.startsWith("apps/api/")
    || target.startsWith("deploy/cloudflare-analytics/")
    || target === "scripts/deploy-cloudflare-analytics.test.mjs"
    || target === "scripts/free-database-federation.test.mjs"
    || target === "scripts/prepare-managed-database-bootstrap.test.mjs"
    || target === "scripts/provision-cloudflare-free-data-plane.test.mjs"
    || target === "scripts/provision-gcp-free-data-plane.test.mjs"
    || target.startsWith("packages/core/")
    || target.startsWith("apps/web/src/domains/fortune/")
    || target.startsWith("apps/web/src/shared/catalog/")
    || target === "apps/web/src/shared/lib/__tests__/search.test.ts"
    || target === "apps/web/src/platform/search-client.test.ts"
    || target === "apps/web/src/platform/use-paginated-search.test.tsx"
  ) {
    return "product";
  }

  if (
    target.includes("/bg3d/")
    || target === "apps/web/src/app/studio-cross-origin-isolation.test.ts"
    || target === "scripts/verify-studio-3d-console.test.ts"
    || target === "scripts/lib/studio-3d-production-audit-policy.test.mjs"
  ) {
    return "studio-3d";
  }

  if (
    target.includes("/vrm/")
    || target.includes("/character-shaper/")
    || target.includes("/character-platform/")
    || target === "scripts/lib/character-psd-reference-compositor.test.mjs"
  ) {
    return "studio-character";
  }

  if (
    target.includes("/brush/")
    || target.includes("/brush-lab/")
    || target.includes("/canvas/")
    || target.includes("/color/")
    || target.includes("/export")
    || target.includes("/layer")
    || target.includes("/vector/")
    || target.includes("StudioColor")
    || target.includes("StudioGroupUniformResize")
    || target.includes("StudioInspector")
    || target.includes("StudioSelection")
    || target.includes("useStudioAdjustmentLayerCommands")
    || target.includes("/studio-color-range")
    || target.includes("/studio-group-resize")
    || target.includes("/studio-large-epics")
    || target.includes("/studio-live-adjustment")
    || target.includes("/studio-live-transform")
    || target.includes("/studio-menubar")
    || target.includes("/studio-page-lazy-ui")
    || target.includes("/studio-palette")
    || target.includes("/studio-selection")
    || target.includes("/studio-smart-filter")
    || target.includes("/ai/studio-stroke-proposal")
  ) {
    return "studio-editing";
  }

  return "studio-foundation";
}

export function targetsByShard(targets = REQUIRED_VITEST_TARGETS) {
  const result = Object.fromEntries(SHARD_NAMES.map((name) => [name, []]));
  for (const target of targets) {
    result[shardForTarget(target)].push(target);
  }
  return result;
}

export function compactTargets(targets) {
  const unique = [...new Set(targets)].sort();
  const directories = unique.filter(isDirectoryTarget);
  return unique.filter((target) => (
    !directories.some((directory) => target !== directory && target.startsWith(`${directory}/`))
  ));
}

export function targetIsCovered(target, executionTargets) {
  return executionTargets.some((candidate) => (
    candidate === target
    || (isDirectoryTarget(candidate) && target.startsWith(`${candidate}/`))
  ));
}

export function executionTargetsByShard(targets = REQUIRED_VITEST_TARGETS) {
  const required = targetsByShard(targets);
  return Object.fromEntries(
    SHARD_NAMES.map((name) => [name, compactTargets(required[name])]),
  );
}

export function assertShardManifest(targets = REQUIRED_VITEST_TARGETS) {
  const sorted = [...targets].sort();
  if (targets.length === 0) throw new Error("CI regression target manifest is empty");
  if (new Set(targets).size !== targets.length) {
    throw new Error("CI regression target manifest contains duplicate arguments");
  }
  if (targets.some((target, index) => target !== sorted[index])) {
    throw new Error("CI regression target manifest must stay sorted");
  }
  for (const target of targets) {
    if (!SAFE_TARGET.test(target) || target.includes("..")) {
      throw new Error(`Unsafe CI regression target: ${target}`);
    }
  }

  const required = targetsByShard(targets);
  const execution = executionTargetsByShard(targets);
  for (const name of SHARD_NAMES) {
    if (required[name].length === 0) throw new Error(`CI regression shard is empty: ${name}`);
    for (const target of required[name]) {
      if (!targetIsCovered(target, execution[name])) {
        throw new Error(`CI regression target is not executed by ${name}: ${target}`);
      }
    }
  }
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

  const targets = executionTargetsByShard()[name];
  runCommand({
    label: `Vitest shard ${name} (${targets.length} execution targets)`,
    argv: ["pnpm", "exec", "vitest", "run", ...targets],
  });
}

function listManifest() {
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
