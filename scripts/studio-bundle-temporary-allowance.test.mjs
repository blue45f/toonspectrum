import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STUDIO_GZIP_ALLOWANCE as policy, resolveTemporaryBundleCeiling } from "./lib/studio-bundle-temporary-allowance.mjs";

// Run both before dependency installation in the mandatory typecheck lane and in Vitest.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const activeAt = Date.parse("2026-09-14T00:00:00+09:00");
const expiresAt = Date.parse(policy.expiresAt);
const measurement = { group: "static", key: "Studio route gzip", kind: "bytes" };
const resolve = (input = measurement, now = activeAt, baseline = policy.baselineValue, ceiling = policy.normalCeiling) =>
  resolveTemporaryBundleCeiling(input, baseline, ceiling, now);

test("adds exactly one KiB to only the accepted Studio route gzip ceiling", () => {
  assert.equal(policy.normalCeiling, Math.floor(policy.baselineValue * 1.02));
  assert.equal(policy.extraBytes, 1024);
  assert.equal(resolve().ceiling, 1_967_361);
  assert.equal(resolve().temporaryAllowance, policy);
  assert.ok(Object.isFrozen(policy));
});

for (const [label, input] of [
  ["raw bytes", { ...measurement, key: "Studio route raw" }],
  ["app shell", { ...measurement, key: "app entry gzip" }],
  ["BG3D", { ...measurement, key: "BG3D editor activation gzip" }],
  ["chunk counts", { ...measurement, kind: "count" }],
  ["runtime measurements", { ...measurement, group: "runtime" }],
]) {
  test(`does not relax ${label}`, () => {
    assert.deepEqual(resolve(input), { ceiling: policy.normalCeiling, temporaryAllowance: null });
  });
}

for (const [label, now] of [
  ["at expiry", expiresAt], ["after expiry", expiresAt + 1],
  ["an invalid clock", Number.NaN], ["an infinite clock", Number.POSITIVE_INFINITY],
]) {
  test(`restores the ordinary ceiling ${label}`, () => {
    assert.deepEqual(resolve(measurement, now), { ceiling: policy.normalCeiling, temporaryAllowance: null });
  });
}

test("allows the final millisecond before expiry", () => {
  assert.equal(resolve(measurement, expiresAt - 1).ceiling, policy.normalCeiling + 1024);
});

test("does not transfer the exception to rewritten or missing baseline values", () => {
  for (const baseline of [policy.baselineValue - 1, policy.baselineValue + 1, undefined]) {
    assert.equal(resolveTemporaryBundleCeiling(measurement, baseline, policy.normalCeiling, activeAt).temporaryAllowance, null);
  }
  assert.equal(resolve(measurement, activeAt, policy.baselineValue, policy.normalCeiling + 1).temporaryAllowance, null);
});

test("admits the reported overrun only before expiry and still bounds further growth", () => {
  const reportedOverrun = Math.round(1920.6 * 1024);
  assert.ok(reportedOverrun > policy.normalCeiling);
  assert.ok(reportedOverrun <= resolve().ceiling);
  assert.ok(reportedOverrun > resolve(measurement, expiresAt).ceiling);
  assert.ok(1_967_362 > resolve().ceiling);
});

test("is run before dependency installation in the mandatory typecheck lane", () => {
  const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const typecheck = source.slice(source.indexOf("  typecheck:"), source.indexOf("  static:"));
  const policyTest = typecheck.indexOf("scripts/studio-bundle-temporary-allowance.test.mjs");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  assert.ok(policyTest >= 0);
  assert.ok(install > policyTest);
  const baseline = JSON.parse(readFileSync(new URL("./bundle-baseline.json", import.meta.url), "utf8"));
  assert.equal(baseline.policy.byteTolerance, 0.02);
  assert.equal(baseline.policy.countTolerance, 0.02);
  assert.equal(baseline.policy.countSlack, 2);
});
