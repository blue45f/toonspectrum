import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const source = readFileSync(new URL("../.github/workflows/ci-throughput-validation.yml", import.meta.url), "utf8");
const workflow = parse(source);

function validate(candidate) {
  assert.deepEqual(Object.keys(candidate.on), ["workflow_dispatch"]);
  assert.deepEqual(candidate.permissions, { contents: "read" });
  assert.equal(candidate.concurrency["cancel-in-progress"], false);
  const job = candidate.jobs.validate;
  assert.match(job.if, /github\.ref == 'refs\/heads\/main'/u);
  assert.equal(job["timeout-minutes"], 25);
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(checkout.with.ref, undefined, "validate github.sha, not an obsolete source");
  const commands = job.steps.map((step) => step.run ?? "").join("\n");
  assert.match(commands, /git rev-parse HEAD/u);
  assert.match(commands, /pnpm run typecheck/u);
  assert.match(commands, /pnpm run validate:architecture/u);
  assert.match(commands, /pnpm run build:bundle/u);
  assert.match(commands, /node scripts\/check-studio-bundle\.mjs/u);
  assert.match(commands, /pnpm run test:studio-virtual-art/u);
  assert.match(commands, /pnpm run verify:studio-virtual-art/u);
  assert.match(commands, /git diff --exit-code/u);
  assert.doesNotMatch(commands, /\bcurl\b|\bgh api\b|\bgit push\b|--no-verify|\|\|\s*true/u);
  assert.equal(job.steps.some((step) => step["continue-on-error"]), false);
  const receipt = job.steps.find((step) => step.name === "Preserve outcome without claiming a deployment");
  assert.equal(receipt.if, "always()");
  assert.match(receipt.run, /branch_updated=false/u);
  assert.match(receipt.run, /deployed=false/u);
  const artifact = job.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(artifact.if, "always()");
  assert.equal(artifact.with["retention-days"], 3);
}

test("manual throughput verification tests current main without writing repository objects", () => validate(workflow));
test("throughput verification rejects automatic fanout and write permissions", () => {
  const automatic = structuredClone(workflow); automatic.on.push = {};
  assert.throws(() => validate(automatic));
  const writable = structuredClone(workflow); writable.permissions.contents = "write";
  assert.throws(() => validate(writable));
});
test("throughput verification rejects stale checkout and failure masking", () => {
  const stale = structuredClone(workflow); stale.jobs.validate.steps[0].with.ref = "old-commit";
  assert.throws(() => validate(stale));
  const masked = structuredClone(workflow); masked.jobs.validate.steps[1]["continue-on-error"] = true;
  assert.throws(() => validate(masked));
});
