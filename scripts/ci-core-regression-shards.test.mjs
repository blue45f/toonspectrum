import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_VITEST_TARGETS,
  CORE_DATABASE_VITEST_TARGETS,
  buildShardVitestArgs,
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

import { resolveRequiredTargets } from "./run-core-vitest.mjs";

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

test("required foundation execution includes virtual-world consent, media and compiler integration regressions", () => {
  const foundation = executionTargetsByShard()["studio-foundation"];
  for (const target of [
    "apps/web/src/domains/creator/virtual-space",
    "apps/web/src/domains/creator/review-handoff",
    "apps/web/src/domains/creator/review-export",
    "apps/web/src/domains/creator/review-production",
    "apps/web/src/domains/creator/review-task-completion",
    "apps/web/src/domains/creator/review-resolution",
    "packages/studio-project-model/src/__tests__/review-task-role-assignment.test.ts",
    "apps/web/src/domains/creator/studio-comment-editor-selection.test.ts",
    "apps/web/src/domains/creator/live/huddle",
    "apps/web/tests/vite-react-compiler-runtime-interop.test.ts",
  ]) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(target), `missing protected regression target: ${target}`);
    assert.equal(shardForTarget(target), "studio-foundation", target);
    assert.ok(targetIsCovered(target, foundation), `target must execute in foundation: ${target}`);
  }
  for (const test of [
    "apps/web/src/domains/creator/review-handoff/studio-review-editor-host.test.ts",
    "apps/web/src/domains/creator/review-handoff/StudioReviewEditorHandoffMount.test.tsx",
    "apps/web/src/domains/creator/review-production/studio-review-production-controller.test.ts",
    "apps/web/src/domains/creator/review-production/StudioReviewProductionConnection.test.tsx",
    "apps/web/src/domains/creator/review-resolution/StudioReviewResolution.test.tsx",
    "apps/web/src/domains/creator/review-task-completion/StudioReviewTaskCompletion.test.tsx",
    "apps/web/src/domains/creator/review-task-completion/studio-review-task-completion-controller.test.ts",
    "apps/web/src/domains/creator/review-export/studio-review-export.test.ts",
    "apps/web/src/domains/creator/review-export/StudioReviewExport.test.tsx",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-social.test.ts",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-world.test.ts",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-npc-director.test.ts",
    "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.test.ts",
    "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-events.test.ts",
  ]) assert.ok(targetIsCovered(test, foundation), `required execution omitted ${test}`);
});

test("real product selectors partition into static and mandatory PostgreSQL execution without losing or duplicating a suite", () => {
  const selectors = expandGlobTargets(executionTargetsByShard().product);
  const all = resolveRequiredTargets(selectors);
  const args = buildShardVitestArgs(selectors);
  const routed = args.flatMap((arg, i) => arg === "--exclude" ? [args[i + 1]] : []);
  assert.deepEqual(routed, [...CORE_DATABASE_VITEST_TARGETS]);
  const staticOnly = all.filter((file) => !routed.includes(file));
  assert.ok(staticOnly.includes("apps/api/src/modules/studio-project-graph/studio-project-graph.module.test.ts"));
  assert.ok(staticOnly.includes("apps/api/src/modules/studio-project-graph/studio-review-preview-producer.service.test.ts"));
  assert.deepEqual([...staticOnly, ...routed].sort(), [...all].sort());
  assert.equal(new Set([...staticOnly, ...routed]).size, all.length);
  assert.ok(routed.every((file) => file.endsWith(".integration.test.ts")));
  for (const name of SHARD_NAMES.filter((name) => name !== "product")) {
    assert.ok(!buildShardVitestArgs(expandGlobTargets(executionTargetsByShard()[name])).includes("--exclude"));
  }
});

test("분석·분산 저장소의 비DB 테스트는 product shard에서 반드시 실행한다", () => {
  const selectors = expandGlobTargets(executionTargetsByShard().product);
  const executed = resolveRequiredTargets(selectors);
  for (const target of [
    "apps/api/src/config/env.test.ts",
    "apps/api/src/platform/federated-data-plane/federated-data-plane-routing.test.ts",
    "apps/api/src/platform/federated-data-plane/federated-data-plane.module.test.ts",
    "apps/api/src/modules/admin/admin-traffic-d1-query.test.ts",
    "apps/api/src/modules/admin/admin-traffic-query.test.ts",
    "apps/api/src/modules/admin/admin-traffic.service.test.ts",
    "apps/api/src/modules/health/health-analytics-readiness.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-d1.client.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-d1.repository.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-repository.provider.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-store.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics.controller.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics.service.test.ts",
    "deploy/cloudflare-analytics/src/index.test.ts",
    "scripts/deploy-cloudflare-analytics.test.mjs",
    "scripts/free-database-federation.test.mjs",
    "scripts/prepare-managed-database-bootstrap.test.mjs",
    "scripts/provision-cloudflare-free-data-plane.test.mjs",
    "scripts/provision-gcp-free-data-plane.test.mjs",
  ]) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(target), `필수 회귀 목록 누락: ${target}`);
    assert.equal(shardForTarget(target), "product", target);
    assert.ok(executed.includes(target), `product 실행 목록 누락: ${target}`);
  }
  assert.ok(!executed.includes("apps/api/src/modules/traffic-analytics/traffic-analytics-parity.postgres.test.ts"),
    "opt-in PostgreSQL 비교는 비DB shard에서 실행하지 않는다");
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
