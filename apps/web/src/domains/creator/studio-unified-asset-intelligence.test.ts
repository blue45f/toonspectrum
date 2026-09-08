import { describe, expect, it } from "vitest";

import {
  createStudioUnifiedAssetLibraryState,
  deriveStudioUnifiedAssetFacet,
  discoverStudioUnifiedAssets,
  findRelatedStudioUnifiedAssets,
  parseStudioUnifiedAssetLibraryState,
  recordStudioUnifiedAssetUse,
  serializeStudioUnifiedAssetLibraryState,
  toggleStudioUnifiedAssetFavorite,
  toggleStudioUnifiedAssetTray,
} from "./studio-unified-asset-intelligence";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const school: StudioUnifiedAssetItem = {
  id: "background:school-night",
  category: "scene",
  scope: "studio",
  title: "비 오는 밤 학교",
  description: "학교 야간 배경",
  categoryLabel: "2D 배경",
  keywords: ["학교", "비", "밤"],
  badges: ["검수 추천"],
  preview: { kind: "image", src: "/school.webp" },
  useMode: "insert",
  useLabel: "배경 삽입",
  discoverability: "featured",
  sortPriority: 100,
  source: {
    kind: "background",
    value: {
      id: "school-night",
      label: "비 오는 밤 학교",
      genre: "학원",
      imgSrc: "/school.webp",
    },
  },
};

const chair = {
  id: "3d:school-chair",
  category: "3d",
  scope: "studio",
  title: "교실 의자",
  description: "교실용 3D 소품",
  categoryLabel: "몸 소품",
  keywords: ["학교", "교실", "의자"],
  badges: ["3D"],
  preview: { kind: "none" },
  useMode: "open",
  useLabel: "3D 도구 열기",
  discoverability: "standard",
  sortPriority: 90,
  source: {
    kind: "object-3d",
    value: {},
  },
} as unknown as StudioUnifiedAssetItem;

const romanceTemplate = {
  id: "scene-template:romance-dialogue",
  category: "scene",
  scope: "studio",
  title: "로맨스 대화 2컷",
  description: "감정 교차 대화 장면",
  categoryLabel: "장면 템플릿",
  keywords: ["로맨스", "대화", "학교"],
  badges: ["장면 레시피", "편집 가능"],
  preview: { kind: "none" },
  useMode: "apply",
  useLabel: "장면 배치",
  discoverability: "featured",
  sortPriority: 95,
  source: {
    kind: "scene-template",
    value: {},
  },
} as unknown as StudioUnifiedAssetItem;

const spark = {
  id: "element:spark",
  category: "element",
  scope: "studio",
  title: "반짝 효과",
  description: "벡터 효과",
  categoryLabel: "연출 효과",
  keywords: ["반짝", "효과"],
  badges: ["벡터", "크기 조절"],
  preview: { kind: "svg", svg: "<svg />" },
  useMode: "insert",
  useLabel: "요소 삽입",
  discoverability: "standard",
  sortPriority: 80,
  source: {
    kind: "element",
    value: {},
  },
} as unknown as StudioUnifiedAssetItem;

const unverified = {
  ...school,
  id: "background:external-city",
  title: "외부 도시 야경",
  keywords: ["도시", "밤"],
  badges: ["권리 미확인"],
  discoverability: "caution",
  sortPriority: 50,
  source: {
    kind: "background",
    value: {
      id: "external-city",
      label: "외부 도시 야경",
      genre: "도시",
      imgSrc: "/external.webp",
    },
  },
} as StudioUnifiedAssetItem;

const items = [school, chair, romanceTemplate, spark, unverified] as const;

