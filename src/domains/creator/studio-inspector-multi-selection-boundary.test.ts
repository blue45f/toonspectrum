import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const bodySource = readFileSync(
  new URL("./StudioInspectorAsideBody.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("./StudioInspectorAsideShell.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);
const selectionControllerSource = readFileSync(
  new URL("./selection/studio-selection-transform-controller.ts", import.meta.url),
  "utf8",
);
const selectionCombinedSource = [pageSource, selectionControllerSource].join("\n");

function functionBody(name: string, nextName: string): string {
  const start = selectionCombinedSource.indexOf(`function ${name}`);
  const end = selectionCombinedSource.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return selectionCombinedSource.slice(start, end);
}

describe("Studio inspector multi-selection scope", () => {
  it("does not render representative-only detail controls below the shared geometry panel", () => {
    expect(bodySource).toContain(
      'inspectorContentMode === "selection" && marqueeIds.length > 1',
    );
    expect(bodySource).toContain(
      "!hasMultiSelection ? (\n            <StudioInspectorSelectionSection",
    );
  });

  it("hides single-image tool tabs while multiple elements are selected", () => {
    expect(shellSource).toContain(
      "marqueeIds.length <= 1 &&\n              (selectedSupportsImageInspectorTabs || unselectedImageToolsVisible)",
    );
  });

  it("applies numeric edits to a one-item marquee selection", () => {
    const applyPatchSource = functionBody(
      "applyFigmaSelectionLayoutPatch",
      "reorder",
    );

    expect(applyPatchSource).toContain(
      "const targets = selectStudioFigmaDesignTargets(elements, marqueeIds, selected)",
    );
    expect(applyPatchSource).toContain("if (targets.length > 1)");
    expect(applyPatchSource).toContain("const target = targets[0]");
    expect(applyPatchSource).toContain("patchEl(target.id, next)");
    expect(applyPatchSource).not.toContain("if (!selected) return");
  });
});
