import { readFileSync } from "node:fs";
import path from "node:path";

/** Inspector entry plus extracted presentational slices used by source-scan tests. */
export const STUDIO_INSPECTOR_ASIDE_SURFACE_FILES = [
  "StudioInspectorAside.tsx",
  "StudioInspectorAsideTypes.ts",
  "StudioInspectorAsideBody.tsx",
  "StudioInspectorAsideShell.tsx",
  "StudioInspectorSelectionSection.tsx",
  "StudioInspectorImageToolsSection.tsx",
  "StudioInspectorEmptyCoachSection.tsx",
  "StudioInspectorDrawingSection.tsx",
  "StudioInspectorUnselectedImageTools.tsx",
  "useStudioInspectorAsideModel.ts",
  "StudioInspectorShapeSection.tsx",
  "StudioInspectorTypographySection.tsx",
  "StudioInspectorRulersSection.tsx",
  "StudioInspectorOrderAlignSection.tsx",
] as const;

export function readStudioInspectorAsideSurface(): string {
  const dir = path.join(process.cwd(), "src/domains/creator");
  return STUDIO_INSPECTOR_ASIDE_SURFACE_FILES.map((file) =>
    readFileSync(path.join(dir, file), "utf8"),
  ).join("\n");
}
