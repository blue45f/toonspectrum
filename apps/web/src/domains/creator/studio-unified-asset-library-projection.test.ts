import { describe, expect, it } from "vitest";

import { projectStudioUnifiedAssetLibrary } from "./studio-unified-asset-library-projection";
import { createStudioUnifiedAssetLibraryState } from "./studio-unified-asset-intelligence";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

function item(index: number): StudioUnifiedAssetItem {
  return {
    id: `tool-${index}`, title: `말풍선 ${index}`, description: "편집 도구",
    category: "element", scope: "studio", categoryLabel: "도구",
    keywords: ["말풍선"], badges: [], preview: { kind: "none" },
    useMode: "open", useLabel: "열기", discoverability: "standard", sortPriority: 500 - index,
    source: { kind: "native-tool", value: {
      id: "bubble", menu: "bubble", title: "말풍선", description: "편집 도구", keywords: [],
    } },
  };
}
const local: StudioUnifiedAssetItem = {
  ...item(501), id: "local:last", title: "마지막 내 배경", category: "mine", scope: "mine",
  source: { kind: "local", value: {
    id: "last", name: "마지막 내 배경", dataUrl: "data:image/png;base64,AA==",
    width: 100, height: 100, createdAt: 1,
  } },
};
const corpus = [...Array.from({ length: 500 }, (_, index) => item(index)), local];

describe("unbounded searchable asset-library projection", () => {
  it("keeps the entire corpus, including a personal asset after the old 240-row cap", () => {
    const projected = projectStudioUnifiedAssetLibrary(corpus);
    expect(projected).toHaveLength(501);
    expect(projected).toContain(local);
  });
  it("filters formats before any child pagination, so a late image stays discoverable", () => {
    expect(projectStudioUnifiedAssetLibrary(corpus, { format: "image" })).toEqual([local]);
  });
  it("finds favorites and tray entries outside the recommendation page", () => {
    const state = { ...createStudioUnifiedAssetLibraryState(), favorites: [local.id], tray: [corpus[400]!.id] };
    expect(projectStudioUnifiedAssetLibrary(corpus, { libraryView: "favorites", libraryState: state })).toEqual([local]);
    expect(projectStudioUnifiedAssetLibrary(corpus, { libraryView: "tray", libraryState: state })).toEqual([corpus[400]]);
  });
  it("preserves recent-use ordering across the complete corpus", () => {
    const state = { ...createStudioUnifiedAssetLibraryState(), recents: [
      { id: local.id, usedAt: 20 }, { id: corpus[400]!.id, usedAt: 10 },
    ] };
    expect(projectStudioUnifiedAssetLibrary(corpus, { libraryView: "recent", libraryState: state })).toEqual([local, corpus[400]]);
  });
  it("does not mutate input arrays while applying name sorting", () => {
    const input = [local, item(1)];
    const original = [...input];
    const result = projectStudioUnifiedAssetLibrary(input, { sort: "name" });
    expect(input).toEqual(original);
    expect(result).toEqual([...input].sort((a, b) => a.title.localeCompare(b.title, "ko")));
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("returns a genuinely empty result instead of injecting recommendations", () => {
    expect(projectStudioUnifiedAssetLibrary(corpus, { libraryView: "favorites" })).toEqual([]);
    expect(projectStudioUnifiedAssetLibrary([])).toEqual([]);
  });
});
