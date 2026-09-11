import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../../..");
function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Brush Studio composition runtime product boundary", () => {
  it("routes live, committed and export pixels through the composition authority", () => {
    for (const path of [
      "apps/web/src/domains/creator/brush/StudioDrawNode.tsx",
      "apps/web/src/domains/creator/live/studio-live-retained-media-overlay.ts",
      "apps/web/src/domains/creator/export/studio-svg-export-freehand-media.ts",
    ]) {
      const content = source(path);
      expect(content, path).toContain("resolveStudioBrushRuntimeProgramSet");
      expect(content, path).not.toContain("brushEnginePrograms?.oil");
      expect(content, path).not.toContain("brushEnginePrograms?.watercolor");
    }
  });

  it("does not expose inert catalogue choices as writable product controls", () => {
    const composer = source("apps/web/src/domains/creator/brush/StudioBrushCompositionComposer.tsx");
    expect(composer).toContain("isStudioBrushCompositionRuntimeSelectable");
    expect(composer).toContain("disabled={!available}");
    expect(composer).toContain("현재 출력 미연결");
    expect(composer).toContain("constrainStudioBrushCompositionToRuntime");
  });
});
