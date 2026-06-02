import { afterEach, describe, expect, it } from "vitest";
import {
  allTitles,
  getCatalogState,
  replaceCatalogData,
} from "../server/catalog-store";

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

  it("리뷰 파일 seed API를 런타임 카탈로그 저장소에 노출하지 않는다", async () => {
    replaceCatalogData([], {
      source: "database-snapshot",
      sourceVersion: "empty-db-test",
    });

    const store = await import("../server/catalog-store");
    expect("reviewsFor" in store).toBe(false);
    expect("allReviewsJoined" in store).toBe(false);
    expect("SEED_REVIEWS" in store).toBe(false);
  });
});
