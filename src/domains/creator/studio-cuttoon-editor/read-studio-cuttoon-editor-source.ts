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
    resolve(baseDir, "../StudioPage.tsx"),
    resolve(baseDir, "../studio-page-editor-ui-contracts.ts"),
    resolve(baseDir, "../studio-page-shell-runtime.ts"),
    resolve(baseDir, "../studio-page-editor-runtime-loaders.ts"),
    resolve(baseDir, "../studio-legacy-editor-runtime-helpers.ts"),
    resolve(baseDir, "./studio-cuttoon-stage-pointers.ts"),
    resolve(baseDir, "./StudioCuttoonEditorView.tsx"),
  ]
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
}
