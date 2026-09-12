import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertCoreResults, REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const success = () => Object.fromEntries(REQUIRED_CORE_GATES.map((name) => [name, { result: "success" }]));

test("accepts actual success from every declared gate", () => {
  assert.doesNotThrow(() => assertCoreResults(success()));
});

for (const name of REQUIRED_CORE_GATES) {
  for (const status of ["failure", "cancelled", "skipped", "pending", "neutral", undefined]) {
    test(`rejects ${name} with result ${String(status)}`, () => {
      assert.throws(() => assertCoreResults({ ...success(), [name]: { result: status } }), /actual success/);
    });
  }
  test(`rejects a missing ${name} gate`, () => {
    const results = success();
    delete results[name];
    assert.throws(() => assertCoreResults(results), /actual success/);
  });
}

test("rejects empty, malformed, inherited and unknown dependencies", () => {
  for (const results of [null, undefined, [], {}, "success", false, Object.create(success())]) {
    assert.throws(() => assertCoreResults(results));
  }
  assert.throws(() => assertCoreResults({ ...success(), ignored: { result: "failure" } }), /unrecognized/);
});

test("CLI exits nonzero for malformed JSON and every failed gate", () => {
  const script = fileURLToPath(new URL("./ci-core-gate.mjs", import.meta.url));
  for (const raw of ["not-json", "", "null", "{}", JSON.stringify({ ...success(), serial: { result: "skipped" } })]) {
    const result = spawnSync(process.execPath, [script], { env: { ...process.env, CORE_RESULTS: raw }, encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
  }
  const result = spawnSync(process.execPath, [script], { env: { ...process.env, CORE_RESULTS: JSON.stringify(success()) }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all required checks succeeded/);
});
