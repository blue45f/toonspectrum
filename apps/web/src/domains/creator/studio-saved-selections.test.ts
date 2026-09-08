import { describe, expect, it } from "vitest";

import {
  EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
  STUDIO_SAVED_SELECTION_MAX_ITEMS,
  decodeStudioSavedSelectionLibrary,
  encodeStudioSavedSelectionLibrary,
  readStudioSavedSelectionLibrary,
  removeStudioSavedSelection,
  studioSavedSelectionStorageKey,
  upsertStudioSavedSelection,
  writeStudioSavedSelectionLibrary,
  type StudioSelectionStorage,
} from "./studio-saved-selections";
import {
  emptyPixelSelection,
  rectSelectionPolygon,
} from "./studio-selection-tools";

function selection(offset = 0) {
  return {
    ...emptyPixelSelection(),
    featherPx: offset,
    subpaths: [{
      mode: "add" as const,
      points: rectSelectionPolygon(
        { x: 0.1 + offset / 1000, y: 0.1 },
        { x: 0.8, y: 0.8 },
      ),
    }],
  };
}

class MemoryStorage implements StudioSelectionStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("studio-saved-selections", () => {
  it("round-trips a normalized, named selection library", () => {
    const library = upsertStudioSavedSelection(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
      { id: "alpha", name: "주인공 실루엣", selection: selection(4), now: 100 },
    );
    const decoded = decodeStudioSavedSelectionLibrary(
      encodeStudioSavedSelectionLibrary(library),
    );

    expect(decoded.items).toHaveLength(1);
    expect(decoded.items[0]).toMatchObject({
      id: "alpha",
      name: "주인공 실루엣",
      createdAt: 100,
      updatedAt: 100,
    });
    expect(decoded.items[0]!.selection).toEqual(selection(4));
    expect(decoded.items[0]!.selection).not.toBe(library.items[0]!.selection);
  });

  it("updates a case-insensitive name instead of creating duplicates", () => {
    const first = upsertStudioSavedSelection(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
      { id: "one", name: "Hero", selection: selection(), now: 100 },
    );
    const updated = upsertStudioSavedSelection(
      first,
      { id: "two", name: "hero", selection: selection(6), now: 200 },
    );

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]!.id).toBe("one");
    expect(updated.items[0]!.createdAt).toBe(100);
    expect(updated.items[0]!.updatedAt).toBe(200);
    expect(updated.items[0]!.selection.featherPx).toBe(6);
  });

  it("keeps the newest bounded set and supports deletion", () => {
    let library = EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
    for (let index = 0; index < STUDIO_SAVED_SELECTION_MAX_ITEMS + 4; index += 1) {
      library = upsertStudioSavedSelection(library, {
        id: `selection-${index}`,
        name: `선택 ${index}`,
        selection: selection(index),
        now: index,
      });
    }

    expect(library.items).toHaveLength(STUDIO_SAVED_SELECTION_MAX_ITEMS);
    expect(library.items[0]!.id).toBe(`selection-${STUDIO_SAVED_SELECTION_MAX_ITEMS + 3}`);
    expect(library.items.some((item) => item.id === "selection-0")).toBe(false);

    const removed = removeStudioSavedSelection(library, library.items[0]!.id);
    expect(removed.items).toHaveLength(STUDIO_SAVED_SELECTION_MAX_ITEMS - 1);
  });

  it("fails closed on oversized, malformed, duplicate, and unusable data", () => {
    expect(decodeStudioSavedSelectionLibrary("not-json")).toEqual(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
    );
    expect(decodeStudioSavedSelectionLibrary("x".repeat(512_001))).toEqual(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
    );

    const decoded = decodeStudioSavedSelectionLibrary(JSON.stringify({
      version: 1,
      items: [
        { id: "same", name: "Valid", selection: selection(), createdAt: 1, updatedAt: 1 },
        { id: "same", name: "Duplicate", selection: selection(), createdAt: 2, updatedAt: 2 },
        { id: "empty", name: "Empty", selection: emptyPixelSelection(), createdAt: 3, updatedAt: 3 },
      ],
    }));
    expect(decoded.items.map((item) => item.name)).toEqual(["Valid"]);
  });

  it("uses a scoped storage key and contains storage failures", () => {
    const storage = new MemoryStorage();
    const library = upsertStudioSavedSelection(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
      { id: "saved", name: "저장", selection: selection(), now: 10 },
    );
    expect(writeStudioSavedSelectionLibrary(storage, "work/image", library)).toBe(true);
    expect(storage.values.has(studioSavedSelectionStorageKey("work/image"))).toBe(true);
    expect(readStudioSavedSelectionLibrary(storage, "work/image")).toEqual(library);

    const throwingStorage: StudioSelectionStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readStudioSavedSelectionLibrary(throwingStorage, "scope")).toEqual(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
    );
    expect(writeStudioSavedSelectionLibrary(throwingStorage, "scope", library)).toBe(false);
  });
});
