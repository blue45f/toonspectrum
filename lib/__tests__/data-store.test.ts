import { afterEach, describe, expect, it } from "vitest";
import {
  allReviewsJoined,
  allTitles,
  getCatalogState,
  replaceCatalogData,
  reviewsFor,
} from "../data";

describe("runtime catalog store", () => {
  const originalTitles = allTitles();
  const originalState = getCatalogState();

  afterEach(() => {
    replaceCatalogData(originalTitles, {
      source: originalState.source,
      sourceVersion: originalState.sourceVersion,
      seedFallback: originalState.seedFallback,
    });
  });

  it("DB snapshot input이 비어 있어도 titles.ts seed 파일로 폴백하지 않는다", () => {
    const next = replaceCatalogData([], {
      source: "database-snapshot",
      sourceVersion: "empty-db-test",
    });

    expect(next).toEqual([]);
    expect(allTitles()).toHaveLength(0);
    expect(getCatalogState()).toMatchObject({
      source: "database-snapshot",
      sourceVersion: "empty-db-test",
      titleCount: 0,
      seedFallback: false,
    });
  });

  it("리뷰 데이터도 파일 seed가 아니라 DB 결과만 표시되도록 빈 상태를 유지한다", () => {
    replaceCatalogData([], {
      source: "database-snapshot",
      sourceVersion: "empty-db-test",
    });

    expect(reviewsFor("anything")).toEqual([]);
    expect(allReviewsJoined()).toEqual([]);
  });
});
