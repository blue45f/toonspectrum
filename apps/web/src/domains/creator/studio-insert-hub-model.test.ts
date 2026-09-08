import { describe, expect, it } from "vitest";

import {
  buildStudioInsertHubEntries,
  countStudioInsertHubEntries,
  loadStudioInsertHubPreferences,
  normalizeStudioInsertHubPreferences,
  reconcileStudioInsertHubPreferences,
  recordStudioInsertRecent,
  resolveStudioInsertPlacement,
  saveStudioInsertHubPreferences,
  selectStudioInsertHubEntries,
  setStudioInsertPlacementMode,
  STUDIO_INSERT_ACTIONS,
  STUDIO_INSERT_HUB_MAX_FAVORITES,
  STUDIO_INSERT_HUB_MAX_RECENTS,
  STUDIO_INSERT_HUB_STATE_VERSION,
  toggleStudioInsertFavorite,
} from "./studio-insert-hub-model";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const localAsset: StudioUnifiedAssetItem = {
  id: "local:hero-reference",
  category: "mine",
  scope: "mine",
  title: "내 주인공 참고 이미지",
  description: "직접 저장한 캐릭터 시트",
  categoryLabel: "내 에셋",
  keywords: ["캐릭터", "시트", "reference"],
  badges: ["내 에셋"],
  preview: { kind: "none" },
  useMode: "insert",
  useLabel: "캔버스에 삽입",
  discoverability: "standard",
  sortPriority: 20,
  source: {
    kind: "local",
    value: {
      id: "hero-reference",
      name: "내 주인공 참고 이미지",
      dataUrl: "data:image/png;base64,AA==",
      width: 600,
      height: 900,
      createdAt: 1,
    },
  },
};

const background: StudioUnifiedAssetItem = {
  id: "background:school-night",
  category: "scene",
  scope: "studio",
  title: "비 오는 밤 학교 복도",
  description: "학원물 야간 배경",
  categoryLabel: "2D 배경",
  keywords: ["학교", "교실", "비", "night", "rain"],
  badges: ["검수 추천"],
  preview: { kind: "none" },
  useMode: "insert",
  useLabel: "배경 삽입",
  discoverability: "featured",
  sortPriority: 100,
  source: {
    kind: "background",
    value: {
      id: "school-night",
      label: "비 오는 밤 학교 복도",
      genre: "학원",
    },
  },
};

function entries() {
  return buildStudioInsertHubEntries([localAsset, background]);
}

function emptyPreferences() {
  return normalizeStudioInsertHubPreferences({
    version: STUDIO_INSERT_HUB_STATE_VERSION,
    favoriteIds: [],
    recentIds: [],
    placementMode: "auto",
  });
}

