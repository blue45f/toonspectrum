import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadRequiredTargets } from "./run-core-vitest.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const required = JSON.parse(readFileSync(new URL("./api-followup-test-files.json", import.meta.url), "utf8"));
const requiredPortfolio = new Set(
  readFileSync(new URL("./ci-required-vitest-targets.txt", import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean),
);

test("runtime follow-up tests and the long-running API artifact remain mandatory", () => {
  const marker = "      - name: API runtime follow-up policy\n";
  assert.ok(workflow.includes(marker));
  const step = workflow.split(marker)[1].split("      - name:")[0];
  assert.match(step, /set -euo pipefail/);
  assert.doesNotMatch(step, /continue-on-error|\bif:/);
  assert.ok(step.includes("scripts/api-followup-unit.test.mjs"));
  assert.ok(step.includes("scripts/api-followup-ci-policy.test.mjs"));
  assert.match(workflow, /mapfile -t targets < scripts\/ci-required-vitest-targets\.txt/);
  assert.match(workflow, /pnpm exec vitest run "\$\{targets\[@\]\}"/);
  for (const file of required) {
    assert.ok(requiredPortfolio.has(file), `Missing regression from required portfolio: ${file}`);
  }
  assert.ok(workflow.includes("pnpm --filter @webtoon-nest/api build"));
  assert.ok(workflow.includes("test -s apps/api/dist/apps/api/src/main.js"));
  assert.ok(workflow.includes("node --check apps/api/dist/apps/api/src/main.js"));
  assert.ok(!workflow.includes("verify:api-serverless-build"));
});
