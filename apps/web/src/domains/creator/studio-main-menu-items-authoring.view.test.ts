import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import { buildStudioViewSurfaceMenuItems } from "./studio-main-menu-items-authoring";
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
});
