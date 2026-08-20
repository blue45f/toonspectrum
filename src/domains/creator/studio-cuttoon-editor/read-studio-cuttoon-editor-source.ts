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
    resolve(baseDir, "../canvas/studio-hokusai-gpu-plan-matchers.ts"),
    resolve(baseDir, "../export/studio-interchange-import.ts"),
    resolve(baseDir, "../layer/studio-layer-operations.ts"),
    resolve(baseDir, "./studio-pixel-tool-sessions.ts"),
    resolve(baseDir, "../studio-page-advanced-fill.ts"),
    resolve(baseDir, "../canvas/studio-zoom-gesture-engine.ts"),
    resolve(baseDir, "../studio-page-menu-asset-loaders.ts"),
    resolve(baseDir, "../studio-page-companion-runtime.ts"),
    resolve(baseDir, "../export/studio-publish-package-export.ts"),
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
