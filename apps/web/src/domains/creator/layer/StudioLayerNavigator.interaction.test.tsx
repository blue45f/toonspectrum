// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLayerGroup } from "../studio-layers";
import { activateStudioModalSheet } from "../useStudioModalSheet";

import {
  StudioLayerNavigator,
  type StudioLayerNavigatorAction,
} from "./StudioLayerNavigator";

import type { StudioLayerNavigatorItem } from "./studio-layer-navigator";

const ITEMS: StudioLayerNavigatorItem[] = [
  { id: "back", type: "image", label: "배경 채색", zIndex: 0 },
  { id: "middle", type: "draw", label: "인물 선화", zIndex: 1, locked: true },
  { id: "front", type: "bubble", label: "주인공 대사", zIndex: 2, hidden: true },
];

function Harness({ initial = [] }: { initial?: readonly string[] }) {
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initial);
  return (
    <StudioLayerNavigator
      items={ITEMS}
      groups={[]}
      selectedIds={selectedIds}
      pageKey="page-1"
      localHiddenIds={new Set()}
      onToggleLocalHidden={() => {}}
      onSelectionChange={setSelectedIds}
      onAction={() => {}}
    />
  );
}

function row(name: RegExp): HTMLElement {
  return screen.getByRole("treeitem", { name });
}

afterEach(cleanup);

