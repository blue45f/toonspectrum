import { describe, expect, it } from "vitest";

import {
  addOutfitVariation,
  createModelLibraryEntry,
  listOutfitNames,
  removeOutfitVariation,
  searchModelLibrary,
} from "./studio-shaper-model-library";

import type { StudioModelLibraryEntry } from "./studio-shaper-model-library";

function makeEntry(index: number): StudioModelLibraryEntry {
  const outfits = ["교복", "사복", "판타지 갑주", "한복"];
  const tagSets = [
    ["주인공", "남자"],
    ["조연", "여자"],
    ["악역", "남자"],
    ["엑스트라"],
  ];
  return createModelLibraryEntry({
    id: `model-${index}`,
    projectId: index % 2 === 0 ? "project-a" : "project-b",
    name: `캐릭터 ${index}`,
    tags: tagSets[index % tagSets.length] ?? [],
    createdAt: 1_700_000_000_000 + index * 1_000,
    outfit: outfits[index % outfits.length] ?? "사복",
    props: index % 3 === 0 ? ["검"] : [],
    thumbnail: { kind: "generated", ref: `thumb-${index}` },
    sourceModelId: `stub-model-${index}`,
  });
}

function makeFifty(): readonly StudioModelLibraryEntry[] {
  return Object.freeze(Array.from({ length: 50 }, (_, index) => makeEntry(index)));
}

describe("searchModelLibrary", () => {
  it("이름으로 검색합니다", () => {
    const results = searchModelLibrary(makeFifty(), { query: "캐릭터 7" });
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.name).toContain("캐릭터 7");
    }
  });

  it("태그로 필터링합니다", () => {
    const entries = makeFifty();
    const results = searchModelLibrary(entries, { tags: ["주인공"] });
    expect(results).toHaveLength(13);
    for (const entry of results) {
      expect(entry.tags).toContain("주인공");
    }
  });

  it("태그 다중 조건은 AND로 동작합니다", () => {
    const entries = makeFifty();
    const results = searchModelLibrary(entries, { tags: ["주인공", "남자"] });
    expect(results).toHaveLength(13);
    const none = searchModelLibrary(entries, { tags: ["주인공", "여자"] });
    expect(none).toHaveLength(0);
  });

  it("프로젝트와 의상 필터가 함께 동작합니다", () => {
    const entries = makeFifty();
    const results = searchModelLibrary(entries, { projectId: "project-a", outfit: "교복" });
    for (const entry of results) {
      expect(entry.projectId).toBe("project-a");
      expect(entry.outfit).toBe("교복");
    }
    expect(results.length).toBeGreaterThan(0);
  });

  it("기본 정렬은 최신순입니다", () => {
    const results = searchModelLibrary(makeFifty(), {});
    expect(results).toHaveLength(50);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1]?.createdAt ?? 0).toBeGreaterThanOrEqual(results[i]?.createdAt ?? 0);
    }
  });

  it("50개 항목 검색이 1초 이내에 완료됩니다", () => {
    const entries = makeFifty();
    const startedAt = Date.now();
    for (let round = 0; round < 20; round += 1) {
      searchModelLibrary(entries, { query: "캐릭터", tags: ["남자"] });
    }
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1_000);
  });
});

describe("createModelLibraryEntry", () => {
  it("빈 이름은 거부합니다", () => {
    expect(() => makeEntry(0) && createModelLibraryEntry({
      id: "x",
      projectId: "p",
      name: "   ",
      tags: [],
      createdAt: 0,
      outfit: "사복",
      props: [],
      thumbnail: { kind: "generated", ref: "t" },
    })).toThrow();
  });

  it("태그의 공백을 정리합니다", () => {
    const entry = createModelLibraryEntry({
      id: "x",
      projectId: "p",
      name: " 테스트 ",
      tags: [" 주인공 ", ""],
      createdAt: 0,
      outfit: "사복",
      props: [],
      thumbnail: { kind: "generated", ref: "t" },
    });
    expect(entry.name).toBe("테스트");
    expect(entry.tags).toEqual(["주인공"]);
  });
});

describe("outfit variations", () => {
  it("바리에이션을 추가하고 나열합니다", () => {
    const entry = makeEntry(0);
    const withVariation = addOutfitVariation(entry, {
      variationId: "v-winter",
      name: "교복(겨울)",
      outfit: "교복",
      props: ["머플러"],
      thumbnail: { kind: "generated", ref: "thumb-v-winter" },
      createdAt: 1_700_000_001_000,
    });
    expect(withVariation.outfitVariations).toHaveLength(1);
    expect(listOutfitNames(withVariation)).toEqual(["교복", "교복(겨울)"]);
    // 원본은 변경되지 않습니다(불변).
    expect(entry.outfitVariations).toHaveLength(0);
  });

  it("동일 id의 바리에이션은 교체됩니다", () => {
    const entry = makeEntry(0);
    const first = addOutfitVariation(entry, {
      variationId: "v1",
      name: "구 버전",
      outfit: "사복",
      props: [],
      thumbnail: { kind: "generated", ref: "t1" },
      createdAt: 1,
    });
    const second = addOutfitVariation(first, {
      variationId: "v1",
      name: "신 버전",
      outfit: "사복",
      props: [],
      thumbnail: { kind: "generated", ref: "t2" },
      createdAt: 2,
    });
    expect(second.outfitVariations).toHaveLength(1);
    expect(second.outfitVariations[0]?.name).toBe("신 버전");
  });

  it("바리에이션을 제거합니다", () => {
    const entry = addOutfitVariation(makeEntry(0), {
      variationId: "v1",
      name: "교복(겨울)",
      outfit: "교복",
      props: [],
      thumbnail: { kind: "generated", ref: "t" },
      createdAt: 1,
    });
    const removed = removeOutfitVariation(entry, "v1");
    expect(removed.outfitVariations).toHaveLength(0);
  });
});
