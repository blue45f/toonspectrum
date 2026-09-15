import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const selectionDecorations = source("./canvas/StudioCanvasSelectionDecorations.tsx");
const groupProxy = source("./StudioGroupUniformResizeProxy.tsx");
const interaction = source("./canvas/studio-canvas-viewport-interaction.ts");
const stageDrag = source("./studio-cuttoon-editor/studio-cuttoon-stage-pointers-drag.ts");
const clipboard = source("./studio-page-clipboard-controller.ts");
const shortcutDispatcher = source("./studio-page-shortcut-dispatcher.ts");

describe("Studio natural transform integration", () => {
  it("routes ordinary objects, freehand ink and multi-selection through one modifier contract", () => {
    expect(selectionDecorations).toContain("<StudioNaturalTransformer");
    expect(groupProxy).toContain("<StudioNaturalTransformer");
    expect(selectionDecorations).toContain('naturalRatioMode={singleObjectRatioLocked ? "always" : "shift"}');
    expect(groupProxy).toContain('naturalRatioMode={freeTransform ? "shift" : "always"}');
    expect(selectionDecorations).toContain("constrainStudioTransformBox");
    expect(groupProxy).toContain("constrainStudioTransformBox");
  });

  it("turns Alt/Option-drag into one in-place clone while restoring the source node", () => {
    expect(interaction).toContain("nativeEvent.altKey === true");
    expect(interaction).toContain("restoreDuplicateDragSource(intent)");
    expect(interaction).toContain('placement: "in-place"');
    expect(interaction).toContain('announcement: "복제하여 이동"');
    expect(clipboard).toContain("singleElementPatch && plannedElements.length === 1");
    expect(clipboard).toContain("id: plannedElements[0]!.id");
    expect(clipboard).toContain("!commit(");
    expect(stageDrag).toContain("duplicate: e.evt.altKey === true");
    expect(stageDrag).toContain('translation: { deltaX: dx, deltaY: dy }');
    expect(stageDrag).toContain("restoreGroupDragPreview(g, dx, dy)");
  });

  it("uses Cmd/Ctrl+D contextually while preserving Cmd/Ctrl+J compatibility", () => {
    expect(shortcutDispatcher).toContain('editShortcut === "duplicate-or-deselect"');
    expect(shortcutDispatcher).toContain("pixelSelectionOwnsChord");
    expect(shortcutDispatcher).toContain("duplicateSelected()");
    expect(shortcutDispatcher).toContain("deselectForEdit()");
  });
});
