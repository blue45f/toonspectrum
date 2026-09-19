import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  duplicateValues,
  parseImporterKeys,
  parseWorkspacePatterns,
  verifyLockfileImporters,
} from "./verify-pnpm-lockfile.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("duplicateValues reports every duplicate only once", () => {
  assert.deepEqual(
    duplicateValues([".", "apps/web", "apps/web", "packages/core", "packages/core"]),
    ["apps/web", "packages/core"],
  );
});

test("parseImporterKeys only reads direct importers", () => {
  const lockfile = [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  .:",
    "    dependencies:",
    "      react:",
    "        version: 19.2.7",
    "",
    "  apps/web:",
    "    dependencies: {}",
    "",
    "packages:",
    "",
    "  react@19.2.7: {}",
    "",
  ].join("\n");
  assert.deepEqual(parseImporterKeys(lockfile), [".", "apps/web"]);
});

test("parseWorkspacePatterns supports quoted workspace globs", () => {
  const workspace = [
    "packages:",
    '  - "."',
    '  - "apps/*"',
    '  - "packages/*"',
    "",
    "minimumReleaseAge: 0",
  ].join("\n");
  assert.deepEqual(parseWorkspacePatterns(workspace), [".", "apps/*", "packages/*"]);
});

test("verifyLockfileImporters catches duplicate, missing and stale entries", () => {
  const root = mkdtempSync(join(tmpdir(), "toonspectrum-lock-"));
  mkdirSync(join(root, "apps", "web"), { recursive: true });
  mkdirSync(join(root, "packages", "core"), { recursive: true });
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(join(root, "apps", "web", "package.json"), "{}");
  writeFileSync(join(root, "packages", "core", "package.json"), "{}");

  const result = verifyLockfileImporters({
    root,
    workspaceText: ['packages:', '  - "."', '  - "apps/*"', '  - "packages/*"'].join("\n"),
    lockfileText: [
      "importers:",
      "  .:",
      "  apps/web:",
      "  apps/web:",
      "  packages/stale:",
      "",
      "packages:",
    ].join("\n"),
  });

  assert.deepEqual(result.duplicates, ["apps/web"]);
  assert.deepEqual(result.missing, ["packages/core"]);
  assert.deepEqual(result.stale, ["packages/stale"]);
});
