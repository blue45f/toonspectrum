// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioLayerNavigatorItemStatusLabel } from "./studio-layer-navigator-row-ui";
import {
  StudioLayerNavigatorItemRow,
  type LayerNavigatorRowHandlers,
  type StudioLayerNavigatorItemRowProps,
} from "./StudioLayerNavigatorItemRow";

import type { StudioLayerNavigatorItem } from "./studio-layer-navigator";

const ITEM: StudioLayerNavigatorItem = {
  id: "line-art",
  type: "image",
  label: "주인공 원화",
  zIndex: 4,
  role: "color",
  color: "blue",
  fillReference: true,
  alphaLocked: true,
  masked: true,
  maskEnabled: false,
  aiGenerated: true,
  clipBelow: true,
  animated: true,
};

function rowHandlers(
  overrides: Partial<LayerNavigatorRowHandlers> = {}
): LayerNavigatorRowHandlers {
  return {
    onRowFocus: vi.fn(),
    onRowKeyDown: vi.fn(),
    onRowClick: vi.fn(),
    onRowDoubleClick: vi.fn(),
    onToggleItemHidden: vi.fn(),
    onOpenItemActionMenu: vi.fn(),
    registerRowRef: vi.fn(),
    ...overrides,
  };
}

function rowProps(
  overrides: Partial<StudioLayerNavigatorItemRowProps> = {}
): StudioLayerNavigatorItemRowProps {
  return {
    item: ITEM,
    rowKey: "item:line-art",
    level: 2,
    kind: "image",
    groupName: "주인공",
    effectivelyHidden: false,
    locallyHidden: false,
    statusLabel: "채우기 참조, 알파 락, 마스크 꺼짐, AI 작업, 아래 클리핑, 애니메이션",
    selected: false,
    tabStop: false,
    renameInput: null,
    mobileMultiSelect: false,
    readOnly: false,
    hiddenByGroup: false,
    actionOpen: false,
    actionPopoverId: "layer-actions",
    stableHandlers: rowHandlers(),
    ...overrides,
  };
}

function renderRow(props: StudioLayerNavigatorItemRowProps) {
  return render(
    <ul role="tree">
      <StudioLayerNavigatorItemRow {...props} />
    </ul>
  );
}

afterEach(cleanup);

describe("StudioLayerNavigatorItemRow", () => {
  it("renders selected, read-only, group/local-hidden, metadata, mask, and rename state", () => {
    const statusLabel = studioLayerNavigatorItemStatusLabel({
      item: ITEM,
      kind: "image",
      group: null,
      effectivelyHidden: true,
      effectivelyLocked: true,
    });
    expect(statusLabel).toBe(
      "숨김, 잠김, 채우기 참조, 알파 락, 마스크 꺼짐, AI 작업, 아래 클리핑, 애니메이션"
    );

    renderRow(
      rowProps({
        effectivelyHidden: true,
        locallyHidden: true,
        statusLabel,
        selected: true,
        tabStop: true,
        mobileMultiSelect: true,
        readOnly: true,
        hiddenByGroup: true,
        actionOpen: true,
        renameInput: (
          <input aria-label="레이어 이름 편집" defaultValue="새 이름" />
        ),
      })
    );

    const treeItem = screen.getByRole("treeitem", {
      name: /주인공 원화, 이미지, 그룹 주인공, 역할 채색, 색 라벨 파랑, 숨김, 잠김.+마스크 꺼짐.+나만 숨김/,
    });
    expect(treeItem.getAttribute("aria-selected")).toBe("true");
    expect(treeItem.getAttribute("aria-level")).toBe("2");
    expect(treeItem.tabIndex).toBe(0);
    expect(treeItem.dataset.studioLayerSelected).toBe("true");
    expect(treeItem.dataset.studioLayerLocalHidden).toBe("true");
    expect(treeItem.title).toContain("나만 숨김");
    expect(treeItem.className).toContain("content-visibility:auto");
    expect(screen.getByLabelText("색 라벨 파랑").className).toContain("bg-cool");

    const renameInput = screen.getByRole("textbox", {
      name: "레이어 이름 편집",
    }) as HTMLInputElement;
    expect(renameInput.value).toBe("새 이름");

    const visibility = screen.getByRole("button", {
      name: "주인공 원화, 그룹에서 숨김",
    }) as HTMLButtonElement;
    expect(visibility.disabled).toBe(true);
    expect(visibility.title).toBe(
      "상위 그룹이 숨겨져 있어 그룹을 먼저 표시해야 해요"
    );

    const action = screen.getByRole("button", {
      name: "주인공 원화 레이어 작업",
    });
    expect(action.getAttribute("aria-expanded")).toBe("true");
    expect(action.getAttribute("aria-controls")).toBe("layer-actions");
  });

  it("dispatches visibility and action controls exactly once without selecting the row", () => {
    const onRowClick = vi.fn();
    const onToggleItemHidden = vi.fn();
    const onOpenItemActionMenu = vi.fn();
    const onAncestorClick = vi.fn();
    const handlers = rowHandlers({
      onRowClick,
      onToggleItemHidden,
      onOpenItemActionMenu,
    });

    document.body.addEventListener("click", onAncestorClick);
    try {
      renderRow(rowProps({ stableHandlers: handlers }));

      fireEvent.click(
        screen.getByRole("button", { name: "주인공 원화 숨김" })
      );
      expect(onToggleItemHidden).toHaveBeenCalledOnce();
      expect(onToggleItemHidden).toHaveBeenCalledWith("line-art", true);
      expect(onRowClick).not.toHaveBeenCalled();
      expect(onAncestorClick).not.toHaveBeenCalled();

      fireEvent.click(
        screen.getByRole("button", { name: "주인공 원화 레이어 작업" })
      );
      expect(onOpenItemActionMenu).toHaveBeenCalledOnce();
      expect(onOpenItemActionMenu).toHaveBeenCalledWith(
        expect.anything(),
        "line-art"
      );
      expect(onRowClick).not.toHaveBeenCalled();
      expect(onAncestorClick).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener("click", onAncestorClick);
    }
  });

  it("keeps ordinary row focus, keyboard, click, and double-click delegated", () => {
    const onRowFocus = vi.fn();
    const onRowKeyDown = vi.fn();
    const onRowClick = vi.fn();
    const onRowDoubleClick = vi.fn();
    const handlers = rowHandlers({
      onRowFocus,
      onRowKeyDown,
      onRowClick,
      onRowDoubleClick,
    });
    renderRow(rowProps({ stableHandlers: handlers, tabStop: true }));
    const treeItem = screen.getByRole("treeitem");

    fireEvent.focus(treeItem);
    fireEvent.keyDown(treeItem, { key: "Enter" });
    fireEvent.click(treeItem);
    fireEvent.doubleClick(treeItem);

    expect(onRowFocus).toHaveBeenCalledOnce();
    expect(onRowFocus).toHaveBeenCalledWith("item:line-art");
    expect(onRowKeyDown).toHaveBeenCalledOnce();
    expect(onRowKeyDown).toHaveBeenCalledWith(
      expect.anything(),
      "item:line-art"
    );
    expect(onRowClick).toHaveBeenCalledOnce();
    expect(onRowClick).toHaveBeenCalledWith(expect.anything(), "line-art");
    expect(onRowDoubleClick).toHaveBeenCalledOnce();
    expect(onRowDoubleClick).toHaveBeenCalledWith(
      expect.anything(),
      "line-art",
      "주인공 원화"
    );
  });
});
