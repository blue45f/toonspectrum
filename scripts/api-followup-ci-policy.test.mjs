import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadRequiredTargets } from "./run-core-vitest.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const shardRunner = readFileSync(new URL("./ci-core-regression-shards-impl.mjs", import.meta.url), "utf8");
const required = JSON.parse(readFileSync(new URL("./api-followup-test-files.json", import.meta.url), "utf8"));
const requiredPortfolio = new Set(
  readFileSync(new URL("./ci-required-vitest-targets.txt", import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean),
);

test("runtime follow-up tests and the long-running API artifact remain mandatory", () => {
  assert.match(
    workflow,
    /node scripts\/ci-core-regression-shards\.mjs "\$\{\{ matrix\.shard \}\}"/,
  );
  assert.ok(shardRunner.includes("API follow-up and repository contracts"));
  assert.ok(shardRunner.includes("scripts/api-followup-unit.test.mjs"));
  assert.ok(shardRunner.includes("scripts/api-followup-ci-policy.test.mjs"));
  assert.ok(shardRunner.includes("pnpm run validate:architecture"));
  assert.ok(shardRunner.includes("pnpm run verify:csp"));
  assert.ok(shardRunner.includes("pnpm run verify:toolchain-coverage"));
  assert.doesNotMatch(shardRunner, /continue-on-error|\|\| true/);
  for (const file of required) {
    assert.ok(requiredPortfolio.has(file), `Missing regression from required portfolio: ${file}`);
  }
  assert.ok(workflow.includes("pnpm --filter @webtoon-nest/api build"));
  assert.ok(workflow.includes("test -s apps/api/dist/apps/api/src/main.js"));
  assert.ok(workflow.includes("node --check apps/api/dist/apps/api/src/main.js"));
  assert.ok(!workflow.includes("verify:api-serverless-build"));
});
