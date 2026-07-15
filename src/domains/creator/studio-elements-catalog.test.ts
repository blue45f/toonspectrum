import { describe, expect, it } from "vitest";

import {
  findStudioElement,
  listStudioElements,
  STUDIO_ELEMENT_ITEMS,
} from "./studio-elements-catalog";
import {
  loadStudioElementsRecent,
  normalizeStudioElementsRecentState,
  pushStudioElementRecent,
  rememberStudioElementRecent,
} from "./studio-elements-recent";

describe("studio-elements-catalog", () => {
  it("ships unique shape/frame/arrow/badge elements with svg markup", () => {
    const ids = STUDIO_ELEMENT_ITEMS.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(24);
    for (const el of STUDIO_ELEMENT_ITEMS) {
      expect(el.svg).toContain("<svg");
      expect(el.width).toBeGreaterThan(0);
      expect(el.height).toBeGreaterThan(0);
      expect(el.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("filters by category and search keywords", () => {
    const shapes = listStudioElements("shape");
    expect(shapes.every((el) => el.category === "shape")).toBe(true);
    const hearts = listStudioElements("all", "하트");
    expect(hearts.some((el) => el.id === "shape-heart")).toBe(true);
    const arrows = listStudioElements("arrow", "오른쪽");
    expect(arrows.some((el) => el.id === "arrow-right")).toBe(true);
  });

  it("finds by id", () => {
    expect(findStudioElement("shape-star")?.label).toBe("별");
    expect(findStudioElement("missing")).toBeNull();
  });
});

describe("studio-elements-recent", () => {
  it("normalizes corrupt storage and remembers MRU order", () => {
    expect(normalizeStudioElementsRecentState(null).ids).toEqual([]);
    let state = rememberStudioElementRecent(
      { version: 1, ids: [] },
      "shape-circle"
    );
    state = rememberStudioElementRecent(state, "shape-star");
    state = rememberStudioElementRecent(state, "shape-circle");
    expect(state.ids[0]).toBe("shape-circle");
    expect(state.ids[1]).toBe("shape-star");
  });

  it("persists through injected storage", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    pushStudioElementRecent(storage, "badge-new");
    pushStudioElementRecent(storage, "arrow-right");
    const loaded = loadStudioElementsRecent(storage);
    expect(loaded.ids[0]).toBe("arrow-right");
    expect(loaded.ids[1]).toBe("badge-new");
  });
});