describe("Studio insert hub model", () => {
  it("combines safe native actions and existing catalog items without flattening ownership", () => {
    const result = entries();
    expect(result).toHaveLength(STUDIO_INSERT_ACTIONS.length + 2);
    expect(result.find((entry) => entry.id === "action:text")).toMatchObject({
      kind: "action",
      category: "quick",
      placementSupport: "none",
    });
    expect(result.find((entry) => entry.id === localAsset.id)).toMatchObject({
      kind: "asset",
      category: "mine",
      placementSupport: "image",
    });
    expect(result.find((entry) => entry.id === background.id)).toMatchObject({
      kind: "asset",
      category: "scene",
      placementSupport: "none",
    });
  });

  it("counts every insertion family", () => {
    const counts = countStudioInsertHubEntries(entries());
    expect(counts.all).toBe(STUDIO_INSERT_ACTIONS.length + 2);
    expect(counts.quick).toBeGreaterThanOrEqual(3);
    expect(counts.scene).toBeGreaterThanOrEqual(3);
    expect(counts.media).toBeGreaterThanOrEqual(3);
    expect(counts["3d"]).toBeGreaterThanOrEqual(1);
    expect(counts.mine).toBe(1);
  });

  it("finds actions and assets through Korean and English insertion synonyms", () => {
    const result = entries();
    expect(
      selectStudioInsertHubEntries(result, { query: "가져오기" })[0]?.id,
    ).toBe("action:upload");
    expect(
      selectStudioInsertHubEntries(result, { query: "speech" })[0]?.id,
    ).toBe("action:bubble");
    expect(
      selectStudioInsertHubEntries(result, { query: "학교 밤" }).map(
        (entry) => entry.id,
      ),
    ).toContain(background.id);
    expect(
      selectStudioInsertHubEntries(result, {
        query: "캐릭터 reference",
      }).map((entry) => entry.id),
    ).toContain(localAsset.id);
  });

  it("keeps category and collection filters independent", () => {
    const base = emptyPreferences();
    const preferences = recordStudioInsertRecent(
      toggleStudioInsertFavorite(base, background.id),
      localAsset.id,
    );
    expect(
      selectStudioInsertHubEntries(entries(), {
        category: "scene",
        collection: "favorites",
        preferences,
      }).map((entry) => entry.id),
    ).toEqual([background.id]);
    expect(
      selectStudioInsertHubEntries(entries(), {
        category: "mine",
        collection: "recent",
        preferences,
      }).map((entry) => entry.id),
    ).toEqual([localAsset.id]);
  });

  it("uses favorites and recent usage as stable ranking signals", () => {
    const base = emptyPreferences();
    const preferences = recordStudioInsertRecent(
      toggleStudioInsertFavorite(base, background.id),
      localAsset.id,
    );
    const selected = selectStudioInsertHubEntries(entries(), {
      query: "이미지",
      preferences,
    });
    expect(selected.some((entry) => entry.id === localAsset.id)).toBe(true);
    expect(
      selectStudioInsertHubEntries(entries(), {
        collection: "favorites",
        preferences,
      }).map((entry) => entry.id),
    ).toEqual([background.id]);
    expect(
      selectStudioInsertHubEntries(entries(), {
        collection: "recent",
        preferences,
      }).map((entry) => entry.id),
    ).toEqual([localAsset.id]);
  });

  it("normalizes malformed persisted state and enforces bounded unique ids", () => {
    const favoriteIds = Array.from(
      { length: STUDIO_INSERT_HUB_MAX_FAVORITES + 20 },
      (_, index) => `entry:${index}`,
    );
    const recentIds = Array.from(
      { length: STUDIO_INSERT_HUB_MAX_RECENTS + 20 },
      (_, index) => `recent:${index}`,
    );
    const normalized = normalizeStudioInsertHubPreferences({
      version: STUDIO_INSERT_HUB_STATE_VERSION,
      favoriteIds: [favoriteIds[0], favoriteIds[0], ...favoriteIds, " bad "],
      recentIds: [recentIds[0], recentIds[0], ...recentIds, "bad\u0000id"],
      placementMode: "selection",
    });
    expect(normalized.favoriteIds).toHaveLength(
      STUDIO_INSERT_HUB_MAX_FAVORITES,
    );
    expect(normalized.recentIds).toHaveLength(STUDIO_INSERT_HUB_MAX_RECENTS);
    expect(new Set(normalized.favoriteIds).size).toBe(
      normalized.favoriteIds.length,
    );
    expect(new Set(normalized.recentIds).size).toBe(normalized.recentIds.length);
    expect(normalized.placementMode).toBe("selection");

    expect(normalizeStudioInsertHubPreferences("not-json")).toEqual(
      emptyPreferences(),
    );
    expect(
      normalizeStudioInsertHubPreferences({
        version: 99,
        favoriteIds: [background.id],
        recentIds: [background.id],
        placementMode: "page",
      }),
    ).toEqual(emptyPreferences());
  });

  it("updates favorites, MRU order, and placement without mutating input", () => {
    const base = emptyPreferences();
    const favorite = toggleStudioInsertFavorite(base, background.id);
    expect(base.favoriteIds).toEqual([]);
    expect(favorite.favoriteIds).toEqual([background.id]);
    expect(
      toggleStudioInsertFavorite(favorite, background.id).favoriteIds,
    ).toEqual([]);

    const recent = recordStudioInsertRecent(
      recordStudioInsertRecent(
        recordStudioInsertRecent(base, background.id),
        localAsset.id,
      ),
      background.id,
    );
    expect(recent.recentIds).toEqual([background.id, localAsset.id]);
    expect(setStudioInsertPlacementMode(recent, "page").placementMode).toBe(
      "page",
    );
  });

  it("prunes references to entries no longer present", () => {
    const preferences = normalizeStudioInsertHubPreferences({
      version: STUDIO_INSERT_HUB_STATE_VERSION,
      favoriteIds: [background.id, "removed:item"],
      recentIds: ["removed:item", localAsset.id],
      placementMode: "page",
    });
    const reconciled = reconcileStudioInsertHubPreferences(
      preferences,
      new Set([background.id, localAsset.id]),
    );
    expect(reconciled.favoriteIds).toEqual([background.id]);
    expect(reconciled.recentIds).toEqual([localAsset.id]);
    expect(reconciled.placementMode).toBe("page");
  });

  it("fails open when browser storage is unavailable", () => {
    const throwingRead = {
      getItem(): string | null {
        throw new Error("blocked");
      },
    };
    const throwingWrite = {
      setItem(): void {
        throw new Error("quota");
      },
    };
    expect(loadStudioInsertHubPreferences(throwingRead)).toEqual(
      emptyPreferences(),
    );
    const saved = saveStudioInsertHubPreferences(
      throwingWrite,
      setStudioInsertPlacementMode(emptyPreferences(), "page"),
    );
    expect(saved.placementMode).toBe("page");
  });

  it("creates bounded page and selection placement contracts", () => {
    expect(
      resolveStudioInsertPlacement("auto", {
        canvasWidth: 800,
        canvasHeight: 1_200,
      }),
    ).toBeUndefined();

    expect(
      resolveStudioInsertPlacement("page", {
        canvasWidth: 800,
        canvasHeight: 1_200,
      }),
    ).toEqual({
      bounds: { x: 0, y: 0, width: 800, height: 1_200 },
      inset: 48,
      maxScale: 1,
    });

    expect(
      resolveStudioInsertPlacement("selection", {
        canvasWidth: 800,
        canvasHeight: 1_200,
        selectionBounds: { x: 100, y: 200, width: 300, height: 450 },
      }),
    ).toEqual({
      anchor: { x: 250, y: 425 },
      bounds: { x: 100, y: 200, width: 300, height: 450 },
      inset: 16,
      maxScale: 1,
    });
  });

  it("rejects invalid selection geometry instead of manufacturing placement", () => {
    expect(
      resolveStudioInsertPlacement("selection", {
        canvasWidth: 800,
        canvasHeight: 1_200,
        selectionBounds: { x: 10, y: 20, width: 0, height: 100 },
      }),
    ).toBeUndefined();
    expect(
      resolveStudioInsertPlacement("page", {
        canvasWidth: Number.NaN,
        canvasHeight: 1_200,
      }),
    ).toBeUndefined();
  });
});
