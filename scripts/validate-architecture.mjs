import fs from "node:fs";
import path from "node:path";

import {
  validateNoDuplicateVercelTrigger,
  validateVercelFallbackWorkflow,
} from "./vercel-workflow-policy.mjs";

const ROOT = process.cwd();
const resolve = (relativePath) => path.join(ROOT, relativePath);
const exists = (relativePath) => fs.existsSync(resolve(relativePath));
const read = (relativePath) => fs.readFileSync(resolve(relativePath), "utf8");
const list = (relativePath) =>
  exists(relativePath)
    ? fs.readdirSync(resolve(relativePath), { withFileTypes: true })
    : [];

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};
const issues = [];

function requirePaths(paths, label) {
  for (const relativePath of paths) {
    if (!exists(relativePath)) issues.push(`missing ${label}: ${relativePath}`);
  }
}

function forbidPaths(paths, message) {
  for (const relativePath of paths) {
    if (exists(relativePath)) issues.push(`${message}: ${relativePath}`);
  }
}

function validateWorkflowReference({ file, required, forbidden }) {
  if (!exists(file)) {
    issues.push(`missing workflow: ${file}`);
    return;
  }
  const source = read(file);
  if (!source.includes(required)) {
    issues.push(`${file}: missing canonical web path ${required.trim()}`);
  }
  if (source.includes(forbidden)) {
    issues.push(`${file}: stale root path ${forbidden.trim()}`);
  }
}

// Maintained architecture and product documentation.
requirePaths(
  [
    "README.md",
    "ARCHITECTURE.md",
    "PRODUCT.md",
    "DESIGN.md",
    "docs/ranking-architecture.md",
    "docs/competitor-analysis.md",
    "docs/architecture/frontend-layered-architecture.md",
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
    "apps/web/src/app/routes/app-route-definition.ts",
    "apps/web/src/app/routes/groups/app-routes.tsx",
    "apps/web/src/domains/creator/studio-router/routes/StudioEditorRoute.tsx",
    "apps/web/src/domains/creator/studio-router/routes/StudioPublishRoute.tsx",
    "apps/web/src/domains/creator/studio-cuttoon-editor/runtime/useStudioDocumentAccessRuntime.ts",
    ".husky/pre-commit",
    ".husky/commit-msg",
  ],
  "file",
);

// Canonical Vite application and browser-only test assets.
requirePaths(
  [
    "apps/web/index.html",
    "apps/web/public",
    "apps/web/src/app/main.tsx",
    "apps/web/config/vite-manual-chunks.ts",
    "apps/web/tests/browser-fixtures/studio-catalog/index.html",
    "apps/web/tools/browser-harnesses/hybrid-dcc-e2e.html",
    "vite.config.ts",
  ],
  "app entry",
);

const SRC_ROOT_ENTRY_PATTERN = /(?:^|-)main\.tsx?$/;
for (const entry of list("apps/web/src")) {
  if (!entry.isFile() || !SRC_ROOT_ENTRY_PATTERN.test(entry.name)) continue;
  issues.push(
    `entry-shaped module at the src root: apps/web/src/${entry.name}`
      + " (the app entry is apps/web/src/app/main.tsx; browser harnesses belong in "
      + "apps/web/tools/browser-harnesses/)",
  );
}
for (const entry of list(".")) {
  if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
  issues.push(
    `stray HTML entry at the repo root: ${entry.name}`
      + " (only apps/web/index.html is the application entry; harness pages belong in "
      + "apps/web/tools/browser-harnesses/)",
  );
}
forbidPaths(
  ["tools/browser-harnesses", "tests/browser-fixtures/studio-catalog"],
  "legacy or duplicate browser fixture path",
);

// Lint exception ledger and its ratchet tests must remain machine-readable.
const LEGACY_EXCEPTIONS_LEDGER = "eslint.legacy-exceptions.json";
if (!exists(LEGACY_EXCEPTIONS_LEDGER)) {
  issues.push(`missing lint exception ledger: ${LEGACY_EXCEPTIONS_LEDGER}`);
} else {
  try {
    const ledger = JSON.parse(read(LEGACY_EXCEPTIONS_LEDGER));
    for (const key of ["compilerOptOutFiles", "closureBagFiles"]) {
      if (!Array.isArray(ledger[key])) {
        issues.push(`${LEGACY_EXCEPTIONS_LEDGER}: "${key}" must be an array of globs`);
      }
    }
  } catch (error) {
    issues.push(`${LEGACY_EXCEPTIONS_LEDGER}: not parseable JSON (${error.message})`);
  }
}
requirePaths(
  [
    "apps/web/src/domains/creator/studio-host-architecture-ratchet.test.ts",
    "scripts/eslint-legacy-exceptions.test.mjs",
  ],
  "architecture guard test",
);

