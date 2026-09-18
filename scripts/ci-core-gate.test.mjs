import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertCoreResults, REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const success = () => Object.fromEntries(
  REQUIRED_CORE_GATES.map((name) => [name, { result: "success" }]),
);

test("accepts actual success from every declared gate", () => {
  assert.doesNotThrow(() => assertCoreResults(success()));
});

test("rejects every non-success or missing gate without registering hundreds of cases", () => {
  const statuses = ["failure", "cancelled", "skipped", "pending", "neutral", undefined];
  for (const name of REQUIRED_CORE_GATES) {
    for (const status of statuses) {
      assert.throws(
        () => assertCoreResults({ ...success(), [name]: { result: status } }),
        /actual success/,
        `${name}:${String(status)}`,
      );
    }

    const results = success();
    delete results[name];
    assert.throws(() => assertCoreResults(results), /actual success/, `missing:${name}`);
  }
});

test("rejects empty, malformed, inherited and unknown dependencies", () => {
  for (const results of [null, undefined, [], {}, "success", false, Object.create(success())]) {
    assert.throws(() => assertCoreResults(results));
  }
  assert.throws(
    () => assertCoreResults({ ...success(), ignored: { result: "failure" } }),
    /unrecognized/,
  );
});

test("CLI exits nonzero for malformed JSON and failed gates, then succeeds once", () => {
  const script = fileURLToPath(new URL("./ci-core-gate.mjs", import.meta.url));
  const invalidInputs = [
    "not-json",
    "",
    "null",
    "{}",
    JSON.stringify({ ...success(), serial: { result: "skipped" } }),
  ];

  for (const raw of invalidInputs) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, CORE_RESULTS: raw },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
  }

  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, CORE_RESULTS: JSON.stringify(success()) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all required checks succeeded/);
});
