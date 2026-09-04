import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const bodySource = readFileSync(
  new URL("./StudioInspectorAsideBody.tsx", import.meta.url),
  "utf8",
);
const multiSelectionSource = readFileSync(
  new URL("./StudioInspectorMultiSelectionSection.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("./StudioInspectorAsideShell.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("./StudioCuttoonEditorHost.tsx", import.meta.url),
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
  it("keeps representative-only details out while mounting the dedicated group surface", () => {
    expect(bodySource).toContain(
      'inspectorContentMode === "selection" && marqueeIds.length > 1',
    );
    expect(bodySource).toContain(
      "!hasMultiSelection ? (\n            <StudioInspectorSelectionSection",
    );
    expect(bodySource).toContain(
      "<StudioInspectorMultiSelectionSection model={model} />",
    );
    expect(multiSelectionSource).toContain("<StudioInspectorSelectionActions");
    expect(multiSelectionSource).toContain(
      'data-testid="studio-inspector-context-multi-selection"',
    );
  });

  it("mounts atomic batch rename inside the same mutation gate with canonical document inputs", () => {
    expect(multiSelectionSource).toContain("<StudioInspectorBatchRenameSection");
    expect(multiSelectionSource).toContain("elements={elements}");
    expect(multiSelectionSource).toContain("selectedIds={marqueeIds}");
    expect(multiSelectionSource).toContain("groups={groups}");
    expect(multiSelectionSource).toContain("commit={(next) => commit(next)}");
    expect(multiSelectionSource).toContain("announce={announceDrawingShortcut}");
    expect(multiSelectionSource.indexOf("<StudioInspectorBatchRenameSection")).toBeGreaterThan(
      multiSelectionSource.indexOf("<fieldset"),
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

  it("routes multi numeric edits through one atomic planner and one commit", () => {
    const applyPatchSource = functionBody(
      "applyFigmaSelectionLayoutPatch",
      "reorder",
    );

    expect(applyPatchSource).toContain("planStudioFigmaMultiEdit({");
    expect(applyPatchSource).toContain("isEffectivelyLocked(element, groups)");
    expect(applyPatchSource).toContain('if (plan.kind === "unchanged")');
    expect(applyPatchSource).toContain("if (!commit(plan.next)) return");
    expect(applyPatchSource).toContain("announceDrawingShortcut(plan.announcement)");
  });
});
