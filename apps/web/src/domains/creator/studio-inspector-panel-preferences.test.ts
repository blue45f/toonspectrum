// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES,
  DEFAULT_STUDIO_INSPECTOR_PANEL_STATE,
  STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY,
  STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY,
  ensureStudioInspectorPanelPrimaryTabVisible,
  getStudioInspectorPanelState,
  loadStudioInspectorPanelPreferences,
  loadStudioInspectorPanelSessionState,
  normalizeStudioInspectorPanelPreferences,
  resetStudioInspectorPanelState,
  resetStudioInspectorPanelStoreForTests,
  saveStudioInspectorPanelPreferences,
  setStudioInspectorCompactPrimaryTabs,
  setStudioInspectorPanelCompactPrimaryTabs,
  setStudioInspectorPanelContextPinned,
  setStudioInspectorPanelPrimaryTabVisible,
  setStudioInspectorPrimaryTabVisible,
  subscribeStudioInspectorPanelState,
} from "./studio-inspector-panel-preferences";

beforeEach(() => {
  resetStudioInspectorPanelStoreForTests();
});

afterEach(() => {
  resetStudioInspectorPanelStoreForTests();
});

describe("studio inspector panel preferences", () => {
  it("normalizes visible tabs in canonical order and rejects an empty result", () => {
    expect(normalizeStudioInspectorPanelPreferences({
      version: 1,
      visiblePrimaryTabs: ["document", "unknown", "properties", "document"],
      compactPrimaryTabs: true,
    })).toEqual({
      version: 1,
      visiblePrimaryTabs: ["properties", "document"],
      compactPrimaryTabs: true,
    });

    expect(normalizeStudioInspectorPanelPreferences({
      version: 1,
      visiblePrimaryTabs: [],
      compactPrimaryTabs: false,
    })).toEqual(DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES);
  });

  it("keeps at least one primary tab visible", () => {
    const withoutLayers = setStudioInspectorPrimaryTabVisible(
      DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES,
      "layers",
      false,
    );
    const onlyProperties = setStudioInspectorPrimaryTabVisible(
      setStudioInspectorPrimaryTabVisible(withoutLayers, "document", false),
      "properties",
      true,
    );

    expect(onlyProperties.visiblePrimaryTabs).toEqual(["properties"]);
    expect(
      setStudioInspectorPrimaryTabVisible(onlyProperties, "properties", false)
        .visiblePrimaryTabs,
    ).toEqual(["properties"]);
  });

  it("updates compact mode without mutating its input", () => {
    const original = DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES;
    const compact = setStudioInspectorCompactPrimaryTabs(original, true);
    expect(compact.compactPrimaryTabs).toBe(true);
    expect(original.compactPrimaryTabs).toBe(false);
  });

  it("loads, saves and fails closed when storage is unavailable", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const preferences = {
      version: 1 as const,
      visiblePrimaryTabs: ["layers", "document"] as const,
      compactPrimaryTabs: true,
    };

    expect(saveStudioInspectorPanelPreferences(storage, preferences)).toBe(true);
    expect(values.has(STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY)).toBe(true);
    expect(loadStudioInspectorPanelPreferences(storage)).toEqual(preferences);

    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadStudioInspectorPanelPreferences(blocked)).toEqual(
      DEFAULT_STUDIO_INSPECTOR_PANEL_PREFERENCES,
    );
    expect(saveStudioInspectorPanelPreferences(blocked, preferences)).toBe(false);
  });

  it("keeps the context pin in session storage, separate from durable chrome preferences", () => {
    setStudioInspectorPanelCompactPrimaryTabs(true);
    setStudioInspectorPanelContextPinned(true);

    expect(getStudioInspectorPanelState()).toEqual({
      version: 1,
      visiblePrimaryTabs: ["properties", "layers", "document"],
      compactPrimaryTabs: true,
      contextPinned: true,
    });
    expect(localStorage.getItem(STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY)).toContain(
      '"compactPrimaryTabs":true',
    );
    expect(localStorage.getItem(STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY)).not.toContain(
      "contextPinned",
    );
    expect(sessionStorage.getItem(STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY)).toContain(
      '"contextPinned":true',
    );
    expect(loadStudioInspectorPanelSessionState(sessionStorage).contextPinned).toBe(true);
  });

  it("publishes one reactive snapshot to the navigator and context synchronizer", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioInspectorPanelState(listener);

    setStudioInspectorPanelPrimaryTabVisible("document", false);
    setStudioInspectorPanelCompactPrimaryTabs(true);
    setStudioInspectorPanelContextPinned(true);

    expect(listener).toHaveBeenCalledTimes(3);
    expect(getStudioInspectorPanelState()).toEqual({
      version: 1,
      visiblePrimaryTabs: ["properties", "layers"],
      compactPrimaryTabs: true,
      contextPinned: true,
    });
    unsubscribe();
  });

  it("restores a hidden tab when a deep link or command opens it", () => {
    setStudioInspectorPanelPrimaryTabVisible("document", false);
    expect(getStudioInspectorPanelState().visiblePrimaryTabs).toEqual([
      "properties",
      "layers",
    ]);

    ensureStudioInspectorPanelPrimaryTabVisible("document");
    expect(getStudioInspectorPanelState().visiblePrimaryTabs).toEqual([
      "properties",
      "layers",
      "document",
    ]);
  });

  it("resets both persistence tiers and the live snapshot", () => {
    setStudioInspectorPanelPrimaryTabVisible("layers", false);
    setStudioInspectorPanelCompactPrimaryTabs(true);
    setStudioInspectorPanelContextPinned(true);

    expect(resetStudioInspectorPanelState()).toEqual(
      DEFAULT_STUDIO_INSPECTOR_PANEL_STATE,
    );
    expect(localStorage.getItem(STUDIO_INSPECTOR_PANEL_PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(STUDIO_INSPECTOR_PANEL_SESSION_STORAGE_KEY)).toBeNull();
  });
});
