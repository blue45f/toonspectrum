import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadRequiredTargets } from "./run-core-vitest.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const required = JSON.parse(
  readFileSync(new URL("./api-followup-test-files.json", import.meta.url), "utf8"),
);
const coreTargets = new Set(loadRequiredTargets());

test("runtime follow-up tests and the API artifact remain mandatory", () => {
  assert.match(workflow, /run: node scripts\/run-core-vitest\.mjs/);
  for (const file of required) {
    assert.ok(coreTargets.has(file), `Missing regression manifest target: ${file}`);
  }
  assert.match(workflow, /scripts\/api-followup-ci-policy\.test\.mjs/);
  assert.match(workflow, /scripts\/api-followup-unit\.test\.mjs/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.ok(workflow.includes("pnpm --filter @webtoon-nest/api build"));
  assert.ok(workflow.includes("test -s apps/api/dist/apps/api/src/main.js"));
  assert.ok(workflow.includes("node --check apps/api/dist/apps/api/src/main.js"));
  assert.ok(!workflow.includes("verify:api-serverless-build"));
});
