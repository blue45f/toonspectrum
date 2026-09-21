// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ko from "../apps/web/public/i18n/studio/background/ko.json";
import {
  defaultStudioAppSettings,
  showStudioRailTool,
  STUDIO_RAIL_TOOL_CATALOG,
} from "../apps/web/src/domains/creator/studio-app-settings";
import { studioDrawingVisibleTools } from "../apps/web/src/domains/creator/studio-drawing-core-tools";
import { resetStudioFloatingSurfaceStackForTest } from "../apps/web/src/domains/creator/studio-floating-surface-stack";
import { subscribeStudioHelpHub } from "../apps/web/src/domains/creator/studio-help-hub-channel";
import { buildStudioHelpGroupItems } from "../apps/web/src/domains/creator/studio-help-menu-items";
import { buildStudioViewSurfaceMenuItems } from "../apps/web/src/domains/creator/studio-main-menu-items-authoring";
import { buildStudioBrushMenuItems } from "../apps/web/src/domains/creator/studio-main-menu-items-brush";
import { localizeStudioRailToolLabel } from "../apps/web/src/domains/creator/studio-rail-tool-localization";
import { StudioShellFloatingLayoutManager } from "../apps/web/src/domains/creator/studio-shell/StudioShellFloatingLayoutManager";
import { StudioShellFloatingLayoutProvider } from "../apps/web/src/domains/creator/studio-shell/StudioShellFloatingLayoutProvider";
import { resetStudioStrokeFocusActivityForTests, setStudioStrokeFocusActivity } from "../apps/web/src/domains/creator/studio-stroke-focus-activity";
import { createStudioUiPreferencesRepository } from "../apps/web/src/domains/creator/studio-ui-preferences-sqlite";
import { StudioBackgroundPanel } from "../apps/web/src/domains/creator/StudioBackgroundPanel";

import {
  CATALOGUE_GROUPS,
  DESKTOP_FLOATING_LAYOUT_DIALOG,
  FIRST_RUN_RAIL_TOOL_IDS,
  MENU_DRIVEN_POPOVERS,
  menuItemRowHasExactLabel,
  OPTIONAL_RAIL_TOOLS,
} from "./verify-studio-menus.mts";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditorActions,
  StudioMainMenuUiActions,
} from "../apps/web/src/domains/creator/studio-main-menu-contract";

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => (ko as Record<string, string>)[key] ?? key,
}));

