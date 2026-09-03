// @vitest-environment jsdom

/**
 * Menubar interaction contract measured in a real browser against the shipped build:
 * clicking a neighbouring title while a menu is open switched nothing (hover opened the
 * menu, then the click's own toggle closed it), Tab from inside an open panel dropped
 * focus on BODY while leaving the panel open, and the bar exposed 18 tab stops with no
 * menubar semantics. Each test below fails without the corresponding fix.
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
    </StudioToolHintPreferencesProvider>
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

    // A real click carries the cursor over the title first, so hover switching has already
    // opened the target menu by the time the click lands.
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

    // Pointer left both the title and its panel: the next click is an ordinary toggle.
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
    expect(triggers.every((el) => el.getAttribute("aria-haspopup") === "menu")).toBe(true);
    expect(triggers.filter((el) => el.tabIndex === 0)).toHaveLength(1);
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
        within(menubar).getAllByRole("menuitem").filter((el) => el.tabIndex === 0)
      ).toHaveLength(1);
      fireEvent.keyDown(active!, { key: "ArrowRight" });
    }

    expect(new Set(visited).size).toBe(18);
    expect(visited[0]).toBe("group-0");
    expect(visited.at(-1)).toBe("group-17");
  });
});

/**
 * A composite title (삽입 · 도구) concatenates several catalogue groups into one
 * dropdown and captions each section with the group it came from. The caption used
 * to render `aria-hidden`, so a screen-reader user heard ~15 flat rows under 도구
 * with no sign that 팀 · 공유 권한 came from 협업. The sections are now `role="group"`
 * wrappers labelled by that same visible caption.
 */
describe("StudioMainMenu composite dropdown sections", () => {
  const CATALOGUE: readonly StudioMainMenuGroup[] = [
    // 파일 is passed through by the presentation, not absorbed: it is the control
    // that proves the wrappers belong to composite titles and not to every menu.
    {
      id: "file",
      label: "파일",
      items: [
        { id: "save", label: "초안 저장", onSelect: vi.fn() },
        { id: "export", label: "내보내기…", onSelect: vi.fn() },
      ],
    },
    {
      id: "canvas",
      label: "캔버스",
      items: [
        { id: "canvas-size", label: "캔버스 크기…", onSelect: vi.fn() },
        { id: "canvas-rotate", label: "캔버스 회전", onSelect: vi.fn() },
      ],
    },
    {
      id: "animation",
      label: "애니메이션",
      items: [{ id: "frames", label: "프레임 애니메이션", onSelect: vi.fn() }],
    },
    {
      id: "collaboration",
      label: "협업",
      items: [{ id: "share", label: "팀 · 공유 권한…", onSelect: vi.fn() }],
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
    const tools = presentedGroups().find((group) => group.id === "tools");
    expect(tools?.label).toBe("도구");
    expect(tools?.items).toHaveLength(4);
    return openPanel("도구");
  }

  /**
   * Section wrappers only — `getAllByRole("group")` would also collect any hint
   * wrapper that takes `role="group"` when its row is unavailable, so scoping by
   * the wrapper attribute keeps the assertion about sections. The role itself is
   * still asserted below rather than assumed.
   */
  function sectionWrappers(panel: HTMLElement): HTMLElement[] {
    return Array.from(
      panel.querySelectorAll<HTMLElement>("[data-studio-main-menu-section-group]"),
    );
  }

  it("names each absorbed catalogue group as a labelled group inside the menu", () => {
    const panel = renderComposite();

    const sections = sectionWrappers(panel);
    expect(sections.map((section) => section.getAttribute("data-studio-main-menu-section-group")))
      .toEqual(["캔버스", "애니메이션", "협업"]);
    expect(sections.map((section) => section.getAttribute("role"))).toEqual([
      "group",
      "group",
      "group",
    ]);

    // The caption is the accessible name, so the grouping survives even if the
    // visible copy is localized later.
    expect(
      within(panel)
        .getByRole("group", { name: "협업" })
        .contains(screen.getByRole("menuitem", { name: "팀 · 공유 권한…" })),
    ).toBe(true);
    expect(
      within(panel)
        .getByRole("group", { name: "애니메이션" })
        .contains(screen.getByRole("menuitem", { name: "프레임 애니메이션" })),
    ).toBe(true);
  });

  it("keeps the section caption in the accessibility tree", () => {
    const panel = renderComposite();

    const captions = panel.querySelectorAll("[data-studio-main-menu-section]");
    expect(captions).toHaveLength(3);
    for (const caption of captions) {
      expect(caption.getAttribute("aria-hidden")).toBeNull();
      expect(caption.id).not.toBe("");
      expect(caption.closest("[role='group']")?.getAttribute("aria-labelledby")).toBe(caption.id);
    }
  });

  it("keeps every row a flat menuitem that arrow keys still walk across sections", () => {
    const panel = renderComposite();

    const items = within(panel).getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("data-studio-menu-item-id"))).toEqual([
      "canvas-size",
      "canvas-rotate",
      "frames",
      "share",
    ]);
    // The group wrappers must not renumber the roving index the panel navigates by.
    expect(items.map((item) => item.getAttribute("data-studio-main-menu-item-index"))).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);

    items[0]!.focus();
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    // Third row opens the 애니메이션 section: arrows cross the wrapper boundary.
    expect(document.activeElement).toBe(items[2]);

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(items[3]);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("wraps nothing in a non-composite dropdown, whose rows have no source group", () => {
    const panel = openPanel("파일");

    // 파일 absorbed nobody, so there is no source group to name: wrapping its rows
    // in a labelled group would invent a section a screen reader would then announce.
    expect(sectionWrappers(panel)).toHaveLength(0);
    expect(panel.querySelectorAll("[data-studio-main-menu-section]")).toHaveLength(0);
    expect(within(panel).queryAllByRole("group")).toHaveLength(0);
    expect(
      within(panel)
        .getAllByRole("menuitem")
        .map((item) => item.getAttribute("data-studio-menu-item-id")),
    ).toEqual(["save", "export"]);
  });
});
