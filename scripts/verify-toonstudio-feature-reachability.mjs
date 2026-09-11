#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const webRoot = resolve(root, "apps/web/src");
const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function walk(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else if (extensions.includes(extname(path))) files.push(normalize(path));
  }
  return files;
}

const sourceFiles = new Set(walk(webRoot));

function resolveModule(fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) {
    base = resolve(webRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => join(base, `index${extension}`)),
  ].map(normalize);
  return candidates.find((candidate) => sourceFiles.has(candidate)) ?? null;
}

function importsFor(file) {
  const source = readFileSync(file, "utf8");
  const imports = new Set();
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu,
    /import\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const resolved = resolveModule(file, match[1]);
      if (resolved) imports.add(resolved);
    }
  }
  return imports;
}

const graph = new Map();
for (const file of sourceFiles) graph.set(file, importsFor(file));

const roots = [
  "apps/web/src/app/routes/groups/creator.routes.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.tsx",
  "apps/web/src/domains/creator/StudioCuttoonEditor.tsx",
].map((path) => resolve(root, path)).filter(existsSync);

const visited = new Set();
const queue = [...roots];
while (queue.length > 0) {
  const file = queue.shift();
  if (!file || visited.has(file)) continue;
  visited.add(file);
  for (const dependency of graph.get(file) ?? []) {
    if (!visited.has(dependency)) queue.push(dependency);
  }
}

const required = [
  "apps/web/src/domains/creator/studio-route-registry.ts",
  "apps/web/src/domains/creator/studio-project-views.ts",
  "apps/web/src/domains/creator/studio-project-view-destinations.ts",
  "apps/web/src/domains/creator/studio-project-workspace-store.ts",
  "apps/web/src/domains/creator/studio-project-diagnostics.ts",
  "apps/web/src/domains/creator/studio-project-readiness.ts",
  "apps/web/src/domains/creator/studio-story-bible.ts",
  "apps/web/src/domains/creator/studio-storyboard-planner.ts",
  "apps/web/src/domains/creator/studio-production-pipeline.ts",
  "apps/web/src/domains/creator/studio-webtoon-quality.ts",
  "apps/web/src/domains/creator/studio-webtoon-3d-render.ts",
  "apps/web/src/domains/creator/studio-voice-motion.ts",
  "apps/web/src/domains/creator/studio-template-system.ts",
  "apps/web/src/domains/creator/studio-presentation-layout.ts",
  "apps/web/src/domains/creator/studio-analytics.ts",
  "apps/web/src/domains/creator/studio-automation-recipe.ts",
  "apps/web/src/domains/creator/studio-series-kit.ts",
  "apps/web/src/domains/creator/studio-localization-workflow.ts",
  "apps/web/src/domains/creator/studio-review-workflow.ts",
  "apps/web/src/domains/creator/studio-export-preflight.ts",
  "apps/web/src/domains/creator/studio-asset-passport.ts",
  "apps/web/src/domains/creator/studio-asset-provider.ts",
  "apps/web/src/domains/creator/studio-rights-graph.ts",
  "apps/web/src/domains/creator/studio-font-audit.ts",
  "apps/web/src/domains/creator/studio-marketplace-submission.ts",
  "apps/web/src/domains/creator/studio-plugin-registry.ts",
  "apps/web/src/domains/creator/studio-archive-manifest.ts",
  "apps/web/src/domains/creator/studio-publishing-connector.ts",
  "apps/web/src/domains/creator/studio-publishing-package.ts",
  "apps/web/src/domains/creator/studio-project-feature-suite-store.ts",
  "apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioSeriesKitPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioLocalizationPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioReviewPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectReadinessPanel.tsx",
].map((path) => normalize(resolve(root, path)));

const missing = required.filter((file) => !existsSync(file));
const unreachable = required.filter((file) => existsSync(file) && !visited.has(file));

if (missing.length || unreachable.length) {
  console.error("ToonStudio feature reachability verification failed.");
  for (const file of missing) console.error(`- missing: ${relative(root, file)}`);
  for (const file of unreachable) console.error(`- unreachable from product roots: ${relative(root, file)}`);
  process.exit(1);
}

console.log(`ToonStudio feature reachability passed (${required.length} required modules, ${visited.size} reachable source modules).`);
