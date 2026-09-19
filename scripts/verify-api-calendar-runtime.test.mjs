import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const api = JSON.parse(readFileSync(new URL("../apps/api/package.json", import.meta.url), "utf8"));
const core = JSON.parse(readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"));
// tsc relocates core code into the API output. Node resolves bare imports from that output,
// not from packages/core/node_modules; the deployment package must own these dependencies.
const compiledRequire = createRequire(new URL("../apps/api/dist/packages/core/src/fortune/index.js", import.meta.url));
for (const name of ["korean-lunar-calendar", "lunar-typescript"]) {
  test(`the packaged API declares the core calendar dependency ${name}`, () => {
    assert.equal(api.dependencies[name], core.dependencies[name]);
    assert.equal(typeof api.dependencies[name], "string");
    assert.ok(compiledRequire.resolve(name));
  });
}
test("both calendar engines load from the emitted CommonJS API boundary", () => {
  const KoreanLunarCalendar = compiledRequire("korean-lunar-calendar");
  const calendar = new KoreanLunarCalendar();
  assert.equal(calendar.setSolarDate(2026, 9, 13), true);
  assert.equal(calendar.getSolarCalendar().year, 2026);
  const { Solar } = compiledRequire("lunar-typescript");
  assert.equal(Solar.fromYmd(2026, 9, 13).toYmd(), "2026-09-13");
});
