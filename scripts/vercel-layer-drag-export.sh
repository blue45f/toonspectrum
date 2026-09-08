#!/usr/bin/env bash
set -euo pipefail

PATCH_FILES=(
  apps/web/src/domains/creator/studio-layers.ts
  apps/web/src/domains/creator/studio-layers.test.ts
  apps/web/src/domains/creator/layer/studio-layer-drag.ts
  apps/web/src/domains/creator/layer/studio-layer-drag.test.ts
  apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigatorBatchBar.tsx
  apps/web/src/domains/creator/layer/studio-layer-operations.ts
  apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx
  docs/studio-layer-drag-workbench-benchmark-2026-09-09.md
)

LINT_FILES=(
  apps/web/src/domains/creator/studio-layers.ts
  apps/web/src/domains/creator/studio-layers.test.ts
  apps/web/src/domains/creator/layer/studio-layer-drag.ts
  apps/web/src/domains/creator/layer/studio-layer-drag.test.ts
  apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigatorTree.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigatorBatchBar.tsx
  apps/web/src/domains/creator/layer/studio-layer-operations.ts
  apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx
)

TEST_FILES=(
  apps/web/src/domains/creator/studio-layers.test.ts
  apps/web/src/domains/creator/layer/studio-layer-drag.test.ts
  apps/web/src/domains/creator/layer/StudioLayerNavigator.test.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigator.interaction.test.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigatorItemRow.test.tsx
  apps/web/src/domains/creator/layer/StudioLayerNavigator.drag.test.tsx
)

python3 scripts/apply-studio-layer-drag-workbench.py
pnpm exec prettier --write "${PATCH_FILES[@]}"
pnpm exec eslint "${LINT_FILES[@]}"
pnpm exec vitest run "${TEST_FILES[@]}"
pnpm exec tsc -p tsconfig.json --noEmit
pnpm --filter @webtoon-nest/api build
pnpm run build
git diff --check

mkdir -p dist/__layer_patch
tar -czf dist/__layer_patch/source.tar.gz "${PATCH_FILES[@]}"
git diff --binary --no-color > dist/__layer_patch/changes.patch
cat > dist/__layer_patch/verified.json <<'JSON'
{"verified":true,"branch":"feat/studio-layer-drag-workbench","checks":["prettier","eslint","focused-vitest","typescript","api-build","production-build","diff-check"]}
JSON
