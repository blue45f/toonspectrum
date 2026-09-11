import { describe, expect, it } from "vitest";

import {
  createDefaultStudioSeriesKit,
  ensureStudioSeriesKit,
  readStudioSeriesKit,
  saveNextStudioSeriesKitVersion,
  studioSeriesKitStorageKey,
} from "./studio-series-kit-store";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("Studio Series Kit storage", () => {
  it("creates one usable webtoon-first kit per project", () => {
    const storage = memoryStorage();
    const kit = ensureStudioSeriesKit(storage, "project-12");

    expect(kit.projectId).toBe("project-12");
    expect(kit.colors.map((color) => color.id)).toEqual(expect.arrayContaining(["ink", "paper", "accent"]));
    expect(kit.textStyles.map((style) => style.id)).toEqual(expect.arrayContaining(["dialogue", "narration", "title"]));
    expect(kit.exportDefaults.map((item) => item.targetId)).toEqual(expect.arrayContaining(["webtoon-platform", "print"]));
    expect(readStudioSeriesKit(storage, "project-12")).toEqual(kit);
  });

  it("saves edits as a new version without changing project or kit identity", () => {
    const storage = memoryStorage();
    const original = createDefaultStudioSeriesKit("project-12");
    storage.setItem(studioSeriesKitStorageKey("project-12"), JSON.stringify(original));

    const next = saveNextStudioSeriesKitVersion(storage, original, {
      name: "마왕의 귀환 스타일",
      colors: original.colors.map((color) => color.id === "accent"
        ? { ...color, value: "#7057ff" }
        : color),
    });

    expect(next.version).toBe(2);
    expect(next.id).toBe(original.id);
    expect(next.projectId).toBe(original.projectId);
    expect(next.colors.find((color) => color.id === "accent")?.value).toBe("#7057ff");
  });

  it("fails closed for corrupt and cross-project payloads", () => {
    const storage = memoryStorage();
    storage.setItem(studioSeriesKitStorageKey("project-a"), "not-json");
    expect(readStudioSeriesKit(storage, "project-a")).toBeNull();

    const foreign = createDefaultStudioSeriesKit("project-b");
    storage.setItem(studioSeriesKitStorageKey("project-a"), JSON.stringify(foreign));
    expect(readStudioSeriesKit(storage, "project-a")).toBeNull();
  });
});
