import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};

const issues = [];

// Required docs. ToonSpectrum keeps product/design guides at the repo root and
// deeper references (ranking math, competitor analysis) under docs/.
// (AGENTS.md/CLAUDE.md are intentionally git-ignored globally — agent guides
//  are not committed — so they are NOT validated here.)
const requiredPaths = [
  "README.md",
  "PRODUCT.md",
  "DESIGN.md",
  "docs/ranking-architecture.md",
  "docs/competitor-analysis.md",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "commitlint.config.cjs",
  ".husky/pre-commit",
  ".husky/commit-msg",
];
for (const file of requiredPaths) {
  if (!exists(file)) issues.push(`missing file: ${file}`);
}

// Root Vite app entry points (index.html -> src/app/main.tsx).
const requiredEntries = ["index.html", "src/app/main.tsx", "vite.config.ts"];
for (const entry of requiredEntries) {
  if (!exists(entry)) issues.push(`missing app entry: ${entry}`);
}

// Root scripts wired into the build/lint/test chain.
const requiredScripts = [
  "dev",
  "build",
  "build:all",
  "lint",
  "typecheck",
  "test",
  "validate:architecture",
];
for (const script of requiredScripts) {
  if (!scripts[script]) issues.push(`missing script: ${script}`);
}

// pnpm workspace members declared in pnpm-workspace.yaml must exist on disk.
if (exists("pnpm-workspace.yaml")) {
  const ws = read("pnpm-workspace.yaml");
  // `packages:` 블록의 리스트 항목만 워크스페이스 글롭으로 본다. (다른 최상위 키,
  // 예: onlyBuiltDependencies/minimumReleaseAgeExclude 의 `- 항목`은 패키지가 아님.)
  const pkgBlock = ws.match(/^packages:\s*\n((?:[ \t]*-[ \t]*.*\n?)+)/m)?.[1] ?? "";
  const globs = [...pkgBlock.matchAll(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((m) => m[1].trim());
  for (const glob of globs) {
    if (glob === ".") continue; // root package
    const base = glob.replace(/\/\*+$/, "");
    if (!exists(base)) issues.push(`workspace dir missing: ${base} (from "${glob}")`);
  }
}

// The NestJS API workspace package must have a name + build script
// (build:all runs `pnpm -r run build` across the workspace).
const apiPkgPath = "apps/api/package.json";
if (!exists(apiPkgPath)) {
  issues.push(`missing workspace package: ${apiPkgPath}`);
} else {
  const apiPkg = JSON.parse(read(apiPkgPath));
  if (!apiPkg.name) issues.push(`apps/api has no "name"`);
  if (!apiPkg.scripts || !apiPkg.scripts.build) issues.push(`apps/api has no "build" script`);
}

if (issues.length > 0) {
  console.error(`architecture validation failed: ${issues.length} issue(s)`);
  for (const item of issues) console.error(` - ${item}`);
  process.exit(1);
}

console.log("architecture validation passed: docs, workspace members, and scripts are consistent");
