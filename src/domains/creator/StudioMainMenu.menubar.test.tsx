// @vitest-environment jsdom

/**
 * Menubar interaction contract:
 * - one WAI-ARIA menubar tab stop;
 * - desktop hover/click switching without accidental close;
 * - portalled menus return focus predictably;
 * - workflow composites expose labelled source sections while arrow navigation
 *   remains flat across those sections.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioMainMenuPresentation } from "./studio-main-menu-presentation";
import { StudioMainMenu } from "./StudioMainMenu";
import { StudioToolHintPreferencesProvider } from "./StudioToolHint";

import type { StudioMainMenuGroup } from "./studio-main-menu-model";

const GROUPS: readonly StudioMainMenuGroup[] = [
  {
    id: "file",
    label: "파일",
    items: [{ id: "save", label: "초안 저장", onSelect: vi.fn() }],
  },
  {
    id: "edit",
    label: "편집",
    items: [{ id: "undo", label: "실행취소", onSelect: vi.fn() }],
  },
  {
    id: "view",
    label: "보기",
    items: [{ id: "zoom-in", label: "확대", onSelect: vi.fn() }],
  },
];

function renderMenu(groups: readonly StudioMainMenuGroup[] = GROUPS) {
  return render(
    <StudioToolHintPreferencesProvider mode="off" touchHoldDelayMs={640} reduceMotion>
      <StudioMainMenu groups={groups} />
    </StudioToolHintPreferencesProvider>,
  );
}

function trigger(label: string): HTMLElement {
  return screen.getByRole("menuitem", { name: label });
}

function openPanelLabels(): string[] {
  return screen
    .queryAllByRole("menu")
    .map((panel) => panel.getAttribute("aria-label") ?? "");
}

afterEach(() => {
  cleanup();
});

describe("StudioMainMenu menubar interaction", () => {
  it("switches to a neighbouring menu when its title is clicked while another menu is open", () => {
    renderMenu();

    fireEvent.click(trigger("파일"));
    expect(openPanelLabels()).toEqual(["파일"]);

    fireEvent.mouseEnter(trigger("편집"));
    expect(openPanelLabels()).toEqual(["편집"]);
    fireEvent.click(trigger("편집"));
    expect(openPanelLabels()).toEqual(["편집"]);

    fireEvent.mouseEnter(trigger("보기"));
    fireEvent.click(trigger("보기"));
    expect(openPanelLabels()).toEqual(["보기"]);
  });

  it("still toggles a menu closed when its own title is clicked twice", () => {
    renderMenu();

    fireEvent.click(trigger("파일"));
    expect(openPanelLabels()).toEqual(["파일"]);
    fireEvent.click(trigger("파일"));
    expect(openPanelLabels()).toEqual([]);
  });

  it("closes a hover-revealed menu once the pointer has left and come back to click it", () => {
    renderMenu();

    fireEvent.click(trigger("파일"));
    fireEvent.mouseEnter(trigger("편집"));
    expect(openPanelLabels()).toEqual(["편집"]);

    fireEvent.mouseLeave(trigger("편집"), { clientX: 999, clientY: 999 });
    fireEvent.click(trigger("편집"));
    expect(openPanelLabels()).toEqual([]);
  });

  it("dismisses the menu and returns focus to its title when Tab is pressed inside a panel", () => {
    renderMenu();

    const file = trigger("파일");
    fireEvent.focus(file);
    fireEvent.keyDown(file, { key: "ArrowDown" });
    const save = screen.getByRole("menuitem", { name: "초안 저장" });
    expect(document.activeElement).toBe(save);

    fireEvent.keyDown(save, { key: "Tab" });
    expect(openPanelLabels()).toEqual([]);
    expect(document.activeElement).toBe(file);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("does not leave a panel open when Tab moves focus off an open title", () => {
    renderMenu();

    const file = trigger("파일");
    fireEvent.click(file);
    expect(openPanelLabels()).toEqual(["파일"]);

    fireEvent.keyDown(file, { key: "Tab" });
    expect(openPanelLabels()).toEqual([]);
  });

  it("exposes WAI-ARIA menubar semantics with exactly one roving tab stop", () => {
    const manyGroups = Array.from({ length: 18 }, (_, index) => ({
      id: `group-${index}`,
      label: `그룹 ${index}`,
      items: [{ id: `item-${index}`, label: `항목 ${index}`, onSelect: vi.fn() }],
    }));
    renderMenu(manyGroups);

    const menubar = screen.getByRole("menubar");
    const triggers = within(menubar).getAllByRole("menuitem");
    expect(triggers).toHaveLength(18);
    expect(
      triggers.every((element) => element.getAttribute("aria-haspopup") === "menu"),
    ).toBe(true);
    expect(triggers.filter((element) => element.tabIndex === 0)).toHaveLength(1);
    expect(triggers[0]?.tabIndex).toBe(0);
  });

  it("moves the single tab stop with ArrowRight so every group stays reachable", () => {
    const manyGroups = Array.from({ length: 18 }, (_, index) => ({
      id: `group-${index}`,
      label: `그룹 ${index}`,
      items: [{ id: `item-${index}`, label: `항목 ${index}`, onSelect: vi.fn() }],
    }));
    renderMenu(manyGroups);

    const menubar = screen.getByRole("menubar");
    const triggers = within(menubar).getAllByRole("menuitem");
    const visited: string[] = [];

    triggers[0]!.focus();
    for (let step = 0; step < triggers.length; step += 1) {
      const active = document.activeElement as HTMLElement | null;
      visited.push(active?.getAttribute("data-studio-main-menu-trigger") ?? "");
      expect(active?.tabIndex).toBe(0);
      expect(
        within(menubar)
          .getAllByRole("menuitem")
          .filter((element) => element.tabIndex === 0),
      ).toHaveLength(1);
      fireEvent.keyDown(active!, { key: "ArrowRight" });
    }

    expect(new Set(visited).size).toBe(18);
    expect(visited[0]).toBe("group-0");
    expect(visited.at(-1)).toBe("group-17");
  });
});

/**
 * Workflow composites concatenate canonical catalogue groups into one dropdown.
 * Every source keeps a visible, accessible section caption, while all command rows
 * remain one roving menuitem sequence.
 */
