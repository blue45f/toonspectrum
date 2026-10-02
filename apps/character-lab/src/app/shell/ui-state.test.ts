import { describe, expect, it } from "vitest";

import { DEFAULT_UI_STATE, INSPECTOR_TAB_IDS, INSPECTOR_TAB_LABELS_KO, createUiStateStore, isInspectorTabId } from "./ui-state";

describe("app/shell/ui-state", () => {
  it("탭 9개가 한글 라벨을 가진다", () => {
    expect(INSPECTOR_TAB_IDS).toHaveLength(9);
    for (const id of INSPECTOR_TAB_IDS) expect(INSPECTOR_TAB_LABELS_KO[id]).toMatch(/[가-힣]/u);
    expect(isInspectorTabId("param")).toBe(true);
    expect(isInspectorTabId("nope")).toBe(false);
  });

  it("값이 바뀔 때만 구독자에게 알린다", () => {
    const store = createUiStateStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    expect(store.getState()).toEqual(DEFAULT_UI_STATE);
    store.setActiveSlot("face-shape");
    expect(calls).toBe(0);
    store.setActiveSlot("hair");
    store.setInspectorTab("pose");
    store.setDrawingMode(true);
    expect(calls).toBe(3);
    expect(store.getState()).toEqual({ activeSlot: "hair", inspectorTab: "pose", drawingMode: true });
    unsubscribe();
    store.setDrawingMode(false);
    expect(calls).toBe(3);
  });
});
