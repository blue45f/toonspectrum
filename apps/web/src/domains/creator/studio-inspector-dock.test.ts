// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE,
  STUDIO_INSPECTOR_DOCK_STORAGE_KEY,
  getStudioInspectorDockSide,
  loadStudioInspectorDockSide,
  normalizeStudioInspectorDockSide,
  resetStudioInspectorDockSide,
  resetStudioInspectorDockStoreForTests,
  saveStudioInspectorDockSide,
  setStudioInspectorDockSide,
  subscribeStudioInspectorDockSide,
} from "./studio-inspector-dock";

beforeEach(() => {
  resetStudioInspectorDockStoreForTests();
  localStorage.clear();
});

afterEach(() => {
  resetStudioInspectorDockStoreForTests();
});

describe("studio inspector dock side", () => {
  it("defaults to the right dock and only accepts left as the alternative", () => {
    expect(DEFAULT_STUDIO_INSPECTOR_DOCK_SIDE).toBe("right");
    expect(normalizeStudioInspectorDockSide("left")).toBe("left");
    expect(normalizeStudioInspectorDockSide("right")).toBe("right");
    expect(normalizeStudioInspectorDockSide("top")).toBe("right");
    expect(normalizeStudioInspectorDockSide(null)).toBe("right");
    expect(normalizeStudioInspectorDockSide(undefined)).toBe("right");
  });

  it("loads, saves and fails closed when storage is unavailable", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(loadStudioInspectorDockSide(storage)).toBe("right");
    expect(saveStudioInspectorDockSide(storage, "left")).toBe(true);
    expect(values.get(STUDIO_INSPECTOR_DOCK_STORAGE_KEY)).toBe("left");
    expect(loadStudioInspectorDockSide(storage)).toBe("left");

    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadStudioInspectorDockSide(blocked)).toBe("right");
    expect(saveStudioInspectorDockSide(blocked, "left")).toBe(false);
    expect(loadStudioInspectorDockSide(null)).toBe("right");
  });

  it("publishes one reactive snapshot and persists the choice", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioInspectorDockSide(listener);

    expect(getStudioInspectorDockSide()).toBe("right");
    setStudioInspectorDockSide("left");
    expect(getStudioInspectorDockSide()).toBe("left");
    expect(localStorage.getItem(STUDIO_INSPECTOR_DOCK_STORAGE_KEY)).toBe("left");
    expect(listener).toHaveBeenCalledTimes(1);

    // 같은 값을 다시 설정하면 발행하지 않는다.
    setStudioInspectorDockSide("left");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("follows storage events from another tab and resets to the default", () => {
    setStudioInspectorDockSide("left");
    expect(getStudioInspectorDockSide()).toBe("left");

    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(getStudioInspectorDockSide()).toBe("right");

    setStudioInspectorDockSide("left");
    expect(resetStudioInspectorDockSide()).toBe("right");
    expect(getStudioInspectorDockSide()).toBe("right");
    expect(localStorage.getItem(STUDIO_INSPECTOR_DOCK_STORAGE_KEY)).toBeNull();
  });
});
