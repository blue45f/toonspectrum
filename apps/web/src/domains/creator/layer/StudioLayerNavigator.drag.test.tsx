// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLayerGroup } from "../studio-layers";

import {
  StudioLayerNavigator,
  type StudioLayerNavigatorAction,
} from "./StudioLayerNavigator";

import type { StudioLayerNavigatorItem } from "./studio-layer-navigator";

const ITEMS: StudioLayerNavigatorItem[] = [
  { id: "back", type: "image", label: "배경 채색", zIndex: 0 },
  { id: "middle", type: "draw", label: "인물 선화", zIndex: 1 },
  { id: "front", type: "bubble", label: "주인공 대사", zIndex: 2 },
];

function dataTransfer(): DataTransfer {
  return {
    effectAllowed: "none",
    dropEffect: "none",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn(),
    getData: vi.fn(() => ""),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

function dragOverAt(target: HTMLElement, transfer: DataTransfer, clientY: number) {
  // jsdom does not expose DragEvent, so Testing Library's convenience constructor may discard
  // MouseEventInit coordinates. Define the two native drag fields explicitly.
  const event = new Event("dragover", { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientY: { configurable: true, value: clientY },
    dataTransfer: { configurable: true, value: transfer },
  });
  fireEvent(target, event);
}

function layerRow(name: RegExp): HTMLElement {
  return screen.getByRole("treeitem", { name });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioLayerNavigator drag workbench", () => {
  it("routes standard and arrow ordering shortcuts through one multi-selection action", () => {
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={ITEMS}
        groups={[]}
        selectedIds={["middle", "front"]}
        pageKey="shortcut-order"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    const target = layerRow(/인물 선화/);
    fireEvent.keyDown(target, { key: "]", code: "BracketRight", metaKey: true });
    fireEvent.keyDown(target, {
      key: "[",
      code: "BracketLeft",
      ctrlKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(target, { key: "ArrowUp", altKey: true });

    expect(actions).toEqual([
      { type: "reorder-items", ids: ["middle", "front"], direction: "forward" },
      { type: "reorder-items", ids: ["middle", "front"], direction: "back" },
      { type: "reorder-items", ids: ["middle", "front"], direction: "forward" },
    ]);
    expect(target.getAttribute("aria-keyshortcuts")).toContain("Shift+Meta+]");
    expect(target.getAttribute("aria-keyshortcuts")).toContain("Alt+ArrowUp");
  });

  it("emits an arbitrary root drop action and exposes a precise visual insertion line", () => {
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={ITEMS}
        groups={[]}
        selectedIds={["middle"]}
        pageKey="drag-root"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    const transfer = dataTransfer();
    const handle = screen.getByRole("button", { name: "인물 선화 레이어 끌어 순서 변경" });
    fireEvent.dragStart(handle, { dataTransfer: transfer });
    const target = layerRow(/주인공 대사/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    dragOverAt(target, transfer, 105);
    expect(target.getAttribute("data-studio-layer-drop-side")).toBe("front");
    expect(target.querySelector('[data-studio-layer-drop-indicator="front"]')).toBeTruthy();
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 105 });

    expect(actions).toContainEqual({
      type: "drop-items",
      ids: ["middle"],
      targetId: "front",
      side: "front",
      mode: "units",
    });
  });

  it("uses the center of a group row as an explicit membership drop target", () => {
    const group = createLayerGroup("character", "캐릭터");
    const items: StudioLayerNavigatorItem[] = [
      { id: "loose", type: "image", label: "그룹 밖 채색", zIndex: 2 },
      { id: "ink", type: "draw", label: "그룹 선화", zIndex: 1, groupId: group.id },
      { id: "color", type: "image", label: "그룹 채색", zIndex: 0, groupId: group.id },
    ];
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={items}
        groups={[group]}
        selectedIds={["loose"]}
        pageKey="drag-group"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    const transfer = dataTransfer();
    const handle = screen.getByRole("button", { name: "그룹 밖 채색 레이어 끌어 순서 변경" });
    fireEvent.dragStart(handle, { dataTransfer: transfer });
    const target = layerRow(/캐릭터, 그룹, 2개 레이어/);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    dragOverAt(target, transfer, 120);
    expect(target.getAttribute("data-studio-layer-group-drop")).toBe("inside");
    fireEvent.drop(target, { dataTransfer: transfer, clientY: 120 });

    expect(actions).toContainEqual({
      type: "assign-items-to-group",
      ids: ["loose"],
      groupId: "character",
    });
  });

  it("offers touch-friendly batch front/back controls and disables reorder while filtered", () => {
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={ITEMS}
        groups={[]}
        selectedIds={["middle"]}
        pageKey="batch-order"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 1개 맨 앞으로" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 1개 맨 뒤로" }));
    expect(actions).toEqual([
      { type: "reorder-items", ids: ["middle"], direction: "front" },
      { type: "reorder-items", ids: ["middle"], direction: "back" },
    ]);

    fireEvent.change(screen.getByRole("searchbox", { name: "레이어 이름·텍스트·그룹 검색" }), {
      target: { value: "인물" },
    });
    expect(
      (screen.getByRole("button", { name: "인물 선화 레이어 끌어 순서 변경" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "선택 1개 맨 앞으로" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
