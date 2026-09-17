import assert from "node:assert/strict";

import {
  buildEslintArgs,
  findFullLintTrigger,
  parseChangedFileList,
  selectLintableFiles,
} from "./lint-changed-policy.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("changed-file input accepts newline and NUL-delimited GitHub lists", () => {
  assert.deepEqual(
    parseChangedFileList("./apps/web/src/a.ts\r\napps/api/src/b.ts\n\n"),
    ["apps/web/src/a.ts", "apps/api/src/b.ts"],
  );
  assert.deepEqual(
    parseChangedFileList("apps/web/src/a.ts\0apps/api/src/b.ts\0"),
    ["apps/web/src/a.ts", "apps/api/src/b.ts"],
  );
});

test("lint policy escalates repository-wide configuration changes", () => {
  const triggers = [
    "eslint.config.mjs",
    "package.json",
    "apps/api/package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "apps/web/tsconfig.browser.json",
    "patches/example.patch",
    "scripts/lint-changed.mjs",
    "scripts/lint-changed-policy.mjs",
  ];

  for (const path of triggers) {
    assert.equal(findFullLintTrigger(["apps/web/src/feature.ts", path]), path, path);
  }
  assert.equal(findFullLintTrigger([
    "apps/web/src/feature.tsx",
    "apps/api/src/feature.test.ts",
  ]), null);
});

test("lintable selection is sorted, unique and ignores deleted or non-code files", () => {
  const existing = new Set([
    "apps/web/src/a.ts",
    "apps/web/src/b.tsx",
  ]);
  assert.deepEqual(
    selectLintableFiles([
      "docs/guide.md",
      "apps/web/src/b.tsx",
      "apps/web/src/a.ts",
      "apps/web/src/a.ts",
      "apps/web/src/deleted.ts",
    ], (file) => existing.has(file)),
    ["apps/web/src/a.ts", "apps/web/src/b.tsx"],
  );
});

test("ESLint arguments keep strict cache and optional fix semantics", () => {
  assert.deepEqual(
    buildEslintArgs(
      ["apps/web/src/a.ts", "apps/web/src/b.tsx"],
      { fix: true, cacheLocation: ".cache/test-eslint/" },
    ),
    [
      "exec",
      "eslint",
      "--max-warnings=0",
      "--no-warn-ignored",
      "--cache",
      "--cache-strategy",
      "content",
      "--cache-location",
      ".cache/test-eslint/",
      "--fix",
      "--",
      "apps/web/src/a.ts",
      "apps/web/src/b.tsx",
    ],
  );
});
