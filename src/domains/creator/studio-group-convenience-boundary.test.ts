import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);

function functionBody(name: string, nextName: string): string {
  const start = pageSource.indexOf(`function ${name}`);
  const end = pageSource.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return pageSource.slice(start, end);
}

describe("Studio PPT-style group convenience boundary", () => {
  it("keeps the newly created group selected for the next operation", () => {
    const source = functionBody("groupSelectedElements", "completeSelectedGroupId");
    expect(source).toContain("const memberIds = [...marqueeIds]");
    expect(source).toContain("setMarqueeIds(memberIds)");
    expect(source).toContain("setActiveGroupId(null)");
  });

  it("keeps selection after ungroup and clears both group and member locks on unlock", () => {
    const ungroupSource = functionBody(
      "ungroupSelectedElements",
      "toggleSelectedElementsLocked",
    );
    const lockSource = functionBody(
      "toggleSelectedElementsLocked",
      "reorderSelectedElements",
    );

    expect(ungroupSource).toContain("ungroupItems(elements, groupId)");
    expect(ungroupSource).toContain("setMarqueeIds");
    expect(lockSource).toContain("isEffectivelyLocked(element, groups)");
    expect(lockSource).toContain("group.id === groupId");
    expect(lockSource).toContain("locked: false");
  });

  it("routes multi-selection ordering through the group-safe layer planner", () => {
    const source = functionBody("reorderSelectedElements", "deleteLayerGroup");

    expect(source).toContain(
      "reorderLayerSelection(elements, marqueeIds, direction)",
    );
    expect(source).toContain("commit(next)");
  });

  it("duplicates through the canonical clipboard planner so group IDs and tracks are remapped", () => {
    const source = functionBody("duplicateSelected", "nudgeSelected");
    expect(source).toContain("captureSelectedStudioClipboard()");
    expect(source).toContain(
      'applyStudioClipboardPayload(captured.payload, "cascade", "복제")',
    );
    expect(source).not.toContain("insertLayerCopiesAdjacent");
  });

  it("moves selected freehand strokes with the rest of a dragged group", () => {
    const start = pageSource.indexOf("function onStageDragEnd");
    const end = pageSource.indexOf("async function startEditText", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const source = pageSource.slice(start, end);
    expect(source).toContain('el.type === "draw"');
    expect(source).toContain("points: el.points.map");
    expect(source).toContain("index % 2 === 0 ? dx : dy");
  });
});
