import assert from "node:assert/strict";
import { inspectTestSource } from "./audit-test-portfolio.mjs";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("portfolio distinguishes static declarations from parameterized runtime cases", () => {
  const result = inspectTestSource("sample.test.ts", `import { it } from "vitest";
    it.each([1, 2, 3])("value %s", value => { expect(value).toBeGreaterThan(0); });`);
  assert.equal(result.caseDeclarations, 1);
  assert.equal(result.parseErrors, 0);
});
test("portfolio reports source-only assertions as candidates but retains behavioral imports", () => {
  const code = `import { readFileSync } from "node:fs"; import { it } from "vitest";
    it("contract", () => { expect(readFileSync("x", "utf8")).toContain("guard"); });`;
  assert.equal(inspectTestSource("contract.test.ts", code).sourceContractCandidate, true);
  assert.equal(inspectTestSource("mixed.test.ts", `import { validate } from "./runtime"; ${code}`).sourceContractCandidate, false);
});
test("portfolio records explicit skip and only without treating ordinary object methods as tests", () => {
  const result = inspectTestSource("sample.test.ts", `it.skip("old", () => {});
    describe.only("suite", () => { test("case", () => {}); }); other.skip(() => {});
    test.beforeEach(() => {}); test.describe("nested", () => {});`);
  assert.equal(result.skippedDeclarations, 1);
  assert.equal(result.exclusiveDeclarations, 1);
  assert.equal(result.caseDeclarations, 2);
});
test("body fingerprints preserve assertion values and ignore comments or titles", () => {
  const get = (title, value, comment = "") => inspectTestSource("sample.test.ts",
    `it("${title}", () => { ${comment}\n expect(result).toBe(${value}); });`).cases[0].bodyHash;
  assert.equal(get("first", 1), get("second", 1, "// explanation"));
  assert.notEqual(get("first", 1), get("first", 2));
});

test("portfolio detects forwarding-only test entries rather than reporting empty coverage", () => {
  for (const target of ["./contract.test", "./contract.spec.ts"]) {
    const result = inspectTestSource("legacy.test.ts", `export * from "${target}";`);
    assert.equal(result.forwardedTestModule, target);
    assert.equal(result.caseDeclarations, 0);
  }
});
test("forwarding classification preserves behavioral additions and ordinary export barrels", () => {
  for (const code of [
    'export * from "./contract";',
    'export type * from "./contract.test";',
    'export { helper } from "./contract.test";',
    'export * from "./contract.test"; test("extra", () => {});',
  ]) assert.equal(inspectTestSource("mixed.test.ts", code).forwardedTestModule, null);
});
