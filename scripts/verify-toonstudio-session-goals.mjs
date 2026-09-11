#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const failures = [];

function fail(message) {
  failures.push(message);
}

function requireFile(path) {
  if (!existsSync(resolve(root, path))) fail(`missing required file: ${path}`);
}

function requireText(path, expressions) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    fail(`missing required file: ${path}`);
    return;
  }
  const text = readFileSync(absolute, "utf8");
  for (const expression of expressions) {
    if (!expression.test(text)) fail(`${path} does not satisfy ${expression}`);
  }
}

function walk(directory) {
  const result = [];
  if (!existsSync(directory)) return result;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}

const domainFiles = [
  "apps/web/src/domains/creator/studio-route-registry.ts",
  "apps/web/src/domains/creator/studio-project-views.ts",
  "apps/web/src/domains/creator/studio-project-view-destinations.ts",
  "apps/web/src/domains/creator/studio-project-workspace-store.ts",
  "apps/web/src/domains/creator/studio-project-diagnostics.ts",
  "apps/web/src/domains/creator/studio-project-readiness.ts",
  "apps/web/src/domains/creator/studio-project-readiness-store.ts",
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
];
for (const path of domainFiles) requireFile(path);

const uiFiles = [
  "apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioSeriesKitPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioLocalizationPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioReviewPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectReadinessPanel.tsx",
  "apps/web/src/domains/creator/studio-shell/useStudioProjectFeatureSuite.ts",
  "apps/web/src/domains/creator/studio-shell/useStudioProjectWorkspace.ts",
];
for (const path of uiFiles) requireFile(path);

requireText("apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx", [
  /StudioProjectFeatureSuitePanel/u,
  /StudioLocalizationPanel/u,
  /StudioSeriesKitPanel/u,
  /StudioReviewPanel/u,
  /StudioExportPanel/u,
  /StudioProjectAssistantPanel/u,
]);

requireText("apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx", [
  /planStudioStoryboard/u,
  /analyzeStudioProductionPipeline/u,
  /analyzeStudioWebtoonQuality/u,
  /planStudioWebtoon3dRender/u,
  /planStudioVoiceRegeneration/u,
  /planStudioTemplateApplication/u,
  /auditStudioPresentation/u,
  /aggregateStudioAnalytics/u,
  /planStudioAutomationRecipe/u,
]);

requireText("apps/web/src/domains/creator/studio-project-view-destinations.ts", [
  /owner:\s*"project-shell"/u,
  /section === "story"/u,
  /section === "production"/u,
  /section === "assets"/u,
  /section === "review"/u,
  /section === "export"/u,
]);

requireText("apps/web/src/app/routes/groups/creator.routes.tsx", [
  /StudioProjectIntegratedPage/u,
  /\/studio\/p\/:projectId/u,
]);

const testFiles = [
  "apps/web/src/domains/creator/studio-project-feature-suite-store.test.ts",
  "apps/web/src/domains/creator/studio-project-view-destinations.test.ts",
  "apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.test.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioReviewPanel.test.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.test.tsx",
  "apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.test.tsx",
];
for (const path of testFiles) requireFile(path);

const userFacingFiles = walk(resolve(root, "apps/web/src/domains/creator/studio-shell"))
  .filter((path) => [".ts", ".tsx"].includes(extname(path)))
  .filter((path) => !/\.test\.(ts|tsx)$/u.test(path));
const forbiddenCopy = [
  /server lock/giu,
  /서버 잠금/gu,
  /leader tab/giu,
  /follower tab/giu,
  /복구 저장 담당 탭/gu,
  /SQLite\/OPFS 저장됨/gu,
];
for (const absolute of userFacingFiles) {
  const text = readFileSync(absolute, "utf8");
  for (const expression of forbiddenCopy) {
    expression.lastIndex = 0;
    if (expression.test(text)) {
      fail(`${relative(root, absolute)} exposes internal terminology: ${expression}`);
    }
  }
}

const coreFiles = [...domainFiles, ...uiFiles, ...testFiles]
  .map((path) => resolve(root, path))
  .filter(existsSync);
for (const absolute of coreFiles) {
  const text = readFileSync(absolute, "utf8");
  if (/\b(?:TODO|FIXME|NOT_IMPLEMENTED)\b/u.test(text)) {
    fail(`${relative(root, absolute)} contains an unfinished marker`);
  }
  if (/coming soon|준비 중입니다/iu.test(text)) {
    fail(`${relative(root, absolute)} contains placeholder copy`);
  }
}

if (failures.length > 0) {
  console.error("ToonStudio session goal verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`ToonStudio session goal verification passed (${domainFiles.length} domain contracts, ${uiFiles.length} UI surfaces, ${testFiles.length} regression files).`);
