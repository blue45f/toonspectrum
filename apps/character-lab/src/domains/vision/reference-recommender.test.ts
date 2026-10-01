import { describe, expect, it } from "vitest";

import { createEmptyRaster, createPresetCatalog } from "../../contracts";
import { vocabularyCatalogEntries } from "../../testing/recipe-fixtures";

import { createThumbnailEmbeddingCache, embedThumbnails, recommendFromReference } from "./reference-recommender";
import { toEmbedding } from "./similarity";

import type { CapturedRaster, ThumbnailEntry } from "../../contracts";

function opaqueRaster(size: number, red: number): CapturedRaster {
  const raster = createEmptyRaster(size, size);
  for (let p = 0; p < size * size; p += 1) raster.rgba.set([red, 0, 0, 255], p * 4);
  return raster;
}

describe("vision/reference-recommender", () => {
  it("ready 썸네일만 임베딩하고 pending·failed·투명은 사유와 함께 건너뛴다", async () => {
    const thumbnails: Record<string, ThumbnailEntry> = {
      "hair/soft-bob": { status: "ready", raster: opaqueRaster(4, 255), cacheKey: "k1" },
      "hair/twin-tail": { status: "pending", cacheKey: "k2" },
      "hair/hime-cut": { status: "failed", reasonKo: "엔진 없음", cacheKey: "k3" },
      "eyes/almond": { status: "ready", raster: createEmptyRaster(4, 4), cacheKey: "k4" },
    };
    const cache = createThumbnailEmbeddingCache();
    const calls: number[] = [];
    const embedRaster = async (raster: CapturedRaster) => {
      calls.push(raster.rgba[0] ?? -1);
      return toEmbedding([raster.rgba[0] ?? 0, 1]);
    };
    const first = await embedThumbnails(thumbnails, embedRaster, cache);
    expect(first.embedded).toBe(1);
    expect(first.reused).toBe(0);
    expect(first.skipped.map((entry) => [entry.presetId, entry.reasonKo])).toEqual([
      ["hair/twin-tail", "썸네일 생성 중"],
      ["hair/hime-cut", "썸네일 실패: 엔진 없음"],
      ["eyes/almond", "썸네일이 거의 투명해 임베딩하지 않았습니다."],
    ]);
    const second = await embedThumbnails(thumbnails, embedRaster, cache);
    expect(second.reused).toBe(1);
    expect(second.embedded).toBe(0);
    expect(calls).toEqual([255]);
    expect(cache.size).toBe(1);
  });

  it("임베딩 실패는 해당 프리셋만 건너뛰고 캐시는 LRU로 제한된다", async () => {
    const cache = createThumbnailEmbeddingCache(2);
    cache.set("a", toEmbedding([1]));
    cache.set("b", toEmbedding([2]));
    cache.get("a");
    cache.set("c", toEmbedding([3]));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    cache.clear();
    expect(cache.size).toBe(0);
    const result = await embedThumbnails({ "nose/small": { status: "ready", raster: opaqueRaster(2, 10), cacheKey: "n" } }, async () => Promise.reject(new Error("embed")), cache);
    expect(result.skipped[0]?.reasonKo).toBe("임베딩 실패: embed");
  });

  it("참고 임베딩과 썸네일 임베딩으로 슬롯별 추천을 만든다", async () => {
    const catalog = createPresetCatalog(vocabularyCatalogEntries());
    const thumbnails: Record<string, ThumbnailEntry> = {
      "hair/soft-bob": { status: "ready", raster: opaqueRaster(2, 250), cacheKey: "sb" },
      "hair/twin-tail": { status: "ready", raster: opaqueRaster(2, 10), cacheKey: "tt" },
    };
    const progress: number[] = [];
    const result = await recommendFromReference({
      queryEmbedding: toEmbedding([1, 0]),
      thumbnails,
      catalog,
      embedRaster: async (raster) => toEmbedding([(raster.rgba[0] ?? 0) / 255, 1 - (raster.rgba[0] ?? 0) / 255]),
      cache: createThumbnailEmbeddingCache(),
      k: 3,
      onProgress: (done) => progress.push(done),
    });
    expect(result.recommendations.hair.map((item) => item.presetId)).toEqual(["hair/soft-bob", "hair/twin-tail"]);
    expect(result.thumbnails.embedded).toBe(2);
    expect(result.coverage.candidates).toBe(2);
    expect(progress).toEqual([1, 2]);
  });
});