afterEach(() => {
  cleanup();
  resetStudioFloatingSurfaceStackForTest();
  resetStudioStrokeFocusActivityForTests();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("production menu verifier follows shipped feature entry points", () => {
  it("preserves eight stored defaults and verifies ten rendered tools plus More additions", () => {
    let visibleIds = defaultStudioAppSettings().toolbar.visibleIds;
    expect(visibleIds).toHaveLength(8);
    expect(studioDrawingVisibleTools(visibleIds)).toEqual(FIRST_RUN_RAIL_TOOL_IDS);
    expect(FIRST_RUN_RAIL_TOOL_IDS).toHaveLength(10);
    expect(visibleIds).not.toContain("eyedropper");
    expect(visibleIds).not.toContain("bubble");
    expect(OPTIONAL_RAIL_TOOLS.map(({ id }) => id)).toEqual([
      "eyedropper", "bubble", "smart-shape", "shape-rect", "shape-ellipse", "reference",
    ]);
    for (const { id, moreLabel } of OPTIONAL_RAIL_TOOLS) {
      expect(STUDIO_RAIL_TOOL_CATALOG.find((tool) => tool.id === id)?.label).toBe(moreLabel);
      const previous = visibleIds;
      visibleIds = showStudioRailTool(visibleIds, id);
      expect(visibleIds).toEqual(expect.arrayContaining([...previous, id]));
      expect(new Set(visibleIds).size).toBe(visibleIds.length);
    }
    expect(visibleIds).toHaveLength(13);
    expect(studioDrawingVisibleTools(visibleIds)).toHaveLength(15);
    expect(studioDrawingVisibleTools(visibleIds)).toEqual(expect.arrayContaining([...FIRST_RUN_RAIL_TOOL_IDS]));
  });

  it("uses catalogue picker names and the actual localized shortcut-bearing rail names", () => {
    for (const [id, authoredLabel] of [
      ["eyedropper", "스포이드 (I / Alt+클릭)"], ["bubble", "말풍선 추가"],
    ] as const) {
      const requirement = OPTIONAL_RAIL_TOOLS.find((tool) => tool.id === id)!;
      expect(localizeStudioRailToolLabel({
        toolId: id, authoredLabel, lang: "ko",
        t: (key) => STUDIO_RAIL_TOOL_CATALOG.find((tool) => tool.labelKey === key)?.label ?? key,
      })).toBe(requirement.railLabel);
    }
  });

  it("opens the real desktop floating manager from the menu and closes its named window", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(min-width: 1024px)", media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    }));
    render(createElement(StudioShellFloatingLayoutProvider, null,
      createElement("div", { "data-studio-draw-options-dock": "true" }),
      createElement(StudioShellFloatingLayoutManager),
    ));
    const menuAction = buildStudioViewSurfaceMenuItems({
      state: {} as StudioMainMenuBuilderState,
      editor: {} as StudioMainMenuEditorActions,
      ui: {} as StudioMainMenuUiActions,
    }).find((item) => item.commandId === "view.floating-layout")!;
    act(() => menuAction.onSelect());
    const dialog = await screen.findByRole("dialog", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.name, exact: true });
    expect(screen.queryByRole("dialog", { name: "보기 및 플로팅 UI 설정", exact: true })).toBeNull();
    expect(within(dialog).getByRole("heading", { name: "플로팅 UI 작업공간", exact: true })).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("switch", { name: "그리기 옵션 숨기기", exact: true }));
    expect(await within(dialog).findByRole("switch", { name: "그리기 옵션 표시하기", exact: true })).toBeTruthy();
    const autoHide = within(dialog).getByRole("switch", { name: /펜으로 그리는 동안 자동 숨김/u });
    if (autoHide.getAttribute("aria-checked") !== "true") fireEvent.click(autoHide);
    expect(autoHide.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("button", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.closeLabel, exact: true }));
    expect(screen.queryByRole("dialog", { name: DESKTOP_FLOATING_LAYOUT_DIALOG.name, exact: true })).toBeNull();
    const launcher = screen.getByRole("button", { name: /보기 설정/u });
    const launcherRoot = launcher.closest('[data-studio-shell-view-options="true"]')!;
    act(() => setStudioStrokeFocusActivity("canvas-stroke", true));
    expect(launcherRoot.hasAttribute("inert")).toBe(true);
    expect(launcherRoot.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button", { name: /보기 설정/u })).toBeNull();
    act(() => resetStudioStrokeFocusActivityForTests());
    expect(launcherRoot.hasAttribute("inert")).toBe(false);
    expect(launcherRoot.hasAttribute("aria-hidden")).toBe(false);
    expect(screen.getByRole("button", { name: /보기 설정/u })).toBe(launcher);
  });

  it("matches a direct menu-row label exactly without confusing shortcut or prefix text", () => {
    expect(menuItemRowHasExactLabel("AI 어시스트", "AI 어시스트")).toBe(true);
    expect(menuItemRowHasExactLabel("초안 저장\n⌘S", "초안 저장")).toBe(true);
    expect(menuItemRowHasExactLabel("게시 패키지…", "게시")).toBe(false);
    expect(menuItemRowHasExactLabel("슬롯 3: 초안 저장", "초안 저장")).toBe(false);
  });
  it("requires the current stroke label and preserves the same correction action", () => {
    const correctCurrentStroke = vi.fn();
    const item = buildStudioBrushMenuItems({
      state: { pixelArtEnabled: false } as StudioMainMenuBuilderState,
      editor: {} as StudioMainMenuEditorActions,
      ui: { correctCurrentStroke } as StudioMainMenuUiActions,
    }).find((candidate) => candidate.commandId === "brush.correct-current-stroke");
    expect(item).toBeDefined();
    expect(CATALOGUE_GROUPS.find((group) => group.id === "brush")?.items).toContain(item!.label);
    expect(item!.disabled).toBe(false);
    item!.onSelect();
    expect(correctCurrentStroke).toHaveBeenCalledOnce();
  });

  it("requires the renamed help home and retains the tutorial journey inside that hub", () => {
    const openFeatureTutorial = vi.fn();
    const requests: Parameters<Parameters<typeof subscribeStudioHelpHub>[0]>[0][] = [];
    const unsubscribe = subscribeStudioHelpHub((request) => requests.push(request));
    try {
      const item = buildStudioHelpGroupItems({
        state: { activeToolCommandId: "tool.pen" } as StudioMainMenuBuilderState,
        editor: { openFeatureTutorial } as StudioMainMenuEditorActions,
        ui: { openShortcuts: vi.fn() } as StudioMainMenuUiActions,
        helpGroupLabel: "도움말",
      }).find((candidate) => candidate.commandId === "help.feature-tutorials");
      expect(item).toBeDefined();
      expect(CATALOGUE_GROUPS.find((group) => group.id === "help")?.items).toContain(item!.label);
      item!.onSelect();
      expect(requests).toHaveLength(1);
      requests[0]!.actions?.openFeatureTutorial?.();
      expect(openFeatureTutorial).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it("matches background content inside the actual editor whose preset still applies", async () => {
    const openStudioMenu = vi.fn();
    buildStudioBrushMenuItems({
      state: {} as StudioMainMenuBuilderState,
      editor: {} as StudioMainMenuEditorActions,
      ui: { openStudioMenu } as StudioMainMenuUiActions,
    }).find((item) => item.commandId === "brush.background-tone")!.onSelect();
    expect(openStudioMenu).toHaveBeenCalledWith("bgFill");

    const entry = MENU_DRIVEN_POPOVERS.find((candidate) => candidate.item === "배경 · 톤")!;
    expect(entry.contentSelector).toBe('[data-studio-background-panel="true"]');
    const repository = createStudioUiPreferencesRepository({
      get: async () => null, set: async () => {}, delete: async () => {},
    });
    const onApply = vi.fn();
    const { container } = render(createElement(StudioBackgroundPanel, {
      canvasW: 720, canvasH: 1080, currentBg: "#ffffff", onApply,
      acquireUiPreferences: async () => repository,
    }));
    const panel = container.querySelector<HTMLElement>(entry.contentSelector!);
    expect(panel).not.toBeNull();
    for (const marker of entry.expectVisible) {
      expect(within(panel!).getByText(marker, { exact: true }).isConnected).toBe(true);
    }
    const preset = panel!.querySelector<HTMLButtonElement>('[data-studio-bg-preset="s-white"]');
    expect(preset).not.toBeNull();
    fireEvent.click(preset!);
    expect(onApply).toHaveBeenCalledWith({ kind: "solid", color: "#ffffff", presetId: "s-white" });
  });

  it("pins the eight saved defaults independently of rendered core tools", () => {
    expect(defaultStudioAppSettings().toolbar.visibleIds).toEqual([
      "select", "pen", "eraser", "fill", "marquee-rect", "smart-shape", "text", "image",
    ]);
  });
});
