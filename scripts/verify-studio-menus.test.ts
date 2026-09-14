// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ko from "../apps/web/public/i18n/studio/background/ko.json";
import { subscribeStudioHelpHub } from "../apps/web/src/domains/creator/studio-help-hub-channel";
import { buildStudioHelpGroupItems } from "../apps/web/src/domains/creator/studio-help-menu-items";
import { buildStudioBrushMenuItems } from "../apps/web/src/domains/creator/studio-main-menu-items-brush";
import { createStudioUiPreferencesRepository } from "../apps/web/src/domains/creator/studio-ui-preferences-sqlite";
import { StudioBackgroundPanel } from "../apps/web/src/domains/creator/StudioBackgroundPanel";

import { CATALOGUE_GROUPS, MENU_DRIVEN_POPOVERS } from "./verify-studio-menus.mts";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditorActions,
  StudioMainMenuUiActions,
} from "../apps/web/src/domains/creator/studio-main-menu-contract";

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => (ko as Record<string, string>)[key] ?? key,
}));

afterEach(() => cleanup());

describe("production menu verifier follows shipped feature entry points", () => {
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
});
