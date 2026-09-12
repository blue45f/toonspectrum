#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import ts from "typescript";

const root = resolve(process.cwd());
const failures = [];

function fail(message) {
  failures.push(message);
}

function requireFile(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    fail(`missing required file: ${path}`);
  } else if (!readFileSync(absolute, "utf8").trim()) {
    fail(`empty required file: ${path}`);
  }
}

function requireText(path, expressions) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    fail(`missing required file: ${path}`);
    return;
  }
  const text = readFileSync(absolute, "utf8");
  for (const expression of expressions) {
    const matches = typeof expression === "string"
      ? text.includes(expression)
      : expression.test(text);
    if (!matches) fail(`${path} does not satisfy ${expression}`);
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

// Inspect actual string/JSX content, not comments or the regular expressions
// which enforce this policy. Unicode escapes are decoded by the TS parser.
function copyLiterals(text, path) {
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const values = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)
      || node.kind === ts.SyntaxKind.TemplateHead
      || node.kind === ts.SyntaxKind.TemplateMiddle
      || node.kind === ts.SyntaxKind.TemplateTail) {
      values.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return values.join("\n");
}

const placeholderCopy = /coming soon|준비 중입니다/iu;
for (const [code, expected] of [
  ['const guard = /coming soon|준비 중입니다/iu;', false],
  ['// coming soon\nconst label = "Ready";', false],
  ['const label = "coming soon";', true],
  ['const label = "coming\\u0020soon";', true],
  ['const label = `Feature ${name}: coming soon`;', true],
  ['const panel = <p>준비 중입니다</p>;', true],
]) {
  if (placeholderCopy.test(copyLiterals(code, "fixture.tsx")) !== expected) {
    fail(`copy scanner regression: ${code}`);
  }
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

// The public alias is lazy-loaded. Check the complete registry -> route ->
// integrated runtime chain rather than demanding obsolete inline URL strings.
requireText("apps/web/src/app/routes/groups/creator-route-pages.ts", [
  /export const StudioProjectShellPage = lazyRetry\(\s*\(\) => import\("@\/domains\/creator\/studio-shell\/StudioProjectIntegratedPage"\)\.then\(\(module\) => \(\{\s*default: module\.StudioProjectIntegratedPage,/u,
]);
requireText("apps/web/src/app/routes/groups/creator.routes.tsx", [
  'import { studioRoutePath } from "@/domains/creator/studio-route-registry";',
  'path: studioRoutePath("project-root"), element: <Navigate to="overview" replace />',
]);
requireText("apps/web/src/domains/creator/studio-route-registry.ts", [
  'route("project-root", "/studio/p/:projectId", "project", "project"',
]);
for (const section of ["overview", "story", "production", "assets", "review", "export", "settings"]) {
  requireText("apps/web/src/app/routes/groups/creator.routes.tsx", [
    `path: studioRoutePath("project-${section}"), element: <StudioProjectShellPage section="${section}" />`,
  ]);
  requireText("apps/web/src/domains/creator/studio-route-registry.ts", [
    `route("project-${section}", "/studio/p/:projectId/${section}", "project", "project"`,
  ]);
}

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
  const text = copyLiterals(readFileSync(absolute, "utf8"), absolute);
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
  if (placeholderCopy.test(copyLiterals(text, absolute))) {
    fail(`${relative(root, absolute)} contains placeholder copy`);
  }
}

if (failures.length > 0) {
  console.error("ToonStudio session goal verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`ToonStudio session goal verification passed (${domainFiles.length} domain contracts, ${uiFiles.length} UI surfaces, ${testFiles.length} regression files).`);
