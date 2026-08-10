import fs from "node:fs";
import path from "node:path";

import {
  validateNoDuplicateVercelTrigger,
  validateVercelFallbackWorkflow,
} from "./vercel-workflow-policy.mjs";

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
  ".github/workflows/catalog-update.yml",
  ".github/workflows/deploy-vercel.yml",
  ".github/workflows/related-info-update.yml",
  "deploy/oci/.env.example",
  "deploy/oci/crawl-update.sh",
  "scripts/vercel-workflow-policy.mjs",
  "scripts/vercel-workflow-policy.test.mjs",
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
// V11.1 §12.1/§Phase 8 — 인플레이스 교체 가드: 병렬 Studio 앱·버전 접미사 소스 경로 금지.
const forbiddenParallelPaths = [
  "apps/studio-web-v11",
  "apps/asset-market-v11",
  "apps/benchmark-lab-v11",
  "studio-v11",
];
for (const forbidden of forbiddenParallelPaths) {
  if (exists(forbidden)) issues.push(`forbidden parallel studio path exists: ${forbidden}`);
}
for (const base of ["packages", "crates", "apps"]) {
  if (!exists(base)) continue;
  for (const entry of fs.readdirSync(path.join(ROOT, base))) {
    if (/-v\d+$/.test(entry)) {
      issues.push(`version-suffixed source directory violates V11.1: ${base}/${entry}`);
    }
  }
}

const requiredScripts = [
  "dev",
  "build",
  "build:all",
  "lint",
  "typecheck",
  "test",
  "check:studio-bundle",
  "validate:architecture",
  "verify:studio-menus",
  "verify:studio-icons",
];
for (const script of requiredScripts) {
  if (!scripts[script]) issues.push(`missing script: ${script}`);
}

// pnpm workspace members declared in pnpm-workspace.yaml must exist on disk.
if (exists("pnpm-workspace.yaml")) {
  const ws = read("pnpm-workspace.yaml");
  // `packages:` 블록의 리스트 항목만 워크스페이스 글롭으로 본다. (다른 최상위 키,
  // 예: onlyBuiltDependencies/minimumReleaseAgeExclude 의 `- 항목`은 패키지가 아님.)
  const pkgBlock = ws.match(/^packages:\s*\n((?:[ \t]*-[ \t]*.*\n?)+)/m)?.[1] ?? ""; // NOSONAR S5852 신뢰된 로컬 입력(pnpm-workspace.yaml), 빌드타임 검증 스크립트
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

// Vercel Git Integration is the primary production path. Keep the Actions CLI
// path manual-only, project-bound, and exactly pinned so configuring its three
// secrets later cannot deploy a wrong project or silently adopt a new release.
const vercelDeployWorkflowPath = ".github/workflows/deploy-vercel.yml";
if (exists(vercelDeployWorkflowPath)) {
  for (const issue of validateVercelFallbackWorkflow(read(vercelDeployWorkflowPath))) {
    issues.push(`${vercelDeployWorkflowPath}: ${issue}`);
  }
}

// Scheduled content commits are ordinary main pushes. Explicit CLI/hook
// dispatches duplicate Vercel Git Integration builds and consume runner quota.
for (const workflowPath of [
  ".github/workflows/catalog-update.yml",
  ".github/workflows/related-info-update.yml",
]) {
  if (!exists(workflowPath)) continue;
  for (const issue of validateNoDuplicateVercelTrigger(read(workflowPath), { workflow: true })) {
    issues.push(`${workflowPath}: ${issue}`);
  }
}
for (const automationPath of ["deploy/oci/crawl-update.sh", "deploy/oci/.env.example"]) {
  if (!exists(automationPath)) continue;
  for (const issue of validateNoDuplicateVercelTrigger(read(automationPath))) {
    issues.push(`${automationPath}: ${issue}`);
  }
}

if (issues.length > 0) {
  console.error(`architecture validation failed: ${issues.length} issue(s)`);
  for (const item of issues) console.error(` - ${item}`);
  process.exit(1);
}

console.log("architecture validation passed: docs, workspace members, and scripts are consistent");
