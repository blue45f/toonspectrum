// Keep the standalone pre-install check and the root Vitest suite on the same tests.
const { afterEach, test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyWorkspacePackageLinks } from "./verify-workspace-package-links.mjs";
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "studio-workspace-links-")); roots.push(root);
  mkdirSync(join(root, "packages/model"), { recursive: true });
  mkdirSync(join(root, "node_modules/@studio"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "web", dependencies: { "@studio/model": "workspace:*", react: "19" } }));
  writeFileSync(join(root, "packages/model/package.json"), JSON.stringify({ name: "@studio/model" }));
  return root;
}
test("accepts only this checkout's package", () => {
  const root = fixture(); symlinkSync(join(root, "packages/model"), join(root, "node_modules/@studio/model"), "dir");
  const result = verifyWorkspacePackageLinks(root); assert.equal(result.checked, 1); assert.deepEqual(result.failures, []);
});
test("rejects a valid package in another worktree", () => {
  const root = fixture(), other = fixture(); symlinkSync(join(other, "packages/model"), join(root, "node_modules/@studio/model"), "dir");
  assert.equal(verifyWorkspacePackageLinks(root).failures[0].reason, "wrong-worktree");
});
test("reports missing and dangling links without treating them as installed", () => {
  const root = fixture(); assert.equal(verifyWorkspacePackageLinks(root).failures[0].reason, "missing-link");
  symlinkSync(join(root, "not-installed"), join(root, "node_modules/@studio/model"), "dir");
  assert.equal(verifyWorkspacePackageLinks(root).failures[0].reason, "broken-link");
});
test("checks the nearest consumer link rather than a valid root fallback", () => {
  const root = fixture(), other = fixture();
  mkdirSync(join(root, "apps/api/node_modules/@studio"), { recursive: true });
  writeFileSync(join(root, "apps/api/package.json"), JSON.stringify({ name: "api", dependencies: { "@studio/model": "workspace:*" } }));
  symlinkSync(join(root, "packages/model"), join(root, "node_modules/@studio/model"), "dir");
  symlinkSync(join(other, "packages/model"), join(root, "apps/api/node_modules/@studio/model"), "dir");
  const result = verifyWorkspacePackageLinks(root); assert.equal(result.checked, 2); assert.equal(result.failures[0].consumer, "api");
});
