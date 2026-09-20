import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isProtectedActionsRun, selectSupersededActionsRuns } from "./cleanup-superseded-actions-runs.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const directory = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const workflows = Object.fromEntries(readdirSync(directory)
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => [name, readFileSync(`${directory}/${name}`, "utf8")]));
const nightly = ["main-full-qa-fast-diagnostics.yml", "main-full-qa-studio.yml"];

function validatePolicy(files) {
  assert.equal(files["full-test-suite.yml"], undefined, "do not restore the duplicate full suite");
  const full = files["full-test-diagnostic.yml"];
  assert.match(full, /^ {2}pull_request:\n {4}branches: \[main\]/mu);
  assert.match(full, /^ {2}workflow_dispatch:/mu);
  assert.match(full, /cancel-in-progress: true/u);
  assert.equal(full.match(/run: node scripts\/run-full-test-ci\.mjs/gu)?.length, 1);
  for (const [name, text] of Object.entries(files)) {
    if (name === "full-test-diagnostic.yml") continue;
    const automatic = /^ {2}(?:pull_request|push):/mu.test(text);
    assert.ok(!automatic || !/(?:run-full-test-ci\.mjs|run: pnpm (?:run )?test\s*$)/mu.test(text),
      `${name}: duplicate automatic root/performance suite`);
  }
  for (const name of nightly) {
    const text = files[name];
    assert.match(text, /^ {2}schedule:\n {4}- cron: /mu, `${name}: keep nightly coverage`);
    assert.match(text, /^ {2}workflow_dispatch:/mu, `${name}: keep on-demand coverage`);
    assert.doesNotMatch(text, /^ {2}(?:push|pull_request|workflow_run):/mu, `${name}: no merge fanout`);
    assert.match(text, /cancel-in-progress: false/u, `${name}: preserve evidence`);
    assert.doesNotMatch(text, /continue-on-error/u, `${name}: real failures stay failures`);
    const matrices = text.match(/ {6}fail-fast: false\n/gu) ?? [];
    assert.ok(matrices.length > 0);
    assert.equal(text.match(/ {6}fail-fast: false\n {6}max-parallel: 2\n/gu)?.length,
      matrices.length, `${name}: bound every diagnostic matrix`);
  }
}

test("CI throughput policy preserves one full PR suite and bounded nightly diagnostics", () => {
  validatePolicy(workflows);
  assert.match(workflows["ci.yml"], /scripts\/ci-throughput-policy\.test\.mjs/u);
});

test("throughput policy rejects another automatic full-suite copy under any filename", () => {
  for (const name of ["full-test-suite.yml", "accidental-full-copy.yml"]) {
    assert.throws(() => validatePolicy({ ...workflows, [name]: workflows["full-test-diagnostic.yml"] }),
      /duplicate/u);
  }
});

test("throughput policy rejects removing full PR coverage or nightly/manual diagnostics", () => {
  assert.throws(() => validatePolicy({ ...workflows,
    "full-test-diagnostic.yml": workflows["full-test-diagnostic.yml"].replace("  pull_request:", "  unused:") }));
  for (const name of nightly) {
    for (const change of [
      (text) => text.replace("  schedule:", "  push:"),
      (text) => text.replace("  workflow_dispatch:", "  unused:"),
      (text) => text.replace("max-parallel: 2", "max-parallel: 20"),
      (text) => text.replace("cancel-in-progress: false", "cancel-in-progress: true"),
    ]) assert.throws(() => validatePolicy({ ...workflows, [name]: change(workflows[name]) }));
  }
});

const mainRun = (id, status = "in_progress") => ({
  id, workflow_id: 1, event: "push", name: "CI", path: ".github/workflows/ci.yml",
  head_branch: "main", head_sha: `sha-${id}`, status,
  created_at: `2026-09-20T00:0${id}:00Z`, pull_requests: [],
});

test("external cleanup cannot cancel running, superseded or old queued main core", () => {
  for (const status of ["in_progress", "queued", "pending"]) {
    assert.deepEqual(selectSupersededActionsRuns([mainRun(1, status), mainRun(2, status)],
      { now: Date.parse("2026-09-21T00:00:00Z") }), []);
  }
});

test("cleanup still removes superseded PR checks and ordinary diagnostics", () => {
  const pr = (id) => ({ ...mainRun(id), event: "pull_request", head_branch: "feature/a",
    pull_requests: [{ number: 99 }] });
  const result = selectSupersededActionsRuns([pr(1), pr(2)],
    { pullRequestStates: new Map([[99, "open"]]) });
  assert.deepEqual(result.map(({ run }) => run.id), [1]);
  assert.equal(isProtectedActionsRun({ ...mainRun(1), name: "Other", path: ".github/workflows/other.yml" }), false);
});

test("closed-PR cleanup is not misclassified as stale and security/manual runs remain protected", () => {
  const closedCleanup = { ...mainRun(1), event: "pull_request", head_branch: "feature/closed",
    path: ".github/workflows/cleanup-merged-pr-branches.yml", name: "Cleanup merged PR branches",
    pull_requests: [{ number: 99 }] };
  assert.deepEqual(selectSupersededActionsRuns([closedCleanup],
    { pullRequestStates: new Map([[99, "closed"]]) }), []);
  assert.equal(isProtectedActionsRun({ event: "dynamic", path: "dynamic/github-code-scanning/codeql" }), true);
  assert.deepEqual(selectSupersededActionsRuns([mainRun(1),
    { ...mainRun(2), event: "workflow_dispatch" }, { ...mainRun(3), event: "merge_group" }]), []);
});


test("related-source validation retains documentation evidence without restoring heavy assets", () => {
  const text = workflows["toonstudio-session-goals.yml"];
  assert.ok(!text.includes("!/docs/"), "related content tests need their tracked evidence");
  assert.ok(text.includes("!/apps/web/public/assets/"));
  assert.ok(text.includes("!/artifacts/"));
  assert.ok(text.includes("pnpm exec vitest related"), "retain the real related tests");
});
