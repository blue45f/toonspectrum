import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertArtifactProbeSucceeded } from "./verify-api-serverless-build.mjs";

test("successful artifact probes pass", () => {
  assert.doesNotThrow(() => assertArtifactProbeSucceeded({ status: 0 }, "http", "bootstrap.log"));
});

test("failed probes retain the actual missing-module cause in CI output", () => {
  assert.throws(() => assertArtifactProbeSucceeded({ status: 1,
    stdout: "booting", stderr: "Cannot find module 'lunar-typescript'",
  }, "http", "bootstrap.log"), /Cannot find module 'lunar-typescript'/u);
});

test("terminated probes remain failures and retain the timeout cause", () => {
  assert.throws(() => assertArtifactProbeSucceeded({ status: null,
    signal: "SIGTERM", error: new Error("ETIMEDOUT"),
  }, "native", "bootstrap.log"), /ETIMEDOUT/u);
});

test("calendar libraries remain resolvable from the API's relocated compiled core", () => {
  const core = JSON.parse(readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"));
  const api = JSON.parse(readFileSync(new URL("../apps/api/package.json", import.meta.url), "utf8"));
  for (const name of ["lunar-typescript", "korean-lunar-calendar"]) {
    assert.equal(api.dependencies[name], core.dependencies[name], `${name} must be an explicit API runtime dependency`);
  }
});
