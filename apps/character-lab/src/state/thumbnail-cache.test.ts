import { describe, expect, it } from "vitest";

import { createDefaultRecipe, createEmptyRaster, createPresetCatalog } from "../contracts";
import { presetEntryFixture, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { THUMBNAIL_CACHE_DEFAULT_LIMIT, createThumbnailCache, thumbnailCacheKey } from "./thumbnail-cache";

const CATALOG = createPresetCatalog(
  vocabularyCatalogEntries().map((entry) => {
    if (entry.id === "face-shape/heart") return presetEntryFixture(entry.id, { patch: { face: { jawWidth: 0.7, chinLength: 0.2 }, colors: { skin: "#ffeedd" } } });
    if (entry.id === "pose/wave") return presetEntryFixture(entry.id, { patch: { pose: { head: [0, 0, 0, 1] } } });
    return entry;
  }),
);

describe("state/thumbnail-cache", () => {
  it("캐시 키는 해당 슬롯 값 변경에 불변이다", () => {
    const base = createDefaultRecipe();
    const key = thumbnailCacheKey("hair/twin-tail", base, "pbr");
    const changedSlot = { ...base, slots: { ...base.slots, hair: "hair/romance-long" as const } };
    expect(thumbnailCacheKey("hair/twin-tail", changedSlot, "pbr")).toBe(key);
    expect(key.startsWith("hair/twin-tail|pbr|")).toBe(true);
    expect(key).toMatch(/\|[0-9a-f]{16}$/u);
  });

  it("다른 슬롯·색·셰이딩 모드·프리셋이 바뀌면 키가 바뀐다", () => {
    const base = createDefaultRecipe();
    const key = thumbnailCacheKey("hair/twin-tail", base, "pbr");
    expect(thumbnailCacheKey("hair/twin-tail", base, "toon")).not.toBe(key);
    expect(thumbnailCacheKey("hair/soft-bob", base, "pbr")).not.toBe(key);
    expect(thumbnailCacheKey("hair/twin-tail", { ...base, colors: { ...base.colors, skin: "#000000" } }, "pbr")).not.toBe(key);
    expect(thumbnailCacheKey("hair/twin-tail", { ...base, slots: { ...base.slots, top: "top/hoodie" } }, "pbr")).not.toBe(key);
    expect(thumbnailCacheKey("hair/twin-tail", { ...base, body: { height: 0.3 } }, "pbr")).not.toBe(key);
  });

  it("paint 레이어·셰이딩 모드 외 셰이딩 옵션은 키에 영향을 주지 않는다", () => {
    const base = createDefaultRecipe();
    const key = thumbnailCacheKey("eyes/round", base, "pbr");
    const painted = { ...base, paint: { layers: [{ part: "skin" as const, width: 2, height: 2, pngBase64: "AAAA" }] } };
    expect(thumbnailCacheKey("eyes/round", painted, "pbr")).toBe(key);
    const bloom = { ...base, shading: { ...base.shading, postfx: { ...base.shading.postfx, bloom: true } } };
    expect(thumbnailCacheKey("eyes/round", bloom, "pbr")).toBe(key);
  });

  it("카탈로그를 주면 그 프리셋의 patch가 덮어쓰는 파라미터·색은 키에서 제외된다", () => {
    const base = createDefaultRecipe();
    const edited = { ...base, face: { jawWidth: 0.4 }, colors: { ...base.colors, skin: "#000000" } };
    // heart는 jawWidth·chinLength·skin을 덮어쓰므로 그 값이 달라도 heart 카드의 키는 같다.
    expect(thumbnailCacheKey("face-shape/heart", edited, "pbr", CATALOG)).toBe(thumbnailCacheKey("face-shape/heart", base, "pbr", CATALOG));
    expect(thumbnailCacheKey("face-shape/heart", edited, "pbr")).not.toBe(thumbnailCacheKey("face-shape/heart", base, "pbr"));
    // 덮어쓰지 않는 키(eyeSize)는 여전히 반영된다.
    expect(thumbnailCacheKey("face-shape/heart", { ...edited, face: { jawWidth: 0.4, eyeSize: 0.1 } }, "pbr", CATALOG)).not.toBe(
      thumbnailCacheKey("face-shape/heart", edited, "pbr", CATALOG),
    );
    // patch가 빈 프리셋(round fixture)은 아무 키도 제외하지 않는다.
    expect(thumbnailCacheKey("face-shape/round", edited, "pbr", CATALOG)).not.toBe(thumbnailCacheKey("face-shape/round", base, "pbr", CATALOG));
    // 같은 슬롯의 현재 선택이 바뀌어도 다른 카드의 키는 그대로다.
    const switched = { ...edited, slots: { ...edited.slots, "face-shape": "face-shape/oval" as const } };
    expect(thumbnailCacheKey("face-shape/heart", switched, "pbr", CATALOG)).toBe(thumbnailCacheKey("face-shape/heart", edited, "pbr", CATALOG));
  });

  it("카탈로그가 있으면 연기 필드는 patch가 그 필드를 통째로 교체할 때만 제외한다", () => {
    const base = createDefaultRecipe();
    const posed = { ...base, pose: { hips: [0, 0, 0, 1] as const } };
    expect(thumbnailCacheKey("pose/wave", posed, "pbr", CATALOG)).toBe(thumbnailCacheKey("pose/wave", base, "pbr", CATALOG));
    // idle fixture는 pose patch가 없어 현재 포즈가 썸네일에 남으므로 키에 반영된다.
    expect(thumbnailCacheKey("pose/idle", posed, "pbr", CATALOG)).not.toBe(thumbnailCacheKey("pose/idle", base, "pbr", CATALOG));
    // 카탈로그가 없으면 슬롯 종류로 근사한다.
    expect(thumbnailCacheKey("pose/idle", posed, "pbr")).toBe(thumbnailCacheKey("pose/idle", base, "pbr"));
  });

  it("연기 슬롯 프리셋은 자신이 덮어쓰는 필드를 키에서 뺀다", () => {
    const base = createDefaultRecipe();
    const smiling = { ...base, expression: { mouthSmile: 1 } };
    expect(thumbnailCacheKey("expression/joy", smiling, "pbr")).toBe(thumbnailCacheKey("expression/joy", base, "pbr"));
    expect(thumbnailCacheKey("hair/soft-bob", smiling, "pbr")).not.toBe(thumbnailCacheKey("hair/soft-bob", base, "pbr"));
    const posed = { ...base, pose: { head: [0, 0, 0, 1] as const } };
    expect(thumbnailCacheKey("pose/idle", posed, "pbr")).toBe(thumbnailCacheKey("pose/idle", base, "pbr"));
    const hand = { ...base, handPose: { left: { leftIndexDistal: [0, 0, 0, 1] as const }, right: {} } };
    expect(thumbnailCacheKey("hand-pose/fist", hand, "pbr")).toBe(thumbnailCacheKey("hand-pose/fist", base, "pbr"));
  });

  it("LRU: 한도를 넘으면 가장 오래 안 쓴 항목을 버리고 get이 항목을 최신으로 올린다", () => {
    const cache = createThumbnailCache(3);
    const raster = createEmptyRaster(1, 1);
    cache.set("a", raster);
    cache.set("b", raster);
    cache.set("c", raster);
    expect(cache.get("a")).toBe(raster);
    cache.set("d", raster);
    expect(cache.keys()).toEqual(["c", "a", "d"]);
    expect(cache.has("b")).toBe(false);
    cache.set("c", raster);
    expect(cache.keys()).toEqual(["a", "d", "c"]);
    expect(cache.size()).toBe(3);
    expect(cache.delete("d")).toBe(true);
    expect(cache.get("zzz")).toBeUndefined();
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(createThumbnailCache().limit).toBe(THUMBNAIL_CACHE_DEFAULT_LIMIT);
    expect(createThumbnailCache(0).limit).toBe(1);
  });
});
