import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  closeStudioViewInspectionPanel,
  getStudioViewInspectionSnapshot,
  openStudioViewInspectionPanel,
  resetStudioViewInspectionStateForTests,
  subscribeStudioViewInspection,
  toggleStudioPerformanceHud,
  toggleStudioPixelPreview,
} from "./studio-view-inspection-store";

describe("studio view inspection store", () => {
  beforeEach(() => {
    resetStudioViewInspectionStateForTests();
  });

  it("opens and closes the companion panel without enabling diagnostics", () => {
    openStudioViewInspectionPanel();
    expect(getStudioViewInspectionSnapshot()).toEqual({
      panelOpen: true,
      pixelPreviewEnabled: false,
      performanceHudEnabled: false,
    });

    closeStudioViewInspectionPanel();
    expect(getStudioViewInspectionSnapshot().panelOpen).toBe(false);
  });

  it("keeps pixel and performance switches independent from panel visibility", () => {
    toggleStudioPixelPreview();
    toggleStudioPerformanceHud();
    closeStudioViewInspectionPanel();

    expect(getStudioViewInspectionSnapshot()).toEqual({
      panelOpen: false,
      pixelPreviewEnabled: true,
      performanceHudEnabled: true,
    });
  });

  it("notifies subscribers once per actual state transition", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioViewInspection(listener);

    openStudioViewInspectionPanel();
    openStudioViewInspectionPanel();
    toggleStudioPixelPreview();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    toggleStudioPerformanceHud();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("publishes immutable snapshots", () => {
    const before = getStudioViewInspectionSnapshot();
    expect(Object.isFrozen(before)).toBe(true);

    toggleStudioPixelPreview();
    const after = getStudioViewInspectionSnapshot();
    expect(after).not.toBe(before);
    expect(Object.isFrozen(after)).toBe(true);
  });
});