describe("StudioLayerNavigator selection interaction", () => {
  it("closes only the layer action popover on the first Escape inside a mobile sheet", () => {
    const dismissSheet = vi.fn();
    const { container } = render(
      <div data-testid="root">
        <aside role="dialog" aria-modal="true" aria-label="작업 패널" tabIndex={-1}>
          <Harness />
        </aside>
      </div>,
    );
    const sheet = screen.getByRole("dialog", { name: "작업 패널" });
    const deactivate = activateStudioModalSheet({
      dialog: sheet, document, root: container, onDismiss: dismissSheet,
    });
    try {
      fireEvent.click(container.querySelector('[data-studio-layer-row-action="menu"]')!);
      const popover = screen.getByRole("dialog", { name: /주인공 대사 레이어 작업/u });
      // jsdom has no layout; expose the already-visible popover before its RAF focus transfer.
      const rectangles = vi.spyOn(popover, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
      fireEvent.keyDown(container.querySelector('[data-studio-layer-row-action="menu"]')!, { key: "Escape" });
      rectangles.mockRestore();
      expect(screen.queryByRole("dialog", { name: /주인공 대사 레이어 작업/u })).toBeNull();
      expect(dismissSheet).not.toHaveBeenCalled();
      fireEvent.keyDown(sheet, { key: "Escape" });
      expect(dismissSheet).toHaveBeenCalledOnce();
    } finally {
      deactivate();
    }
  });

  it("routes standard group shortcuts from the shortcut-bounded layer tree", () => {
    const actions: StudioLayerNavigatorAction[] = [];
    render(
      <StudioLayerNavigator
        items={ITEMS}
        groups={[]}
        selectedIds={["middle", "front"]}
        pageKey="page-shortcuts"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={(action) => actions.push(action)}
      />
    );

    const target = row(/주인공 대사/);
    fireEvent.keyDown(target, {
      key: "g",
      code: "KeyG",
      ctrlKey: true,
    });
    fireEvent.keyDown(target, {
      key: "G",
      code: "KeyG",
      metaKey: true,
      shiftKey: true,
    });

    expect(actions).toEqual([
      { type: "group-selection" },
      { type: "ungroup-selection" },
    ]);
  });

  it("disables direct regrouping when the selection already contains grouped layers", () => {
    const group = createLayerGroup("existing", "기존 그룹");
    render(
      <StudioLayerNavigator
        items={[
          {
            id: "grouped",
            type: "draw",
            label: "그룹 선화",
            zIndex: 1,
            groupId: group.id,
          },
          { id: "loose", type: "image", label: "일반 채색", zIndex: 0 },
        ]}
        groups={[group]}
        selectedIds={["grouped", "loose"]}
        pageKey="page-regroup"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={() => {}}
      />
    );

    const create = screen.getByRole("button", {
      name: /새 레이어 그룹, 사용 불가/,
    });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    expect(create.getAttribute("title")).toContain("먼저 그룹을 해제");
  });

  it.each([{ readOnly: true }, { groupingDisabled: true }])(
    "keeps grouping shortcuts inside the same capability gate as the buttons: %o",
    (capability) => {
      const onAction = vi.fn();
      render(
        <StudioLayerNavigator
          items={ITEMS} groups={[]} selectedIds={["middle", "front"]}
          pageKey="guarded-shortcuts" localHiddenIds={new Set()}
          onToggleLocalHidden={() => {}} onSelectionChange={() => {}}
          onAction={onAction} {...capability}
        />,
      );
      const target = row(/주인공 대사/);
      fireEvent.keyDown(target, { key: "g", code: "KeyG", ctrlKey: true });
      fireEvent.keyDown(target, { key: "G", code: "KeyG", metaKey: true, shiftKey: true });
      expect(onAction).not.toHaveBeenCalled();
      fireEvent.keyDown(target, { key: "ArrowDown" });
      expect(document.activeElement).toBe(row(/인물 선화/));
    },
  );

  it("selects a whole group from its row and exposes one-click group lock and collapse", () => {
    const initialGroup = createLayerGroup("character", "캐릭터");
    const groupedItems: StudioLayerNavigatorItem[] = [
      { id: "ink", type: "draw", label: "선화", zIndex: 1, groupId: initialGroup.id },
      { id: "color", type: "image", label: "채색", zIndex: 0, groupId: initialGroup.id },
    ];

    function GroupHarness() {
      const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
      const [groups, setGroups] = useState([initialGroup]);
      const handleAction = (action: StudioLayerNavigatorAction) => {
        if (action.type !== "set-group-flag") return;
        setGroups((current) =>
          current.map((group) =>
            group.id === action.groupId
              ? { ...group, [action.flag]: action.value }
              : group
          )
        );
      };
      return (
        <StudioLayerNavigator
          items={groupedItems}
          groups={groups}
          selectedIds={selectedIds}
          pageKey="page-group"
          localHiddenIds={new Set()}
          onToggleLocalHidden={() => {}}
          onSelectionChange={setSelectedIds}
          onAction={handleAction}
        />
      );
    }

    render(<GroupHarness />);

    fireEvent.click(row(/캐릭터, 그룹, 2개 레이어/));
    expect(row(/선화/).getAttribute("aria-selected")).toBe("true");
    expect(row(/채색/).getAttribute("aria-selected")).toBe("true");
    expect(row(/캐릭터, 그룹, 2개 레이어/).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "캐릭터 그룹 잠금" }));
    expect(screen.getByRole("button", { name: "캐릭터 그룹 잠금 해제" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "캐릭터 그룹 접기" }));
    expect(screen.queryByRole("treeitem", { name: /선화/ })).toBeNull();
    expect(screen.getByRole("button", { name: "캐릭터 그룹 펼치기" })).toBeTruthy();
  });

  it("keeps group rows as atomic units for modifier and mobile multi-selection", () => {
    const character = createLayerGroup("character", "캐릭터");
    const background = createLayerGroup("background", "배경");
    const groupedItems: StudioLayerNavigatorItem[] = [
      { id: "ink", type: "draw", label: "선화", zIndex: 3, groupId: character.id },
      { id: "color", type: "image", label: "채색", zIndex: 2, groupId: character.id },
      { id: "sky", type: "image", label: "하늘", zIndex: 1, groupId: background.id },
      { id: "ground", type: "image", label: "바닥", zIndex: 0, groupId: background.id },
    ];

    function GroupMultiHarness() {
      const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
      return (
        <StudioLayerNavigator
          items={groupedItems}
          groups={[character, background]}
          selectedIds={selectedIds}
          pageKey="page-group-multi"
          localHiddenIds={new Set()}
          onToggleLocalHidden={() => {}}
          onSelectionChange={setSelectedIds}
          onAction={() => {}}
        />
      );
    }

    render(<GroupMultiHarness />);
    const characterRow = row(/캐릭터, 그룹, 2개 레이어/);
    const backgroundRow = row(/배경, 그룹, 2개 레이어/);

    expect(characterRow.getAttribute("aria-keyshortcuts")).toContain("Control+G");
    expect(characterRow.getAttribute("aria-keyshortcuts")).toContain("Shift+Meta+G");

    fireEvent.click(characterRow);
    expect(row(/선화/).getAttribute("aria-selected")).toBe("true");
    expect(row(/채색/).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(backgroundRow, { ctrlKey: true });
    expect(row(/선화/).getAttribute("aria-selected")).toBe("true");
    expect(row(/채색/).getAttribute("aria-selected")).toBe("true");
    expect(row(/하늘/).getAttribute("aria-selected")).toBe("true");
    expect(row(/바닥/).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(characterRow, { shiftKey: true });
    expect(row(/선화/).getAttribute("aria-selected")).toBe("false");
    expect(row(/채색/).getAttribute("aria-selected")).toBe("false");
    expect(row(/하늘/).getAttribute("aria-selected")).toBe("true");
    expect(row(/바닥/).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /다중 선택/ }));
    fireEvent.click(characterRow);
    expect(row(/선화/).getAttribute("aria-selected")).toBe("true");
    expect(row(/채색/).getAttribute("aria-selected")).toBe("true");
    expect(row(/하늘/).getAttribute("aria-selected")).toBe("true");
    expect(row(/바닥/).getAttribute("aria-selected")).toBe("true");
  });

  it("labels the group action toggle from its actual selection state", () => {
    const group = createLayerGroup("character-action", "캐릭터 작업");
    const groupedItems: StudioLayerNavigatorItem[] = [
      { id: "action-ink", type: "draw", label: "작업 선화", zIndex: 1, groupId: group.id },
      { id: "action-color", type: "image", label: "작업 채색", zIndex: 0, groupId: group.id },
    ];

    function GroupActionHarness() {
      const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
      return (
        <StudioLayerNavigator
          items={groupedItems}
          groups={[group]}
          selectedIds={selectedIds}
          pageKey="page-group-action"
          localHiddenIds={new Set()}
          onToggleLocalHidden={() => {}}
          onSelectionChange={setSelectedIds}
          onAction={() => {}}
        />
      );
    }

    render(<GroupActionHarness />);
    fireEvent.click(
      screen.getByRole("button", { name: "캐릭터 작업 그룹 작업" }),
    );

    const selectAll = screen.getByRole("button", {
      name: "캐릭터 작업 그룹 모두 선택",
    });
    expect(selectAll.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(selectAll);

    const clearGroupSelection = screen.getByRole("button", {
      name: "캐릭터 작업 그룹 선택 해제",
    });
    expect(clearGroupSelection.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(clearGroupSelection);
    expect(
      screen.getByRole("button", { name: "캐릭터 작업 그룹 모두 선택" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("keeps click, modifier, range, and keyboard focus as distinct states", () => {
    render(<Harness />);

    fireEvent.click(row(/주인공 대사/));
    expect(row(/주인공 대사/).getAttribute("aria-current")).toBe("true");
    expect(row(/주인공 대사/).dataset.studioLayerSelectionState).toBe("current");
    expect(screen.getByRole("status").textContent).toContain("선택 1");

    fireEvent.click(row(/인물 선화/), { ctrlKey: true });
    expect(row(/주인공 대사/).getAttribute("aria-selected")).toBe("true");
    expect(row(/인물 선화/).getAttribute("aria-selected")).toBe("true");
    expect(row(/주인공 대사/).hasAttribute("aria-current")).toBe(false);
    expect(row(/인물 선화/).hasAttribute("aria-current")).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("선택 2");

    fireEvent.click(row(/배경 채색/), { shiftKey: true });
    expect(row(/주인공 대사/).getAttribute("aria-selected")).toBe("false");
    expect(row(/인물 선화/).getAttribute("aria-selected")).toBe("true");
    expect(row(/배경 채색/).getAttribute("aria-selected")).toBe("true");

    const front = row(/주인공 대사/);
    fireEvent.focus(front);
    fireEvent.keyDown(front, { key: "ArrowDown" });
    expect(document.activeElement).toBe(row(/인물 선화/));
    expect(row(/주인공 대사/).getAttribute("aria-selected")).toBe("false");
    expect(row(/인물 선화/).className).toContain("focus-visible:outline-cool");
  });

  it("turns touch multi-select into visible per-row checks with 44px targets", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /다중 선택/ }));
    fireEvent.click(row(/주인공 대사/));
    fireEvent.click(row(/배경 채색/));

    const front = row(/주인공 대사/);
    const back = row(/배경 채색/);
    expect(front.getAttribute("aria-selected")).toBe("true");
    expect(back.getAttribute("aria-selected")).toBe("true");
    expect(front.querySelector('[data-studio-layer-selection-marker="selected"]')).not.toBeNull();
    expect(back.querySelector('[data-studio-layer-selection-marker="selected"]')).not.toBeNull();
    expect(front.className).toContain("pointer-coarse:min-h-11");
    expect(screen.getByRole("toolbar", { name: "선택 레이어 일괄 작업" }).textContent).toContain("선택 2개");
  });

  it("extends and shrinks a keyboard range around the original anchor", () => {
    render(<Harness />);
    fireEvent.click(row(/주인공 대사/));
    fireEvent.keyDown(row(/주인공 대사/), { key: "ArrowDown", shiftKey: true });
    expect(document.activeElement).toBe(row(/인물 선화/));
    expect(row(/주인공 대사/).getAttribute("aria-selected")).toBe("true");
    expect(row(/인물 선화/).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(row(/인물 선화/), { key: "End", shiftKey: true });
    expect(row(/배경 채색/).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(row(/배경 채색/), { key: "ArrowUp", shiftKey: true });
    expect(row(/배경 채색/).getAttribute("aria-selected")).toBe("false");
    expect(row(/주인공 대사/).getAttribute("aria-selected")).toBe("true");
    expect(row(/인물 선화/).getAttribute("aria-selected")).toBe("true");
  });

  it("selects a range with Shift Space after moving focus independently", () => {
    render(<Harness />);
    fireEvent.click(row(/주인공 대사/));
    fireEvent.keyDown(row(/주인공 대사/), { key: "End" });
    expect(row(/배경 채색/).getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(row(/배경 채색/), { key: " ", shiftKey: true });
    for (const name of [/주인공 대사/, /인물 선화/, /배경 채색/]) {
      expect(row(name).getAttribute("aria-selected")).toBe("true");
    }
  });

  it("uses typed layer names for focus without changing the selection or editing", () => {
    render(<Harness />);
    fireEvent.click(row(/주인공 대사/));
    fireEvent.keyDown(row(/주인공 대사/), { key: "배" });
    expect(document.activeElement).toBe(row(/배경 채색/));
    fireEvent.keyDown(row(/배경 채색/), { key: "경" });
    expect(document.activeElement).toBe(row(/배경 채색/));
    expect(row(/주인공 대사/).getAttribute("aria-selected")).toBe("true");
    expect(row(/배경 채색/).getAttribute("aria-selected")).toBe("false");
  });

  it("does not consume IME composition as tree navigation", () => {
    render(<Harness />);
    const target = row(/주인공 대사/);
    target.focus();
    expect(fireEvent.keyDown(target, { key: "배", isComposing: true })).toBe(true);
    expect(document.activeElement).toBe(target);
  });

  it("keeps range selection inside filtered rows", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("레이어 이름·텍스트·그룹 검색"), { target: { value: "선화" } });
    fireEvent.keyDown(row(/인물 선화/), { key: "End", shiftKey: true });
    expect(row(/인물 선화/).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("선택 1");
  });

  it("limits expanded folder ranges to traversed children and keeps collapsed folders atomic", () => {
    const initialGroup = createLayerGroup("character-range", "캐릭터 범위");
    const onSelectionChange = vi.fn();
    function GroupRangeHarness() {
      const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
      const [group, setGroup] = useState(initialGroup);
      return (
        <StudioLayerNavigator
          items={[
            { id: "outside", type: "bubble", label: "대사", zIndex: 3 },
            { id: "ink", type: "draw", label: "선화", zIndex: 2, groupId: group.id },
            { id: "color", type: "image", label: "채색", zIndex: 1, groupId: group.id },
          ]}
          groups={[group]} selectedIds={selectedIds} pageKey="expanded-range"
          localHiddenIds={new Set()} onToggleLocalHidden={() => {}}
          onSelectionChange={(ids) => { onSelectionChange(ids); setSelectedIds(ids); }}
          onAction={(action) => {
            if (action.type === "set-group-flag") {
              setGroup((current) => ({ ...current, [action.flag]: action.value }));
            }
          }}
        />
      );
    }
    render(<GroupRangeHarness />);
    const folder = row(/캐릭터 범위, 그룹/);
    fireEvent.click(row(/대사/));
    fireEvent.keyDown(row(/대사/), { key: "ArrowDown", shiftKey: true });
    expect(document.activeElement).toBe(folder);
    expect(onSelectionChange).toHaveBeenLastCalledWith(["outside"]);
    fireEvent.keyDown(folder, { key: "ArrowDown", shiftKey: true });
    expect(document.activeElement).toBe(row(/선화/));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["outside", "ink"]);
    expect(row(/채색/).getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(row(/선화/), { key: "ArrowDown", shiftKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["outside", "ink", "color"]);
    fireEvent.keyDown(row(/채색/), { key: "ArrowUp", shiftKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["outside", "ink"]);

    // A direct group click retains its existing whole-group selection contract.
    fireEvent.click(folder);
    expect(onSelectionChange).toHaveBeenLastCalledWith(["ink", "color"]);
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 범위 그룹 접기" }));
    fireEvent.click(row(/대사/));
    fireEvent.keyDown(row(/대사/), { key: "ArrowDown", shiftKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["outside", "ink", "color"]);
    expect(folder.getAttribute("aria-expanded")).toBe("false");
  });

  it("selects collapsed folder contents with Select All and keyboard ranges", () => {
    const onSelectionChange = vi.fn();
    const group = { ...createLayerGroup("character", "캐릭터"), collapsed: true };
    render(
      <StudioLayerNavigator
        items={[
          { id: "ink", type: "draw", label: "선화", zIndex: 2, groupId: group.id },
          { id: "color", type: "image", label: "채색", zIndex: 1, groupId: group.id },
          { id: "back", type: "image", label: "배경", zIndex: 0 },
        ]}
        groups={[group]} selectedIds={[]} pageKey="collapsed"
        localHiddenIds={new Set()} onToggleLocalHidden={() => {}}
        onSelectionChange={onSelectionChange} onAction={() => {}}
      />,
    );
    const folder = row(/캐릭터, 그룹/);
    fireEvent.keyDown(folder, { key: "a", ctrlKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["ink", "color", "back"]);
    fireEvent.keyDown(folder, { key: "ArrowDown", shiftKey: true });
    expect(onSelectionChange).toHaveBeenLastCalledWith(["ink", "color", "back"]);
    expect(document.activeElement).toBe(row(/배경/));
    expect(folder.getAttribute("aria-expanded")).toBe("false");
  });

  it("exposes frame-folder bind when the active layer is a frame with extra selection", () => {
    const frameItems: StudioLayerNavigatorItem[] = [
      { id: "frame-1", type: "frame", label: "1컷", zIndex: 0 },
      { id: "ink", type: "draw", label: "선화", zIndex: 1 },
    ];
    render(
      <StudioLayerNavigator
        items={frameItems}
        groups={[]}
        selectedIds={["frame-1", "ink"]}
        pageKey="page-frame-folder"
        localHiddenIds={new Set()}
        onToggleLocalHidden={() => {}}
        onSelectionChange={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "1컷 레이어 작업" }));
    expect(screen.getByRole("button", { name: /컷 폴더로 묶기/ })).toBeTruthy();
  });

  it("exposes CSP layer solo in the per-layer action panel and toggles aria-pressed", () => {
    function SoloHarness() {
      const [soloLayerId, setSoloLayerId] = useState<string | null>(null);
      return (
        <StudioLayerNavigator
          items={ITEMS}
          groups={[]}
          selectedIds={["front"]}
          pageKey="page-solo"
          localHiddenIds={new Set()}
          onToggleLocalHidden={() => {}}
          soloLayerId={soloLayerId}
          onToggleLayerSolo={(id) => {
            setSoloLayerId((current) => (current === id ? null : id));
          }}
          onSelectionChange={() => {}}
          onAction={() => {}}
        />
      );
    }

    render(<SoloHarness />);

    fireEvent.click(screen.getByRole("button", { name: "주인공 대사 레이어 작업" }));
    const solo = screen.getByRole("button", { name: /솔로/ });
    expect(solo.getAttribute("aria-pressed")).toBe("false");
    expect(solo.getAttribute("title")).toContain("협업 문서에는 반영되지 않");

    fireEvent.click(solo);
    const active = screen.getByRole("button", { name: /솔로 해제/ });
    expect(active.getAttribute("aria-pressed")).toBe("true");
    expect(active.className).toContain("border-accent/40");
  });
});
