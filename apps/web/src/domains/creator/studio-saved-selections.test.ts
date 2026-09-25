import { describe, expect, it } from "vitest";

import {
  EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
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

  it("preserves separate selections with the same name and gives the new one a unique label", () => {
    const first = upsertStudioSavedSelection(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
      { id: "one", name: "Hero", selection: selection(), now: 100 },
    );
    const updated = upsertStudioSavedSelection(
      first,
      { id: "two", name: "hero", selection: selection(6), now: 200 },
    );

    expect(updated.items).toHaveLength(2);
    expect(updated.items[0]!.id).toBe("two");
    expect(updated.items[0]!.name).toBe("hero (2)");
    expect(updated.items[0]!.createdAt).toBe(200);
    expect(updated.items[0]!.updatedAt).toBe(200);
    expect(updated.items[0]!.selection.featherPx).toBe(6);
    expect(updated.items[1]).toEqual(first.items[0]);
  });

  it("preserves more than sixteen selections through storage and deletes only the requested record", () => {
    let library = EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
    for (let index = 0; index < 40; index += 1) {
      library = upsertStudioSavedSelection(library, {
        id: `selection-${index}`,
        name: `선택 ${index}`,
        selection: selection(index),
        now: index,
      });
    }

    expect(library.items).toHaveLength(40);
    expect(library.items[0]!.id).toBe("selection-39");
    expect(library.items.some((item) => item.id === "selection-0")).toBe(true);
    const restored = decodeStudioSavedSelectionLibrary(encodeStudioSavedSelectionLibrary(library));
    expect(restored).toEqual(library);

    const removed = removeStudioSavedSelection(library, library.items[0]!.id);
    expect(removed.items).toHaveLength(39);
    expect(removed.items.some((item) => item.id === "selection-0")).toBe(true);
  });

  it("keeps explicit same-ID updates and long duplicate names unambiguous", () => {
    const name = "가".repeat(48);
    const first = upsertStudioSavedSelection(EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
      { id: "one", name, selection: selection(), now: 100 });
    const second = upsertStudioSavedSelection(first,
      { id: "two", name, selection: selection(3), now: 200 });
    const third = upsertStudioSavedSelection(second,
      { id: "three", name, selection: selection(6), now: 300 });
    expect(third.items.map((item) => item.name)).toEqual([
      `${"가".repeat(44)} (3)`, `${"가".repeat(44)} (2)`, name,
    ]);
    const updated = upsertStudioSavedSelection(third,
      { id: "one", name, selection: selection(9), now: 400 });
    expect(updated.items).toHaveLength(3);
    expect(updated.items[0]).toMatchObject({ id: "one", name, createdAt: 100, updatedAt: 400 });
    expect(updated.items[0]?.selection.featherPx).toBe(9);
  });

  it("preserves existing storage bytes when a larger selection library cannot be stored", () => {
    const storage = new MemoryStorage();
    const original = upsertStudioSavedSelection(EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
      { id: "one", name: "기존 선택", selection: selection(), now: 100 });
    expect(writeStudioSavedSelectionLibrary(storage, "scope", original)).toBe(true);
    const originalBytes = storage.getItem(studioSavedSelectionStorageKey("scope"));
    const huge = { ...original, items: Array.from({ length: 3000 }, (_, index) => ({
      ...original.items[0]!, id: `selection-${index}`, name: `선택 ${index}`,
    })) };
    expect(writeStudioSavedSelectionLibrary(storage, "scope", huge)).toBe(false);
    expect(storage.getItem(studioSavedSelectionStorageKey("scope"))).toBe(originalBytes);
    expect(readStudioSavedSelectionLibrary(storage, "scope")).toEqual(original);
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