// Product browser code belongs under apps/web. Generated evidence and one-shot migration
// machinery belong in Actions artifacts or commit history, not the maintained source tree.
forbidPaths(
  ["components", "hooks", "lib", "public", "shared", "src", "styles"],
  "legacy frontend directory at repository root",
);
forbidPaths(
  [
    "apps/studio-web-v11",
    "apps/asset-market-v11",
    "apps/benchmark-lab-v11",
    "studio-v11",
  ],
  "forbidden parallel studio path exists",
);
forbidPaths(
  [
    ".github/qa",
    "qa-results",
    "scripts/qa/runs",
    "docs/merge-preservation",
    "docs/learn/merge-blocker-followup.md",
    "scripts/marketplace",
    "scripts/apply-blender-source-aware-quality.py",
    "scripts/fix-blender-orion-capability-audit.py",
    "scripts/zz-fable-probe.mts",
    "marketplace-benchmark/.route-marker",
    "marketplace-benchmark/.upload-probe.txt",
    "marketplace-benchmark/.upload-route-readme.md",
  ],
  "ephemeral receipt or completed migration path belongs outside maintained source",
);

const forbiddenOneOffWorkflows = [
  "fix-kmas-history-sync.yml",
  "apply-blender-production-migrations.yml",
  "architecture-merge-gate-v3-pr690.yml",
  "finalize-fixed-all-branch-integration.yml",
  "merge-all-branches-fixed-integration.yml",
  "merge-all-branches-preserve.yml",
  "merge-all-branches-preserve-v2.yml",
  "merge-all-branches-safe-convergence.yml",
  "merge-generated-branches-history-only.yml",
  "marketplace-authoring-browser-diagnosis.yml",
  "marketplace-authoring-browser.yml",
  "marketplace-authoring-contract-fixer.yml",
  "marketplace-authoring-detail-integrator.yml",
  "marketplace-authoring-finalizer.yml",
  "marketplace-authoring-idempotency.yml",
  "marketplace-authoring-integrator.yml",
  "marketplace-authoring-release-gate.yml",
  "marketplace-brush-recipe-integrator.yml",
  "marketplace-source-snapshot.yml",
  "studio-brush-core-fix.yml",
  "studio-wearable-apply.yml",
  "studio-wearable-runtime-review.yml",
];
forbidPaths(
  forbiddenOneOffWorkflows.map((file) => `.github/workflows/${file}`),
  "completed one-off workflow must not return",
);

for (const base of ["packages", "crates", "apps"]) {
  for (const entry of list(base)) {
    if (/-v\d+$/.test(entry.name)) {
      issues.push(`version-suffixed source directory violates V11.1: ${base}/${entry.name}`);
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
  "verify:csp",
  "verify:toolchain-coverage",
  "verify:studio-menus",
  "verify:studio-icons",
];
for (const script of requiredScripts) {
  if (!scripts[script]) issues.push(`missing script: ${script}`);
}

const expectedCspCommand = "node scripts/verify-vercel-csp.mjs apps/web/index.html";
if (scripts["verify:csp"] !== expectedCspCommand) {
  issues.push(`verify:csp must target the canonical entry: ${expectedCspCommand}`);
}

for (const reference of [
  {
    file: ".github/workflows/studio-asset-browser.yml",
    required: "      - apps/web/tests/browser-fixtures/studio-catalog/**",
    forbidden: "\n      - tests/browser-fixtures/studio-catalog/**",
  },
  {
    file: ".github/workflows/studio-promo-video.yml",
    required: "apps/web/tools/browser-harnesses/promo-e2e.html",
    forbidden: "\n      - 'tools/browser-harnesses/promo-e2e.html'",
  },
]) {
  validateWorkflowReference(reference);
}

// Every declared workspace base must exist. Other YAML lists are deliberately ignored.
if (exists("pnpm-workspace.yaml")) {
  const workspace = read("pnpm-workspace.yaml");
  const packageBlock = workspace.match(
    /^packages:\s*\n((?:[ \t]*-[ \t]*.*\n?)+)/m,
  )?.[1] ?? ""; // NOSONAR S5852 — trusted local build-time configuration
  const globs = [...packageBlock.matchAll(
    /^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/gm,
  )].map((match) => match[1].trim());
  for (const glob of globs) {
    if (glob === ".") continue;
    const base = glob.replace(/\/\*+$/, "");
    if (!exists(base)) issues.push(`workspace dir missing: ${base} (from "${glob}")`);
  }
}

const apiPackagePath = "apps/api/package.json";
if (!exists(apiPackagePath)) {
  issues.push(`missing workspace package: ${apiPackagePath}`);
} else {
  const apiPackage = JSON.parse(read(apiPackagePath));
  if (!apiPackage.name) issues.push('apps/api has no "name"');
  if (!apiPackage.scripts?.build) issues.push('apps/api has no "build" script');
}

const vercelDeployWorkflowPath = ".github/workflows/deploy-vercel.yml";
if (exists(vercelDeployWorkflowPath)) {
  for (const issue of validateVercelFallbackWorkflow(read(vercelDeployWorkflowPath))) {
    issues.push(`${vercelDeployWorkflowPath}: ${issue}`);
  }
}

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
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log("architecture validation passed: docs, workspace members, and scripts are consistent");
