#!/usr/bin/env bash
set -euo pipefail

track="${1:-}"
mkdir -p ".cache/ci/toonstudio/${track}/eslint"
temporary_configs=()

cleanup() {
  if ((${#temporary_configs[@]})); then
    rm -f "${temporary_configs[@]}"
  fi
}
trap cleanup EXIT

typecheck_group() {
  local label="$1"
  shift
  local config=".toonstudio-tsconfig-${track}-${label}.json"
  temporary_configs+=("$config")

  node - "$config" "$@" <<'NODE'
const fs = require("node:fs");
const [config, ...files] = process.argv.slice(2);
const cacheName = config.replace(/^\.toonstudio-tsconfig-/, "").replace(/\.json$/, "");
fs.mkdirSync(".cache/ci/toonstudio", { recursive: true });
if (!config || files.length === 0) {
  throw new Error("A config path and at least one source file are required.");
}
fs.writeFileSync(config, `${JSON.stringify({
  extends: "./tsconfig.json",
  compilerOptions: {
    allowJs: false,
    checkJs: false,
    incremental: true,
    noEmit: true,
    skipLibCheck: true,
    tsBuildInfoFile: `.cache/ci/toonstudio/${cacheName}.tsbuildinfo`,
  },
  include: [],
  exclude: [],
  files: ["apps/web/src/vite-env.d.ts", ...files],
}, null, 2)}\n`);
NODE

  echo "::group::Typecheck ${track}/${label}"
  NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc -p "$config" --pretty false
  echo "::endgroup::"
  rm -f "$config"
}

run_core() {
  typecheck_group foundation \
    apps/web/src/domains/creator/studio-analytics.ts \
    apps/web/src/domains/creator/studio-archive-manifest.ts \
    apps/web/src/domains/creator/studio-automation-recipe.ts \
    apps/web/src/domains/creator/studio-presentation-layout.ts \
    apps/web/src/domains/creator/studio-production-pipeline.ts

  typecheck_group assets \
    apps/web/src/domains/creator/studio-asset-passport.ts \
    apps/web/src/domains/creator/studio-asset-provider.ts \
    apps/web/src/domains/creator/studio-font-audit.ts \
    apps/web/src/domains/creator/studio-marketplace-submission.ts \
    apps/web/src/domains/creator/studio-plugin-registry.ts \
    apps/web/src/domains/creator/studio-rights-graph.ts

  typecheck_group localization \
    apps/web/src/domains/creator/studio-export-preflight.ts \
    apps/web/src/domains/creator/studio-localization-project-store.ts \
    apps/web/src/domains/creator/studio-localization-workflow.ts \
    apps/web/src/domains/creator/studio-publishing-connector.ts \
    apps/web/src/domains/creator/studio-publishing-package.ts

  typecheck_group diagnostics \
    apps/web/src/domains/creator/studio-project-diagnostic-source-store.ts \
    apps/web/src/domains/creator/studio-project-diagnostics.ts \
    apps/web/src/domains/creator/studio-project-export-snapshot.ts \
    apps/web/src/domains/creator/studio-project-feature-adapters.ts

  typecheck_group project \
    apps/web/src/domains/creator/studio-project-readiness-store.ts \
    apps/web/src/domains/creator/studio-project-readiness.ts \
    apps/web/src/domains/creator/studio-project-view-destinations.ts \
    apps/web/src/domains/creator/studio-project-views.ts \
    apps/web/src/domains/creator/studio-project-workspace-store.ts

  typecheck_group story \
    apps/web/src/domains/creator/studio-review-history-store.ts \
    apps/web/src/domains/creator/studio-review-workflow.ts \
    apps/web/src/domains/creator/studio-series-kit-store.ts \
    apps/web/src/domains/creator/studio-series-kit.ts \
    apps/web/src/domains/creator/studio-story-bible.ts \
    apps/web/src/domains/creator/studio-storyboard-planner.ts \
    apps/web/src/domains/creator/studio-template-system.ts

  typecheck_group media \
    apps/web/src/domains/creator/studio-voice-motion.ts \
    apps/web/src/domains/creator/studio-webtoon-3d-render.ts \
    apps/web/src/domains/creator/studio-webtoon-quality.ts

  typecheck_group suite \
    apps/web/src/domains/creator/studio-project-feature-suite-store.ts

  typecheck_group ai \
    apps/web/src/domains/creator/ai/studio-ai-project-handoff.ts

  pnpm exec eslint --max-warnings=0 \
    --cache --cache-strategy content \
    --cache-location ".cache/ci/toonstudio/${track}/eslint/.eslintcache" \
    apps/web/src/domains/creator/ai/studio-ai-project-handoff.ts \
    apps/web/src/domains/creator/studio-analytics.ts \
    apps/web/src/domains/creator/studio-archive-manifest.ts \
    apps/web/src/domains/creator/studio-asset-passport.ts \
    apps/web/src/domains/creator/studio-asset-provider.ts \
    apps/web/src/domains/creator/studio-automation-recipe.ts \
    apps/web/src/domains/creator/studio-export-preflight.ts \
    apps/web/src/domains/creator/studio-font-audit.ts \
    apps/web/src/domains/creator/studio-localization-project-store.ts \
    apps/web/src/domains/creator/studio-localization-workflow.ts \
    apps/web/src/domains/creator/studio-marketplace-submission.ts \
    apps/web/src/domains/creator/studio-plugin-registry.ts \
    apps/web/src/domains/creator/studio-presentation-layout.ts \
    apps/web/src/domains/creator/studio-production-pipeline.ts \
    apps/web/src/domains/creator/studio-project-diagnostic-source-store.ts \
    apps/web/src/domains/creator/studio-project-diagnostics.ts \
    apps/web/src/domains/creator/studio-project-export-snapshot.ts \
    apps/web/src/domains/creator/studio-project-feature-adapters.ts \
    apps/web/src/domains/creator/studio-project-feature-suite-store.ts \
    apps/web/src/domains/creator/studio-project-readiness-store.ts \
    apps/web/src/domains/creator/studio-project-readiness.ts \
    apps/web/src/domains/creator/studio-project-view-destinations.ts \
    apps/web/src/domains/creator/studio-project-views.ts \
    apps/web/src/domains/creator/studio-project-workspace-store.ts \
    apps/web/src/domains/creator/studio-publishing-connector.ts \
    apps/web/src/domains/creator/studio-publishing-package.ts \
    apps/web/src/domains/creator/studio-review-history-store.ts \
    apps/web/src/domains/creator/studio-review-workflow.ts \
    apps/web/src/domains/creator/studio-rights-graph.ts \
    apps/web/src/domains/creator/studio-series-kit-store.ts \
    apps/web/src/domains/creator/studio-series-kit.ts \
    apps/web/src/domains/creator/studio-story-bible.ts \
    apps/web/src/domains/creator/studio-storyboard-planner.ts \
    apps/web/src/domains/creator/studio-template-system.ts \
    apps/web/src/domains/creator/studio-voice-motion.ts \
    apps/web/src/domains/creator/studio-webtoon-3d-render.ts \
    apps/web/src/domains/creator/studio-webtoon-quality.ts

  pnpm exec vitest run \
    apps/web/src/domains/creator/studio-ai-job.test.ts \
    apps/web/src/domains/creator/studio-ai-provider.test.ts \
    apps/web/src/domains/creator/studio-archive-manifest.test.ts \
    apps/web/src/domains/creator/studio-asset-passport.test.ts \
    apps/web/src/domains/creator/studio-asset-provider.test.ts \
    apps/web/src/domains/creator/studio-automation-recipe.test.ts \
    apps/web/src/domains/creator/studio-export-preflight.test.ts \
    apps/web/src/domains/creator/studio-font-audit.test.ts \
    apps/web/src/domains/creator/studio-localization-project-store.test.ts \
    apps/web/src/domains/creator/studio-localization-workflow.test.ts \
    apps/web/src/domains/creator/studio-marketplace-submission.test.ts \
    apps/web/src/domains/creator/studio-plugin-registry.test.ts \
    apps/web/src/domains/creator/studio-project-diagnostics.test.ts \
    apps/web/src/domains/creator/studio-project-export-snapshot.test.ts \
    apps/web/src/domains/creator/studio-project-feature-suite-store.test.ts \
    apps/web/src/domains/creator/studio-project-readiness-store.test.ts \
    apps/web/src/domains/creator/studio-project-readiness.test.ts \
    apps/web/src/domains/creator/studio-project-view-destinations.test.ts \
    apps/web/src/domains/creator/studio-project-workspace-store.test.ts \
    apps/web/src/domains/creator/studio-publishing-connector.test.ts \
    apps/web/src/domains/creator/studio-publishing-package.test.ts \
    apps/web/src/domains/creator/studio-review-workflow.test.ts \
    apps/web/src/domains/creator/studio-rights-graph.test.ts \
    apps/web/src/domains/creator/studio-series-kit.test.ts \
    apps/web/src/domains/creator/studio-series-kit-store.test.ts \
    apps/web/src/domains/creator/studio-template-system.test.ts \
    --pool=forks --maxWorkers=2
}

run_ui() {
  typecheck_group assistant \
    apps/web/src/domains/creator/ai/StudioAiProjectHandoffHost.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.tsx

  typecheck_group assets \
    apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioSeriesKitPanel.tsx

  typecheck_group export \
    apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioLocalizationPanel.tsx

  typecheck_group diagnostics \
    apps/web/src/domains/creator/studio-shell/StudioProjectDiagnosticsBridge.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectReadinessPanel.tsx

  typecheck_group features \
    apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx \
    apps/web/src/domains/creator/studio-shell/useStudioProjectFeatureSuite.ts

  typecheck_group shell \
    apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx \
    apps/web/src/domains/creator/studio-shell/useStudioProjectWorkspace.ts

  typecheck_group review \
    apps/web/src/domains/creator/studio-shell/StudioReviewPanel.tsx

  pnpm exec eslint --max-warnings=0 \
    --cache --cache-strategy content \
    --cache-location ".cache/ci/toonstudio/${track}/eslint/.eslintcache" \
    apps/web/src/domains/creator/ai/StudioAiProjectHandoffHost.tsx \
    apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioLocalizationPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectDiagnosticsBridge.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectIntegratedPage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectReadinessPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioReviewPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioSeriesKitPanel.tsx \
    apps/web/src/domains/creator/studio-shell/useStudioProjectFeatureSuite.ts \
    apps/web/src/domains/creator/studio-shell/useStudioProjectWorkspace.ts

  pnpm exec vitest run \
    apps/web/src/app/routes/groups/app-routes.test.tsx \
    apps/web/src/domains/creator/ai/studio-ai-project-handoff.test.ts \
    apps/web/src/domains/creator/ai/StudioAiProjectHandoffHost.test.tsx \
    apps/web/src/domains/creator/studio-integration-closure.test.ts \
    apps/web/src/domains/creator/studio-shell/StudioAssetHubPage.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectAssistantPanel.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectDiagnosticsBridge.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectFeatureSuitePanel.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectReadinessPanel.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectShellPage.integration.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioReviewPanel.test.tsx \
    --pool=forks --maxWorkers=2
}

run_editor() {
  pnpm exec eslint --max-warnings=0 \
    --cache --cache-strategy content \
    --cache-location ".cache/ci/toonstudio/${track}/eslint/.eslintcache" \
    apps/web/src/app/routes/groups/creator-route-pages.ts \
    apps/web/src/app/routes/groups/creator.routes.tsx \
    apps/web/src/domains/creator/brush-lab/StudioBrushIntegratedWorkbench.tsx \
    apps/web/src/domains/creator/brush-lab/StudioBrushLabPage.tsx \
    apps/web/src/domains/creator/brush-lab/StudioBrushLegacyCataloguePanel.tsx \
    apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.ts \
    apps/web/src/domains/creator/canvas/studio-transient-canvas.ts \
    apps/web/src/domains/creator/canvas/studio-transient-canvas.test.ts \
    apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorHosts.tsx \
    apps/web/src/domains/creator/studio-cuttoon-editor/StudioImportHandoffHost.tsx \
    apps/web/src/domains/creator/studio-product-ia.ts

  pnpm exec vitest run \
    apps/web/src/app/routes/groups/creator-brush-lab-route-contract.test.ts \
    apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.test.ts \
    apps/web/src/domains/creator/canvas/studio-transient-canvas.test.ts \
    apps/web/src/domains/creator/studio-import-handoff.test.ts \
    apps/web/src/domains/creator/studio-cuttoon-editor/StudioImportHandoffHost.test.tsx \
    --pool=forks --maxWorkers=2
}

# Keep project lifecycle coverage in the permanent integration owner after the
# one-shot integration workflow is removed. Reuse its cleanup and cache policy.
run_lifecycle_core() {
  typecheck_group lifecycle \
    apps/web/src/domains/creator/studio-project-creation.ts \
    apps/web/src/domains/creator/studio-project-document-store.ts \
    apps/web/src/domains/creator/studio-project-library-store.ts

  pnpm exec eslint --max-warnings=0 \
    --cache --cache-strategy content \
    --cache-location ".cache/ci/toonstudio/${track}/eslint/.eslintcache" \
    apps/web/src/domains/creator/studio-project-creation.ts \
    apps/web/src/domains/creator/studio-project-document-store.ts \
    apps/web/src/domains/creator/studio-project-library-store.ts

  pnpm exec vitest run \
    apps/web/src/domains/creator/studio-project-creation.test.ts \
    apps/web/src/domains/creator/studio-project-document-store.test.ts \
    apps/web/src/domains/creator/studio-project-library-store.test.ts \
    --pool=forks --maxWorkers=2
}

run_lifecycle_ui() {
  typecheck_group lifecycle \
    apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioAssetGovernancePanel.tsx

  pnpm exec eslint --max-warnings=0 \
    --cache --cache-strategy content \
    --cache-location ".cache/ci/toonstudio/${track}/eslint/.eslintcache" \
    apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.tsx \
    apps/web/src/domains/creator/studio-shell/StudioAssetGovernancePanel.tsx

  pnpm exec vitest run \
    apps/web/src/domains/creator/studio-shell/StudioProjectCreatePage.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectDocumentsPanel.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.test.tsx \
    apps/web/src/domains/creator/studio-shell/StudioAssetGovernancePanel.test.tsx \
    --pool=forks --maxWorkers=2
}

case "$track" in
  core) run_core; run_lifecycle_core ;;
  ui) run_ui; run_lifecycle_ui ;;
  editor) run_editor ;;
  *) echo "usage: $0 {core|ui|editor}" >&2; exit 2 ;;
esac
