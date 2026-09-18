import { describe, expect, it, vi } from "vitest";

import { resolveStudioBg3dHierarchy } from "./studio-bg3d-hierarchy";
import { createStudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";

import type { StudioBg3dLayerListItem } from "./studio-bg3d-object-ops";

const ITEMS: readonly StudioBg3dLayerListItem[] = [
  {
    id: "room",
    label: "교실",
    kind: "primitive",
    visible: true,
    locked: false,
    parentId: null,
  },
  {
    id: "desk",
    label: "책상",
    kind: "model",
    visible: true,
    locked: true,
    parentId: "room",
  },
];

describe("createStudioBg3dSceneOutlinerController", () => {
  it("creates an immutable renderer-neutral projection and delegates mutations", () => {
    const callbacks = {
      onQueryChange: vi.fn(),
      onSelect: vi.fn(),
      onRename: vi.fn(),
      onToggleVisibility: vi.fn(),
      onToggleLock: vi.fn(),
      onDuplicate: vi.fn(),
      onRemove: vi.fn(),
    };
    const controller = createStudioBg3dSceneOutlinerController({
      query: "책",
      items: ITEMS,
      filteredItems: [ITEMS[1]!],
      hierarchy: resolveStudioBg3dHierarchy(ITEMS),
      selectedIds: new Set(["desk"]),
      primitiveColors: new Map([["room", "#c26b4a"]]),
      ...callbacks,
    });

    expect(controller.items).toEqual([
      expect.objectContaining({ id: "room", color: "#c26b4a" }),
      expect.objectContaining({ id: "desk", locked: true }),
    ]);
    expect(controller.filteredItems.map((item) => item.id)).toEqual(["desk"]);
    expect(controller.selectedIds.has("desk")).toBe(true);
    expect(Object.isFrozen(controller)).toBe(true);
    expect(Object.isFrozen(controller.items)).toBe(true);
    expect(Object.isFrozen(controller.items[0])).toBe(true);

    controller.setQuery("교실");
    controller.select("room", "toggle");
    controller.rename(controller.items[0]!);
    controller.toggleVisibility(controller.items[0]!);
    controller.toggleLock(controller.items[0]!);
    controller.duplicate(controller.items[1]!);
    controller.remove(controller.items[1]!);

    expect(callbacks.onQueryChange).toHaveBeenCalledWith("교실");
    expect(callbacks.onSelect).toHaveBeenCalledWith("room", "toggle");
    expect(callbacks.onRename).toHaveBeenCalledWith(
      expect.objectContaining({ id: "room", color: "#c26b4a" }),
    );
    expect(callbacks.onToggleVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ id: "room" }),
    );
    expect(callbacks.onToggleLock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "room" }),
    );
    expect(callbacks.onDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "desk" }),
    );
    expect(callbacks.onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "desk" }),
    );
  });
});