describe("StudioMainMenu workflow composite sections", () => {
  const CATALOGUE: readonly StudioMainMenuGroup[] = [
    {
      id: "view",
      label: "보기",
      items: [
        { id: "zoom-in", label: "확대", onSelect: vi.fn() },
        { id: "fit", label: "화면 맞춤", onSelect: vi.fn() },
      ],
    },
    {
      id: "canvas",
      label: "캔버스",
      items: [
        { id: "canvas-size", label: "캔버스 크기…", onSelect: vi.fn() },
        { id: "grid", label: "그리드", onSelect: vi.fn() },
      ],
    },
    {
      id: "window",
      label: "창",
      items: [{ id: "reference", label: "참고 이미지 창", onSelect: vi.fn() }],
    },
    {
      id: "layer",
      label: "레이어",
      items: [
        { id: "image", label: "이미지…", onSelect: vi.fn() },
        { id: "mask", label: "레이어 마스크", onSelect: vi.fn() },
      ],
    },
  ];

  function presentedGroups(): readonly StudioMainMenuGroup[] {
    return createStudioMainMenuPresentation(CATALOGUE).groups;
  }

  function openPanel(title: string): HTMLElement {
    renderMenu(presentedGroups());
    fireEvent.click(trigger(title));
    return screen.getByRole("menu", { name: title });
  }

  function renderComposite(): HTMLElement {
    const view = presentedGroups().find((group) => group.id === "view");
    expect(view?.label).toBe("보기");
    expect(view?.items).toHaveLength(5);
    return openPanel("보기");
  }

  function sectionWrappers(panel: HTMLElement): HTMLElement[] {
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        "[data-studio-main-menu-section-group]",
      ),
    );
  }

  it("names each absorbed catalogue group as a labelled group inside the menu", () => {
    const panel = renderComposite();

    const sections = sectionWrappers(panel);
    expect(
      sections.map((section) =>
        section.getAttribute("data-studio-main-menu-section-group"),
      ),
    ).toEqual(["보기", "캔버스", "창"]);
    expect(sections.map((section) => section.getAttribute("role"))).toEqual([
      "group",
      "group",
      "group",
    ]);

    expect(
      within(panel)
        .getByRole("group", { name: "캔버스" })
        .contains(screen.getByRole("menuitem", { name: "캔버스 크기…" })),
    ).toBe(true);
    expect(
      within(panel)
        .getByRole("group", { name: "창" })
        .contains(screen.getByRole("menuitem", { name: "참고 이미지 창" })),
    ).toBe(true);
  });

  it("keeps every section caption in the accessibility tree", () => {
    const panel = renderComposite();

    const captions = panel.querySelectorAll("[data-studio-main-menu-section]");
    expect(captions).toHaveLength(3);
    for (const caption of captions) {
      expect(caption.getAttribute("aria-hidden")).toBeNull();
      expect(caption.id).not.toBe("");
      expect(
        caption
          .closest("[role='group']")
          ?.getAttribute("aria-labelledby"),
      ).toBe(caption.id);
    }
  });

  it("keeps every row a flat menuitem that arrow keys walk across sections", () => {
    const panel = renderComposite();

    const items = within(panel).getAllByRole("menuitem");
    expect(
      items.map((item) => item.getAttribute("data-studio-menu-item-id")),
    ).toEqual(["zoom-in", "fit", "canvas-size", "grid", "reference"]);
    expect(
      items.map((item) =>
        item.getAttribute("data-studio-main-menu-item-index"),
      ),
    ).toEqual(["0", "1", "2", "3", "4"]);

    items[0]!.focus();
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[2]);

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(items[4]);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("wraps no source sections in a standalone dropdown", () => {
    const panel = openPanel("레이어");

    expect(sectionWrappers(panel)).toHaveLength(0);
    expect(
      panel.querySelectorAll("[data-studio-main-menu-section]"),
    ).toHaveLength(0);
    expect(within(panel).queryAllByRole("group")).toHaveLength(0);
    expect(
      within(panel)
        .getAllByRole("menuitem")
        .map((item) => item.getAttribute("data-studio-menu-item-id")),
    ).toEqual(["image", "mask"]);
  });
});
