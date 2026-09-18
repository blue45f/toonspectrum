// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dSceneOutliner } from "./StudioBg3dSceneOutliner";
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
    locked: false,
    parentId: "room",
  },
  {
    id: "light",
    label: "조명",
    kind: "primitive",
    visible: false,
    locked: true,
    parentId: null,
  },
];

function createController() {
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
    query: "",
    items: ITEMS,
    filteredItems: ITEMS,
    hierarchy: resolveStudioBg3dHierarchy(ITEMS),
    selectedIds: new Set(["room"]),
    primitiveColors: new Map([
      ["room", "#b56b49"],
      ["light", "#ffe2a1"],
    ]),
    ...callbacks,
  });
  return { callbacks, controller };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudioBg3dSceneOutliner", () => {
  it("renders the hierarchy and delegates search and object actions", () => {
    const { callbacks, controller } = createController();
    render(<StudioBg3dSceneOutliner controller={controller} variant="dock" />);

    expect(screen.getByRole("tree", { name: "3D 장면 객체" })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: /교실/ }).getAttribute("aria-level")).toBe("1");
    expect(screen.getByRole("treeitem", { name: /책상/ }).getAttribute("aria-level")).toBe("2");

    fireEvent.change(screen.getByRole("searchbox", { name: "장면 계층 검색" }), {
      target: { value: "책상" },
    });
    expect(callbacks.onQueryChange).toHaveBeenCalledWith("책상");

    fireEvent.click(screen.getByRole("button", { name: "책상" }), { ctrlKey: true });
    expect(callbacks.onSelect).toHaveBeenCalledWith("desk", "toggle");

    fireEvent.click(screen.getByRole("button", { name: "책상 숨기기" }));
    fireEvent.click(screen.getByRole("button", { name: "책상 잠금" }));
    fireEvent.click(screen.getByRole("button", { name: "책상 복제" }));
    fireEvent.click(screen.getByRole("button", { name: "책상 삭제" }));

    expect(callbacks.onToggleVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ id: "desk" }),
    );
    expect(callbacks.onToggleLock).toHaveBeenCalledWith(expect.objectContaining({ id: "desk" }));
    expect(callbacks.onDuplicate).toHaveBeenCalledWith(expect.objectContaining({ id: "desk" }));
    expect(callbacks.onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "desk" }));
  });

  it("supports collapse and keyboard traversal without owning scene state", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => {
      callback(0);
      return 1;
    });
    const { callbacks, controller } = createController();
    render(<StudioBg3dSceneOutliner controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: "교실 접기" }));
    expect(screen.queryByRole("button", { name: "책상" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "교실 펼치기" }));

    const roomButton = screen.getByRole("button", { name: "교실" });
    roomButton.focus();
    fireEvent.keyDown(roomButton, { key: "ArrowDown" });
    expect(callbacks.onSelect).toHaveBeenLastCalledWith("desk", "replace");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "책상" }));

    fireEvent.keyDown(screen.getByRole("button", { name: "책상" }), { key: "ArrowLeft" });
    expect(callbacks.onSelect).toHaveBeenLastCalledWith("room", "replace");
  });
});
