import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  REQUIRED_VITEST_TARGETS,
  SHARD_COMMANDS,
  executionTargetsByShard,
  targetIsCovered,
} from "./ci-core-regression-shards-impl.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const required = JSON.parse(readFileSync(new URL("./api-followup-test-files.json", import.meta.url), "utf8"));

test("runtime follow-up tests and the long-running API artifact remain mandatory", () => {
  const staticJob = workflow.split("  static:")[1]?.split("  serial:")[0] ?? "";
  const shardRunner = 'node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"';
  const productCommand = SHARD_COMMANDS.product.find(
    ({ label }) => label === "API follow-up and repository contracts",
  );

  assert.ok(productCommand, "Product shard must keep the API follow-up command");
  assert.deepEqual(productCommand.argv.slice(0, 2), ["bash", "-lc"]);
  const command = productCommand.argv.join(" ");
  assert.match(command, /node --experimental-strip-types --test --test-concurrency=1/);
  for (const marker of [
    "scripts/api-followup-unit.test.mjs",
    "scripts/api-followup-ci-policy.test.mjs",
  ]) {
    assert.equal(
      command.split(marker).length,
      2,
      `${marker} must execute exactly once in the product shard command`,
    );
  }
  assert.match(command, /&& pnpm run validate:architecture/);
  assert.match(command, /&& pnpm run verify:csp/);
  assert.match(command, /&& pnpm run verify:toolchain-coverage/);

  assert.match(staticJob, /^\s+- product$/m);
  assert.equal(
    staticJob.split(shardRunner).length,
    2,
    "The mandatory static matrix must invoke the shard runner exactly once",
  );
  assert.doesNotMatch(staticJob, /continue-on-error|\bif:/);

  const productExecutionTargets = executionTargetsByShard().product;
  for (const file of required) {
    assert.equal(
      REQUIRED_VITEST_TARGETS.filter((target) => target === file).length,
      1,
      `Regression target must be registered exactly once: ${file}`,
    );
    assert.ok(
      targetIsCovered(file, productExecutionTargets),
      `Product shard does not execute regression target: ${file}`,
    );
  }

  assert.ok(workflow.includes("pnpm --filter @webtoon-nest/api build"));
  assert.ok(workflow.includes("test -s apps/api/dist/apps/api/src/main.js"));
  assert.ok(workflow.includes("node --check apps/api/dist/apps/api/src/main.js"));
  assert.ok(!workflow.includes("verify:api-serverless-build"));
});
