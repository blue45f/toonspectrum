import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

/**
 * Boundary tests used to source-scan StudioPage.tsx for editor-owned
 * handlers. Pointer/view extracts live beside the page, so tests should
 * read the composed editor surface instead of a single file.
 */
export function readStudioCuttoonEditorSource(): string {
  return [
    // Extracted pure helpers come first so source slices that start at an
    // extracted symbol still reach their StudioPage.tsx end boundary.
    // The save pipeline is intentionally FIRST: save-contract tests slice it
    // directly, and leading the concat keeps its tokens out of every
    // cross-file slice that starts in a later extracted file.
    resolve(baseDir, "../studio-page-save-pipeline.ts"),
    resolve(baseDir, "../canvas/studio-hokusai-gpu-plan-matchers.ts"),
    resolve(baseDir, "../export/studio-interchange-import.ts"),
    resolve(baseDir, "../layer/studio-layer-operations.ts"),
    resolve(baseDir, "../layer/studio-layer-lift-session.ts"),
    resolve(baseDir, "./studio-pixel-tool-sessions.ts"),
    resolve(baseDir, "../studio-page-advanced-fill.ts"),
    resolve(baseDir, "../canvas/studio-zoom-gesture-engine.ts"),
    resolve(baseDir, "../studio-page-menu-asset-loaders.ts"),
    resolve(baseDir, "../studio-page-companion-runtime.ts"),
    resolve(baseDir, "../export/studio-publish-package-export.ts"),
    resolve(baseDir, "../live/studio-collaboration-wiring.ts"),
    resolve(baseDir, "./studio-deferred-stroke-commit.ts"),
    resolve(baseDir, "./studio-asset-library-mutations.ts"),
    resolve(baseDir, "../studio-page-shortcut-dispatcher.ts"),
    resolve(baseDir, "../studio-page-comments-runtime.ts"),
    resolve(baseDir, "../studio-page-autosave-runtime.ts"),
    resolve(baseDir, "../hybrid-dcc/studio-hybrid-dcc-persistence.ts"),
    // DCC 라우트/내비게이션 절반. 지속성 절반 바로 뒤에 둬서 세 조각이 인접하게 읽힌다.
    resolve(baseDir, "../studio-router/studio-dcc-workbench-navigation.ts"),
    resolve(baseDir, "../studio-router/StudioDccWorkbenchRoute.tsx"),
    resolve(baseDir, "../studio-page-workspace-persistence.ts"),
    resolve(baseDir, "../render/studio-hokusai-natural-media-replacement.ts"),
    resolve(baseDir, "../render/studio-live-stroke-gpu-audit.ts"),
    resolve(baseDir, "../StudioPage.tsx"),
    resolve(baseDir, "../studio-page-vector-ops.ts"),
    resolve(baseDir, "../ai/studio-scenario-image-generation.ts"),
    resolve(baseDir, "../bg3d/studio-bg3d-lt-apply.ts"),
    resolve(baseDir, "../studio-page-editor-ui-contracts.ts"),
    resolve(baseDir, "../studio-page-shell-runtime.ts"),
    resolve(baseDir, "../studio-page-editor-runtime-loaders.ts"),
    resolve(baseDir, "../studio-legacy-editor-runtime-helpers.ts"),
    resolve(baseDir, "./studio-cuttoon-stage-pointers.ts"),
    resolve(baseDir, "./StudioCuttoonEditorView.tsx"),
    resolve(baseDir, "../studio-page-editor-types.ts"),
    resolve(baseDir, "../studio-page-comipo-seeds.ts"),
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}
