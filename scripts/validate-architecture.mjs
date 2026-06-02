import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts || {};

const issues = [];

// Required docs. WEBDEX keeps product/design/agent guides at the repo root and
// deeper references (ranking math, competitor analysis) under docs/.
const requiredPaths = [
  "README.md",
  "PRODUCT.md",
  "DESIGN.md",
  "AGENTS.md",
  "docs/ranking-architecture.md",
  "docs/competitor-analysis.md",
  "pnpm-workspace.yaml",
  "tsconfig.json",
];
for (const file of requiredPaths) {
  if (!exists(file)) issues.push(`missing file: ${file}`);
}

// Root Vite app entry points (index.html -> src/main.tsx).
const requiredEntries = ["index.html", "src/main.tsx", "vite.config.ts"];
for (const entry of requiredEntries) {
  if (!exists(entry)) issues.push(`missing app entry: ${entry}`);
}

// Root scripts wired into the build/lint/test chain.
const requiredScripts = ["dev", "build", "build:all", "lint", "test", "validate:architecture"];
for (const script of requiredScripts) {
  if (!scripts[script]) issues.push(`missing script: ${script}`);
}

// pnpm workspace members declared in pnpm-workspace.yaml must exist on disk.
if (exists("pnpm-workspace.yaml")) {
  const ws = read("pnpm-workspace.yaml");
  const globs = [...ws.matchAll(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm)].map((m) => m[1].trim());
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
