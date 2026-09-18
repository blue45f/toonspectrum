import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_VITEST_TARGETS,
  SHARD_COMMANDS,
  SHARD_NAMES,
  assertShardManifest,
  compactTargets,
  executionTargetsByShard,
  expandGlobTargets,
  shardForTarget,
  targetIsCovered,
  targetsByShard,
} from "./ci-core-regression-shards.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("required regression manifest remains sorted, unique and partitioned exactly once", () => {
  assert.doesNotThrow(() => assertShardManifest());
  assert.ok(REQUIRED_VITEST_TARGETS.length >= 160, "unexpected regression coverage shrink");
  assert.deepEqual(
    REQUIRED_VITEST_TARGETS,
    [...REQUIRED_VITEST_TARGETS].sort(),
  );
  assert.equal(new Set(REQUIRED_VITEST_TARGETS).size, REQUIRED_VITEST_TARGETS.length);

  const required = targetsByShard();
  const flattened = SHARD_NAMES.flatMap((name) => required[name]);
  assert.deepEqual(flattened.sort(), [...REQUIRED_VITEST_TARGETS].sort());
  assert.equal(new Set(flattened).size, flattened.length);
  assert.ok(SHARD_NAMES.every((name) => required[name].length > 0));
});

test("semantic sharding keeps expensive domains isolated", () => {
  const fixtures = new Map([
    ["apps/api/src/runtime/runtime-boundary.test.ts", "product"],
    ["packages/core/src/server/home.cpu-cache.test.ts", "product"],
    ["apps/web/src/domains/creator/studio-project-creation.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx", "studio-editing"],
    ["apps/web/src/domains/creator/bg3d/studio-bg3d-camera-selection.test.ts", "studio-3d"],
    ["apps/web/src/domains/creator/vrm/studio-vrm-wardrobe.test.ts", "studio-character"],
    ["apps/web/src/domains/creator/character-shaper/character-shaper-export.test.ts", "studio-character"],
  ]);
  for (const [target, expected] of fixtures) {
    assert.equal(shardForTarget(target), expected, target);
  }
});

test("directory targets remove redundant child execution without reducing coverage", () => {
  const input = [
    "apps/web/src/domains/creator/export",
    "apps/web/src/domains/creator/export/studio-psd-adjustment-graph.test.ts",
    "apps/web/src/domains/creator/layer",
    "apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx",
  ];
  const compacted = compactTargets(input);
  assert.deepEqual(compacted, [
    "apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx",
    "apps/web/src/domains/creator/export",
    "apps/web/src/domains/creator/layer",
  ]);
  for (const target of input) assert.ok(targetIsCovered(target, compacted), target);

  const required = targetsByShard();
  const execution = executionTargetsByShard();
  for (const name of SHARD_NAMES) {
    assert.ok(execution[name].length <= required[name].length);
    for (const target of required[name]) {
      assert.ok(targetIsCovered(target, execution[name]), `${name}:${target}`);
    }
  }
});

test("glob targets expand before spawning Vitest without duplicating matches", () => {
  const patterns = [];
  const expanded = expandGlobTargets(
    [
      "apps/web/src/plain.test.ts",
      "apps/web/src/studio-*.test.ts",
      "apps/web/src/other-?.test.ts",
    ],
    {
      cwd: "/fixture",
      glob(pattern, options) {
        patterns.push([pattern, options.cwd]);
        if (pattern.includes("studio-")) {
          return [
            "apps/web/src/studio-b.test.ts",
            "apps/web/src/studio-a.test.ts",
          ];
        }
        return [
          "apps/web/src/other-a.test.ts",
          "apps/web/src/studio-a.test.ts",
        ];
      },
    },
  );

  assert.deepEqual(patterns, [
    ["apps/web/src/studio-*.test.ts", "/fixture"],
    ["apps/web/src/other-?.test.ts", "/fixture"],
  ]);
  assert.deepEqual(expanded, [
    "apps/web/src/other-a.test.ts",
    "apps/web/src/plain.test.ts",
    "apps/web/src/studio-a.test.ts",
    "apps/web/src/studio-b.test.ts",
  ]);

  assert.throws(
    () => expandGlobTargets(["apps/web/src/missing-*.test.ts"], { glob: () => [] }),
    /did not match any files/,
  );
});

test("each non-Vitest contract has one owning shard", () => {
  assert.deepEqual(Object.keys(SHARD_COMMANDS), [...SHARD_NAMES]);
  const serialized = SHARD_NAMES.flatMap((name) => SHARD_COMMANDS[name])
    .map(({ argv }) => argv.join(" "))
    .join("\n");
  for (const command of [
    "scripts/api-followup-unit.test.mjs",
    "scripts/api-followup-ci-policy.test.mjs",
    "pnpm run validate:architecture",
    "pnpm run verify:csp",
    "pnpm run verify:toolchain-coverage",
    "scripts/verify-studio-p2p-huddle.test.mjs",
    "scripts/studio-offline-resilience.test.mjs",
    "scripts/verify-studio-menus-ci.test.mjs",
    "pnpm run test:studio-material-brush",
    "scripts/audit-studio-brush-quality-portfolio.mts",
  ]) {
    assert.equal(serialized.split(command).length - 1, 1, command);
  }
});

test("list mode validates the manifest without installing dependencies", () => {
  const script = fileURLToPath(new URL("./ci-core-regression-shards.mjs", import.meta.url));
  const listed = spawnSync(process.execPath, [script, "--list"], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  const payload = JSON.parse(listed.stdout);
  assert.deepEqual(payload.shards.map(({ name }) => name), [...SHARD_NAMES]);
  assert.ok(payload.shards.every(({ requiredTargets, executionTargets }) => (
    requiredTargets > 0 && executionTargets.length > 0
  )));

  const invalid = spawnSync(process.execPath, [script, "not-a-shard"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown CI regression shard/);
});
