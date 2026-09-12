import { describe, expect, it } from "vitest";

import { findStudioLayerTypeahead, selectStudioLayerKeyboardRange } from "./studio-layer-keyboard-navigation";

const rows = [
  { key: "ink", label: "Ink", itemIds: ["ink"] },
  { key: "folder", label: "Character", itemIds: ["line", "color"] },
  { key: "line", label: "Line", itemIds: ["line"] },
  { key: "image", label: "Image", itemIds: ["image"] },
];

describe("layer tree keyboard selection", () => {
  it("selects a collapsed folder as a unit", () => {
    const collapsedRows = rows.filter((row) => row.key !== "line");
    expect(selectStudioLayerKeyboardRange({ rows: collapsedRows, anchorKey: "ink", targetKey: "folder", selectedIds: [], additive: false }))
      .toEqual(["ink", "line", "color"]);
  });

  it("only includes displayed descendants inside the range of an expanded folder", () => {
    const expandedRows = [
      { key: "ink", label: "Ink", itemIds: ["ink"] },
      { key: "folder", label: "Character", itemIds: [] },
      { key: "line", label: "Line", itemIds: ["line"] },
      { key: "color", label: "Color", itemIds: ["color"] },
    ];
    expect(selectStudioLayerKeyboardRange({ rows: expandedRows, anchorKey: "ink", targetKey: "line", selectedIds: ["ink", "line", "color"], additive: false }))
      .toEqual(["ink", "line"]);
    expect(selectStudioLayerKeyboardRange({ rows: expandedRows, anchorKey: "ink", targetKey: "folder", selectedIds: [], additive: false }))
      .toEqual(["ink"]);
  });

  it("keeps unrelated selections only for additive ranges", () => {
    expect(selectStudioLayerKeyboardRange({ rows, anchorKey: "image", targetKey: "line", selectedIds: ["outside"], additive: true }))
      .toEqual(["outside", "line", "image"]);
    expect(selectStudioLayerKeyboardRange({ rows, anchorKey: "image", targetKey: "line", selectedIds: ["outside"], additive: false }))
      .toEqual(["line", "image"]);
  });

  it("preserves selection for stale anchors and caps large folder expansions", () => {
    expect(selectStudioLayerKeyboardRange({ rows, anchorKey: "removed", targetKey: "line", selectedIds: ["ink"], additive: false }))
      .toEqual(["ink"]);
    const large = [{ key: "all", label: "All", itemIds: Array.from({ length: 700 }, (_, index) => String(index)) }];
    expect(selectStudioLayerKeyboardRange({ rows: large, anchorKey: "all", targetKey: "all", selectedIds: [], additive: false })).toHaveLength(500);
  });
});

describe("layer name typeahead", () => {
  it("cycles repeated initials and wraps without changing document order", () => {
    const first = findStudioLayerTypeahead({ rows, currentKey: "ink", key: "i", previous: null, now: 10 });
    expect(first.key).toBe("image");
    expect(findStudioLayerTypeahead({ rows, currentKey: "image", key: "i", previous: first.state, now: 20 }).key).toBe("ink");
  });

  it("accumulates prefixes while allowing the currently focused match", () => {
    const first = findStudioLayerTypeahead({ rows, currentKey: "folder", key: "i", previous: null, now: 10 });
    expect(first.key).toBe("image");
    expect(findStudioLayerTypeahead({ rows, currentKey: "image", key: "m", previous: first.state, now: 20 }).key).toBe("image");
    expect(findStudioLayerTypeahead({ rows, currentKey: "image", key: "l", previous: first.state, now: 800 }).key).toBe("line");
  });

  it("normalizes unicode names and returns no focus target for empty or unmatched rows", () => {
    const unicode = [{ key: "wide", label: "  ＩＮＫ", itemIds: [] }];
    expect(findStudioLayerTypeahead({ rows: unicode, currentKey: "wide", key: "i", previous: null, now: 10 }).key).toBe("wide");
    expect(findStudioLayerTypeahead({ rows, currentKey: "ink", key: "z", previous: null, now: 10 }).key).toBeNull();
    expect(findStudioLayerTypeahead({ rows: [], currentKey: "ink", key: "i", previous: null, now: 10 }).key).toBeNull();
  });
});
