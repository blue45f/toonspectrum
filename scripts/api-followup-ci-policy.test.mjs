import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const required = JSON.parse(readFileSync(new URL("./api-followup-test-files.json", import.meta.url), "utf8"));

test("runtime follow-up tests and the long-running API artifact remain mandatory", () => {
  const marker = "      - name: API runtime follow-up regressions\n";
  assert.ok(workflow.includes(marker));
  const step = workflow.split(marker)[1].split("      - name:")[0];
  assert.match(step, /pnpm exec vitest run/);
  assert.match(step, /set -euo pipefail/);
  assert.doesNotMatch(step, /continue-on-error|\bif:/);
  for (const file of required) assert.ok(step.includes(file), `Missing regression: ${file}`);
  assert.ok(step.includes("scripts/api-followup-unit.test.mjs"));
  assert.ok(workflow.includes("pnpm --filter @webtoon-nest/api build"));
  assert.ok(workflow.includes("test -s apps/api/dist/apps/api/src/main.js"));
  assert.ok(workflow.includes("node --check apps/api/dist/apps/api/src/main.js"));
  assert.ok(!workflow.includes("verify:api-serverless-build"));
});
