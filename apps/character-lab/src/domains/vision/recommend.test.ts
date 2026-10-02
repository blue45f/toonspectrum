import { describe, expect, it } from "vitest";

import { createPresetCatalog } from "../../contracts";
import { hexToOklab } from "../../shared/color";
import { vocabularyCatalogEntries } from "../../testing/recipe-fixtures";

import { isSkinLike, recommendColors, recommendPresets, summarizeRecommendationsKo } from "./recommend";
import { toEmbedding } from "./similarity";

import type { PaletteEntry } from "./kmeans-palette";
import type { Embedding, PresetId } from "../../contracts";

function entry(hex: string, weight: number): PaletteEntry {
  const oklab = hexToOklab(hex);
  if (!oklab) throw new Error(hex);
  return { hex, weight, oklab, count: Math.round(weight * 100) };
}

describe("vision/recommend", () => {
  const catalog = createPresetCatalog(vocabularyCatalogEntries());

  it("슬롯별 상위 k 추천은 코사인 내림차순이며 임베딩 없는 프리셋은 coverage.missing에 남는다", () => {
    const query = toEmbedding([1, 0, 0]);
    const embeddings: Partial<Record<PresetId, Embedding>> = {
      "hair/soft-bob": toEmbedding([1, 0, 0]),
      "hair/short-layered": toEmbedding([0.5, 0.5, 0]),
      "hair/twin-tail": toEmbedding([0, 1, 0]),
      "eyes/almond": toEmbedding([0.9, 0.1, 0]),
    };
    const result = recommendPresets(query, embeddings, catalog, 2);
    expect(result.recommendations.hair.map((item) => item.presetId)).toEqual(["hair/soft-bob", "hair/short-layered"]);
    expect(result.recommendations.eyes.map((item) => item.presetId)).toEqual(["eyes/almond"]);
    expect(result.recommendations.nose).toEqual([]);
    expect(result.coverage.candidates).toBe(4);
    expect(result.coverage.total).toBe(catalog.entries.length);
    expect(result.coverage.missing).toContain("hair/romance-long");
    expect(result.coverage.missing).not.toContain("hair/soft-bob");
    expect(summarizeRecommendationsKo(result)).toMatch(/hair: hair\/soft-bob/u);
  });

  it("색 추천은 피부(따뜻·중간 밝기·저채도)·헤어(가장 어두움)·상의(채도 최대)를 결정적으로 배정한다", () => {
    const palette = [entry("#f1c9a9", 0.4), entry("#2b1d16", 0.25), entry("#2060d0", 0.2), entry("#8a8a8a", 0.1), entry("#d02020", 0.05)];
    const colors = recommendColors(palette);
    expect(colors.skin).toBe("#f1c9a9");
    expect(colors.hair).toBe("#2b1d16");
    expect(colors.brow).toBe("#2b1d16");
    expect(colors.iris).toBe("#2060d0");
    expect(colors.top).toBe("#d02020");
    expect(colors.bottom).toBe("#8a8a8a");
    expect(colors.shoes).toBeUndefined();
    expect(recommendColors(palette)).toEqual(colors);
  });

  it("조건에 맞는 군집이 없으면 피부 키를 비워 두고 빈 팔레트는 아무 키도 주지 않는다", () => {
    expect(recommendColors([])).toEqual({});
    const cold = [entry("#2060d0", 0.6), entry("#101010", 0.4)];
    const colors = recommendColors(cold);
    expect(colors.skin).toBeUndefined();
    expect(colors.hair).toBe("#101010");
    expect(colors.iris).toBe("#2060d0");
    const skinLab = hexToOklab("#f1c9a9");
    expect(skinLab && isSkinLike({ lightness: skinLab[0], chroma: Math.hypot(skinLab[1], skinLab[2]), hue: (Math.atan2(skinLab[2], skinLab[1]) * 180) / Math.PI })).toBe(true);
  });
});
