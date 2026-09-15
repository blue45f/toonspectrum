import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));
const policy = join(root, "scripts/verify-pr-workflow-fanout.py");
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const guard = (directory) => spawnSync("python3", [policy, "--root", directory], {
  encoding: "utf8", timeout: 10_000,
});

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

for (const [label, mutate] of mutations) {
  test(`fanout guard rejects ${label}`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "toon-ci-policy-"));
    try {
      cpSync(join(root, ".github"), join(fixture, ".github"), { recursive: true });
      const target = join(fixture, ".github/workflows/character-merge-validation.yml");
      const original = readFileSync(target, "utf8");
      const modified = mutate(original);
      assert.notEqual(modified, original, "mutation must actually modify the workflow");
      writeFileSync(target, modified);
      const result = guard(fixture);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /character-merge-validation.yml/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}

test("lint and all typechecks fail fast before product regressions, after installation", () => {
  const source = workflow.split("\n  static:\n")[1].split("\n  serial:\n")[0];
  const commands = [
    "pnpm install --frozen-lockfile",
    "pnpm run lint:strict",
    "pnpm run typecheck\n",
    "pnpm run typecheck:cloudflare-realtime",
    "pnpm exec vitest run",
  ];
  let previous = -1;
  for (const command of commands) {
    const index = source.indexOf(command);
    assert.ok(index > previous, `${command} must execute in fail-fast order`);
    previous = index;
  }
});

test("required core still runs on every main PR, main push and merge group without path skipping", () => {
  const events = workflow.split("\non:\n")[1].split("\npermissions:\n")[0];
  assert.match(events, / {2}pull_request:\n {4}branches: \[main\]/);
  assert.match(events, / {2}push:\n {4}branches: \[main\]/);
  assert.match(events, / {2}merge_group:/);
  assert.doesNotMatch(events, /paths(?:-ignore)?:|types:/);
  assert.doesNotMatch(workflow, /continue-on-error|CI_CORE_BYPASS/);
  assert.match(workflow, /needs: \[static, serial, build\]/);
});

test("preflight executes the fanout guard and its regression tests before costly jobs", () => {
  const preflight = workflow.split("\n  preflight:\n")[1].split("\n  static:\n")[0];
  assert.match(preflight, /node --test .*scripts\/ci-merge-reliability.test.mjs/);
  assert.match(preflight, /run: python3 scripts\/verify-pr-workflow-fanout.py/);
});

test("the market delivery lane replaces stale runs without skipping its regressions", () => {
  const market = readFileSync(join(root, ".github/workflows/market-cc0-delivery.yml"), "utf8");
  assert.match(market, /group: \$\{\{ github.workflow \}\}-\$\{\{ github.event.pull_request.number \|\| github.ref \}\}/);
  assert.match(market, /cancel-in-progress: true/);
  assert.match(market, /run: node --import tsx scripts\/generate-market-cc0-catalog.mts --check/);
  assert.match(market, /pnpm exec vitest run/);
});
