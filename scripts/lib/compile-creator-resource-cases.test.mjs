import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compileCreatorResourceCases } from "./compile-creator-resource-cases.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("격리된 리소스 컴파일 산출물이 실제 공유 계약을 CommonJS로 해석한다", () => {
  const output = mkdtempSync(join(tmpdir(), "toonstudio-resource-runtime-check-"));
  try {
    compileCreatorResourceCases(output);
    const load = createRequire(join(output, "entry.cjs"));
    const workflow = load("@toonstudio/contracts/creator-resource-workflow");
    const reference = load("@toonstudio/contracts/reference-assets");
    assert.equal(typeof workflow.mergeCreatorWorkspaces, "function");
    assert.equal(typeof workflow.providerAvailability, "function");
    assert.equal(typeof reference.parseReferenceUrlParams, "function");
    assert.equal(typeof load("@toonstudio/core/reference-query-language").resolveReferenceQuery, "function");
    const manifest = JSON.parse(readFileSync(join(output, "node_modules/@toonstudio/contracts/package.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.exports).sort(), ["./creator-resource-workflow", "./reference-assets"]);
    assert.throws(() => load("@toonstudio/contracts/private-helper"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
