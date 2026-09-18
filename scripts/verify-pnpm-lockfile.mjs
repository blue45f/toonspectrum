#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseImporterKeys(lockfileText) {
  const lines = lockfileText.split(/\r?\n/u);
  const importersIndex = lines.findIndex((line) => line === "importers:");
  if (importersIndex < 0) {
    throw new Error("pnpm-lock.yaml에 importers: 섹션이 없습니다.");
  }

  const keys = [];
  for (let index = importersIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) break;
    const match = line.match(/^ {2}(\S[^:]*):(?:\s+\{\})?\s*$/u);
    if (!match) continue;
    keys.push(unquoteYamlScalar(match[1]));
  }
  return keys;
}

export function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

export function parseWorkspacePatterns(workspaceText) {
  const lines = workspaceText.split(/\r?\n/u);
  const packagesIndex = lines.findIndex((line) => line.trim() === "packages:");
  if (packagesIndex < 0) {
    throw new Error("pnpm-workspace.yaml에 packages: 섹션이 없습니다.");
  }

  const patterns = [];
  for (let index = packagesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s+/u.test(line)) break;
    const match = line.match(/^\s*-\s+(.+?)\s*$/u);
    if (!match) continue;
    patterns.push(unquoteYamlScalar(match[1]));
  }
  return patterns;
}

export function discoverWorkspaceImporters(root, patterns) {
  const importers = new Set();
  for (const pattern of patterns) {
    if (pattern === ".") {
      if (existsSync(join(root, "package.json"))) importers.add(".");
      continue;
    }
    if (pattern.endsWith("/*")) {
      const parent = resolve(root, pattern.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const packageDir = join(parent, entry.name);
        if (!existsSync(join(packageDir, "package.json"))) continue;
        importers.add(relative(root, packageDir).replaceAll("\\", "/"));
      }
      continue;
    }
    const packageDir = resolve(root, pattern);
    if (existsSync(join(packageDir, "package.json"))) {
      importers.add(relative(root, packageDir).replaceAll("\\", "/") || ".");
    }
  }
  return [...importers].sort();
}

export function verifyLockfileImporters({ lockfileText, workspaceText, root }) {
  const importerKeys = parseImporterKeys(lockfileText);
  const duplicates = duplicateValues(importerKeys);
  const expected = discoverWorkspaceImporters(root, parseWorkspacePatterns(workspaceText));
  const actual = [...new Set(importerKeys)].sort();
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((value) => !actualSet.has(value));
  const stale = actual.filter((value) => !expectedSet.has(value));

  return { importerKeys, duplicates, expected, actual, missing, stale };
}

function main() {
  const lockfilePath = join(ROOT, "pnpm-lock.yaml");
  const workspacePath = join(ROOT, "pnpm-workspace.yaml");
  const result = verifyLockfileImporters({
    root: ROOT,
    lockfileText: readFileSync(lockfilePath, "utf8"),
    workspaceText: readFileSync(workspacePath, "utf8"),
  });

  const problems = [];
  if (result.duplicates.length) {
    problems.push(`중복 importer: ${result.duplicates.join(", ")}`);
  }
  if (result.missing.length) {
    problems.push(`lockfile에 없는 workspace importer: ${result.missing.join(", ")}`);
  }
  if (result.stale.length) {
    problems.push(`workspace에 없는 stale importer: ${result.stale.join(", ")}`);
  }

  if (problems.length) {
    console.error("pnpm lockfile/workspace 무결성 검증 실패:");
    for (const problem of problems) console.error(`- ${problem}`);
    console.error("pnpm install --lockfile-only로 lockfile을 재생성한 뒤 다시 검증하세요.");
    process.exitCode = 1;
    return;
  }

  console.log(`pnpm lockfile importer integrity OK (${result.actual.length} importers)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
