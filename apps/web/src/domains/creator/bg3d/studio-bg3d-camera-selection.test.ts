import { describe, expect, it, vi } from "vitest";

import {
  readStudioBg3dSelectionBounds,
  resolveStudioBg3dFocusSelection,
} from "./studio-bg3d-camera-selection";

const input = {
  selectedIds: new Set(["chair", "table"]),
  entities: [{ id: "chair", locked: true }, { id: "table" }, { id: "hidden" }],
  customModels: [{ id: "chair" }],
  visibleIds: new Set(["chair", "table"]),
  readyModelIds: new Set(["chair"]),
  failedModelIds: new Set<string>(),
  registeredObjects: new Map<string, unknown>([["chair", {}], ["table", {}]]),
  interactionLocked: false,
};

describe("Studio BG3D selection framing", () => {
  it("frames multiple selected objects including locked models without mutating selection", () => {
    expect(resolveStudioBg3dFocusSelection(input)).toEqual({
      ids: ["chair", "table"], disabledReason: null,
    });
    expect([...input.selectedIds]).toEqual(["chair", "table"]);
  });

  it("excludes hidden selections and descendants of hidden parents using effective visibility", () => {
    const result = resolveStudioBg3dFocusSelection({
      ...input, selectedIds: new Set(["hidden", "chair", "table"]),
    });
    expect(result).toEqual({ ids: ["chair", "table"], disabledReason: null });
    expect(resolveStudioBg3dFocusSelection({
      ...input, selectedIds: new Set(["hidden"]),
    }).disabledReason).toContain("숨겨진");
  });

  it("blocks a pending or failed visible model instead of framing only the loaded subset", () => {
    const pending = resolveStudioBg3dFocusSelection({ ...input, readyModelIds: new Set() });
    expect(pending.ids).toEqual([]);
    expect(pending.disabledReason).toContain("준비하는 중");
    const failed = resolveStudioBg3dFocusSelection({
      ...input, readyModelIds: new Set(), failedModelIds: new Set(["chair"]),
    });
    expect(failed.ids).toEqual([]);
    expect(failed.disabledReason).toContain("불러오지 못");
  });

  it.each([
    { selectedIds: new Set<string>() },
    { selectedIds: new Set(["deleted"]) },
    { interactionLocked: true },
    { registeredObjects: new Map<string, unknown>() },
  ])("blocks an unavailable selection: %o", (patch) => {
    const result = resolveStudioBg3dFocusSelection({ ...input, ...patch });
    expect(result.ids).toEqual([]);
    expect(result.disabledReason).toBeTruthy();
  });

  it("combines every chosen object's world bounds including translated negative coordinates", () => {
    const readBounds = vi.fn((id: string) => id === "chair"
      ? { min: [-12, -2, 3], max: [-10, 1, 5] } as const
      : { min: [7, 0, -4], max: [11, 4, 1] } as const);
    const result = readStudioBg3dSelectionBounds(["chair", "table"], readBounds);
    expect(result).toEqual({ min: [-12, -2, -4], max: [11, 4, 5] });
    expect(readBounds.mock.calls).toEqual([["chair"], ["table"]]);
    expect(Object.isFrozen(result?.min)).toBe(true);
  });

  it.each([
    null,
    { min: [0, 0, 0], max: [NaN, 1, 1] },
    { min: [2, 0, 0], max: [1, 1, 1] },
    { min: [0, 0, 0], max: [10_001, 1, 1] },
  ] as const)("fails the complete selection when one object's bounds are unavailable: %o", (badBounds) => {
    expect(readStudioBg3dSelectionBounds(["chair", "table"], (id) => (
      id === "chair" ? { min: [0, 0, 0], max: [1, 1, 1] } : badBounds
    ))).toBeNull();
  });
});
