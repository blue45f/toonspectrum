import { describe, expect, it, vi } from "vitest";

import {
  studioHelpHubListenerCount,
  subscribeStudioHelpHub,
} from "./studio-help-hub-channel";
import { buildStudioHelpGroupItems } from "./studio-help-menu-items";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditorActions,
  StudioMainMenuUiActions,
} from "./studio-main-menu-contract";

function buildItems(input: {
  activeToolCommandId?: string | null;
  openFeatureTutorial?: () => unknown;
  openShortcuts?: () => unknown;
} = {}) {
  const editor = new Proxy(
    { openFeatureTutorial: input.openFeatureTutorial ?? vi.fn() } as StudioMainMenuEditorActions,
    { get: (target, property) => Reflect.get(target, property) ?? vi.fn() },
  );
  const ui = new Proxy(
    { openShortcuts: input.openShortcuts ?? vi.fn() } as StudioMainMenuUiActions,
    { get: (target, property) => Reflect.get(target, property) ?? vi.fn() },
  );
  const state = {
    activeToolCommandId: input.activeToolCommandId ?? "tool.pen",
  } as unknown as StudioMainMenuBuilderState;
  return buildStudioHelpGroupItems({ state, editor, ui, helpGroupLabel: "도움말" });
}

describe("Help menu task-oriented home", () => {
  it("upgrades the tutorial row without adding a duplicate catalog command", () => {
    const item = buildItems().find((candidate) => candidate.id === "feature-tutorials");
    expect(item?.commandId).toBe("help.feature-tutorials");
    expect(item?.label).toBe("도움말 홈 · 단계별 가이드");
    expect(item?.searchActivation).toBe("execute");
  });

  it("passes current tool context and existing tutorial/shortcut actions into the hub", () => {
    const openFeatureTutorial = vi.fn();
    const openShortcuts = vi.fn();
    const requests: Parameters<Parameters<typeof subscribeStudioHelpHub>[0]>[0][] = [];
    const unsubscribe = subscribeStudioHelpHub((request) => requests.push(request));
    expect(studioHelpHubListenerCount()).toBeGreaterThan(0);

    buildItems({ activeToolCommandId: "tool.wet-mix", openFeatureTutorial, openShortcuts })
      .find((item) => item.id === "feature-tutorials")
      ?.onSelect();
    unsubscribe();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.toolCommandId).toBe("tool.wet-mix");
    requests[0]?.actions?.openFeatureTutorial?.();
    requests[0]?.actions?.openShortcuts?.();
    expect(openFeatureTutorial).toHaveBeenCalledTimes(1);
    expect(openShortcuts).toHaveBeenCalledTimes(1);
  });
});
