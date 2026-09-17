import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));
const policy = join(root, "scripts/verify-pr-workflow-fanout.py");
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const jobs = workflow.slice(workflow.indexOf("\njobs:\n") + 7).split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);
const guard = (directory) => spawnSync("python3", [policy, "--root", directory], {
  encoding: "utf8",
  timeout: 10_000,
});

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

test("the production trigger policy succeeds without installing project dependencies", () => {
  const result = guard(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /21 product workflows/);
});

const mutations = [
  ["missing synchronize", (text) => text.replace("opened, reopened, synchronize", "opened, reopened")],
  ["unbounded feature-branch pushes", (text) => text.replace(/( {2}push:\n) {4}branches: .*\n/, "$1")],
  ["wildcard push branches", (text) => text.replace(/( {2}push:\n) {4}branches: .*\n/, '$1    branches: ["**"]\n')],
  ["different path coverage", (text) => text.replace(/( {2}push:[\s\S]*? {4}paths:\n)/, '$1      - "unreviewed/**"\n')],
  ["missing self-validation", (text) => text.replaceAll('      - ".github/workflows/character-merge-validation.yml"\n', "")],
  ["missing manual verification", (text) => text.replace("  workflow_dispatch:\n", "")],
  ["shared cancellation group", (text) => text.replace(/ {2}group: .*/, "  group: all-ci")],
  ["SHA-keyed cancellation", (text) => text.replace("github.event.pull_request.number || github.ref", "github.sha")],
  ["disabled stale-run cancellation", (text) => text.replace("cancel-in-progress: true", "cancel-in-progress: false")],
  ["commented cancellation group", (text) => text.replace("  group:", "  # group:")],
  ["commented cancellation policy", (text) => text.replace("  cancel-in-progress:", "  # cancel-in-progress:")],
];

test("fanout guard rejects every unsafe trigger mutation in one table-driven contract", () => {
  for (const [label, mutate] of mutations) {
    const fixture = mkdtempSync(join(tmpdir(), "toon-ci-policy-"));
    try {
      cpSync(join(root, ".github"), join(fixture, ".github"), { recursive: true });
      const target = join(fixture, ".github/workflows/character-merge-validation.yml");
      const original = readFileSync(target, "utf8");
      const modified = mutate(original);
      assert.notEqual(modified, original, `${label}: mutation must modify the workflow`);
      writeFileSync(target, modified);
      const result = guard(fixture);
      assert.equal(result.status, 1, `${label}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /character-merge-validation.yml/, label);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }
});

test("lint, typecheck and regressions run as independent installed lanes", () => {
  const expectations = [
    ["lint", "pnpm run lint:strict"],
    ["typecheck", "pnpm run typecheck"],
    ["static", "node scripts/run-core-vitest.mjs"],
  ];
  for (const [name, command] of expectations) {
    const block = job(name);
    const install = block.indexOf("pnpm install --frozen-lockfile");
    const execute = block.indexOf(command);
    assert.ok(install >= 0, `${name} must install dependencies`);
    assert.ok(execute > install, `${name} must execute after installation`);
    assert.doesNotMatch(block, /^ {4}needs:/m, `${name} must start independently`);
  }
  assert.match(job("typecheck"), /pnpm run typecheck:cloudflare-realtime/);
  assert.doesNotMatch(job("static"), /pnpm run lint:strict|pnpm run typecheck(?:\s|$)/);
});

test("build trusts the protected typecheck lane and only creates deployable artifacts", () => {
  const build = job("build");
  assert.match(build, /pnpm run build:bundle/);
  assert.doesNotMatch(build, /pnpm run build(?!:)/);
  assert.match(build, /pnpm run check:studio-bundle/);
  assert.match(build, /test -s dist\/\.vite\/manifest\.json/);
});

test("required core runs on every main PR, main push and merge group without path skipping", () => {
  const events = workflow.split("\non:\n")[1].split("\npermissions:\n")[0];
  assert.match(events, / {2}pull_request:\n {4}branches: \[main\]/);
  assert.match(events, / {2}push:\n {4}branches: \[main\]/);
  assert.match(events, / {2}merge_group:/);
  assert.doesNotMatch(events, /paths(?:-ignore)?:|types:/);
  assert.doesNotMatch(workflow, /continue-on-error|CI_CORE_BYPASS/);
  assert.match(workflow, new RegExp(`needs: \\[${REQUIRED_CORE_GATES.join(", ")}\\]`));
});

test("dependency-free workflow policy checks run before installation in the sparse typecheck lane", () => {
  assert.doesNotMatch(workflow, /^ {2}preflight:\n/m);
  const typecheck = job("typecheck");
  const contracts = typecheck.indexOf("node --test scripts/ci-core-gate.test.mjs");
  const fanout = typecheck.indexOf("python3 scripts/verify-pr-workflow-fanout.py");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  assert.ok(contracts >= 0);
  assert.ok(fanout > contracts);
  assert.ok(install > fanout);
  assert.match(typecheck, /filter: blob:none/);
  assert.match(typecheck, /sparse-checkout:/);
  assert.match(typecheck, /\/apps\/web\/public\/assets\/3d\/environments\/refined-v6\/manifest\.json/);
  assert.match(typecheck, /\/apps\/web\/public\/assets\/3d\/environments\/expansion-v1\/manifest\.json/);

  const lint = job("lint");
  assert.match(lint, /filter: blob:none/);
  assert.match(lint, /!\/apps\/web\/public\/assets\//);
  assert.match(lint, /\/apps\/web\/public\/assets\/reference-rebuild\//);
  assert.match(lint, /!\/apps\/web\/public\/vrm\//);
});

test("the protected aggregate performs no repository checkout or dependency setup", () => {
  const core = job("core");
  assert.match(core, /if: \$\{\{ always\(\) \}\}/);
  assert.match(core, /CORE_RESULTS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.doesNotMatch(core, /actions\/checkout|actions\/setup-node|pnpm/);
});

test("the market delivery lane replaces stale runs without skipping its regressions", () => {
  const market = readFileSync(join(root, ".github/workflows/market-cc0-delivery.yml"), "utf8");
  assert.match(market, /group: \$\{\{ github.workflow \}\}-\$\{\{ github.event.pull_request.number \|\| github.ref \}\}/);
  assert.match(market, /cancel-in-progress: true/);
  assert.match(market, /run: node --import tsx scripts\/generate-market-cc0-catalog.mts --check/);
  assert.match(market, /pnpm exec vitest run/);
});
