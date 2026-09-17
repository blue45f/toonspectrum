import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import {
  STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT,
  buildStudioViewSurfaceMenuItems,
} from "./studio-main-menu-items-authoring";
import {
  getStudioViewInspectionSnapshot,
  resetStudioViewInspectionStateForTests,
} from "./studio-view-inspection-store";

describe("studio view surface menu", () => {
  beforeEach(() => {
    resetStudioViewInspectionStateForTests();
  });

  it("opens the existing navigator and the professional inspection companion", () => {
    const openCanvasNavigator = vi.fn();
    const context = {
      ui: {
        openCanvasNavigator,
        openStudioMenu: vi.fn(),
      },
    } as unknown as StudioMainMenuItemContext;
    const navigatorItem = buildStudioViewSurfaceMenuItems(context).find(
      (item) => item.id === "navigator"
    );

    expect(navigatorItem).toBeDefined();
    navigatorItem?.onSelect();

    expect(openCanvasNavigator).toHaveBeenCalledOnce();
    expect(getStudioViewInspectionSnapshot().panelOpen).toBe(true);
  });
  it("opens floating layout settings from the existing View menu", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const opened = vi.fn();
    target.addEventListener(STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT, opened, { once: true });
    const item = buildStudioViewSurfaceMenuItems({
      ui: {},
    } as unknown as StudioMainMenuItemContext).find(
      (candidate) => candidate.id === "floating-layout",
    );

    expect(item?.label).toBe("플로팅 UI · 배치 설정…");
    item?.onSelect();

    expect(opened).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

});