describe("studio-unified-asset-intelligence", () => {
  it("recovers safely from invalid persisted data and enforces storage bounds", () => {
    expect(parseStudioUnifiedAssetLibraryState("not-json")).toEqual(
      createStudioUnifiedAssetLibraryState(),
    );

    const parsed = parseStudioUnifiedAssetLibraryState(
      JSON.stringify({
        version: 99,
        favorites: [
          ...Array.from({ length: 220 }, (_, index) => `favorite:${index}`),
          "favorite:0",
          null,
        ],
        recents: Array.from({ length: 55 }, (_, index) => ({
          id: `recent:${index}`,
          usedAt: index,
        })),
        tray: Array.from({ length: 35 }, (_, index) => `tray:${index}`),
      }),
    );

    expect(parsed.version).toBe(1);
    expect(parsed.favorites).toHaveLength(200);
    expect(parsed.recents).toHaveLength(40);
    expect(parsed.recents[0]).toEqual({ id: "recent:54", usedAt: 54 });
    expect(parsed.tray).toHaveLength(24);
    expect(
      parseStudioUnifiedAssetLibraryState(
        serializeStudioUnifiedAssetLibraryState(parsed),
      ),
    ).toEqual(parsed);
  });

  it("updates favorites, recent uses, and the project tray immutably", () => {
    const empty = createStudioUnifiedAssetLibraryState();
    const favorite = toggleStudioUnifiedAssetFavorite(empty, school.id);
    const tray = toggleStudioUnifiedAssetTray(favorite, school.id);
    const used = recordStudioUnifiedAssetUse(tray, chair.id, 20);
    const usedAgain = recordStudioUnifiedAssetUse(used, school.id, 30);

    expect(empty.favorites).toEqual([]);
    expect(favorite.favorites).toEqual([school.id]);
    expect(tray.tray).toEqual([school.id]);
    expect(usedAgain.recents.map(({ id }) => id)).toEqual([
      school.id,
      chair.id,
    ]);
    expect(toggleStudioUnifiedAssetFavorite(favorite, school.id).favorites).toEqual([]);
    expect(toggleStudioUnifiedAssetTray(tray, school.id).tray).toEqual([]);
  });

  it("derives format, rights, and editability facets from existing catalog metadata", () => {
    expect(deriveStudioUnifiedAssetFacet(romanceTemplate)).toEqual({
      format: "template",
      rights: "studio",
      editability: "editable",
    });
    expect(deriveStudioUnifiedAssetFacet(spark)).toEqual({
      format: "vector",
      rights: "studio",
      editability: "editable",
    });
    expect(deriveStudioUnifiedAssetFacet(school)).toEqual({
      format: "image",
      rights: "studio",
      editability: "flattened",
    });
    expect(deriveStudioUnifiedAssetFacet(unverified).rights).toBe("review");
  });

  it("combines search, shelf, format, rights, and editability filters", () => {
    const state = recordStudioUnifiedAssetUse(
      toggleStudioUnifiedAssetFavorite(
        toggleStudioUnifiedAssetTray(
          createStudioUnifiedAssetLibraryState(),
          romanceTemplate.id,
        ),
        chair.id,
      ),
      school.id,
      100,
    );

    expect(
      discoverStudioUnifiedAssets(items, {
        libraryView: "favorites",
        libraryState: state,
      }).map(({ id }) => id),
    ).toEqual([chair.id]);
    expect(
      discoverStudioUnifiedAssets(items, {
        libraryView: "tray",
        format: "template",
        libraryState: state,
      }).map(({ id }) => id),
    ).toEqual([romanceTemplate.id]);
    expect(
      discoverStudioUnifiedAssets(items, {
        libraryView: "recent",
        libraryState: state,
      }).map(({ id }) => id),
    ).toEqual([school.id]);
    expect(
      discoverStudioUnifiedAssets(items, { rights: "review" }).map(
        ({ id }) => id,
      ),
    ).toEqual([unverified.id]);
    expect(
      discoverStudioUnifiedAssets(items, { editability: "editable" }).map(
        ({ id }) => id,
      ),
    ).toEqual(expect.arrayContaining([chair.id, romanceTemplate.id, spark.id]));
    expect(
      discoverStudioUnifiedAssets(items, {
        query: "학교 의자",
      }).map(({ id }) => id),
    ).toEqual([chair.id]);
  });

  it("ranks related assets using category, source, format, and keyword overlap", () => {
    const related = findRelatedStudioUnifiedAssets(items, school, 4);

    expect(related[0]?.id).toBe(romanceTemplate.id);
    expect(related.map(({ id }) => id)).toContain(chair.id);
    expect(related.map(({ id }) => id)).not.toContain(unverified.id);
  });
});
