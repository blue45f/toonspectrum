/**
 * 참고 이미지 → 슬롯별 프리셋 추천·색 추천(순수).
 *
 * - `recommendPresets`: 참고 이미지 임베딩과 프리셋 썸네일 임베딩의 코사인 유사도로 슬롯별 상위 k개.
 *   썸네일 임베딩이 없는 프리셋은 후보에서 빠지고(추천 불가 사유는 coverage로 노출), 슬롯에 후보가 없으면 빈 배열.
 * - `recommendColors`: k-means 팔레트(OKLab)를 레시피 색 키에 배정하는 결정적 휴리스틱.
 *   피부 = 따뜻한 색상(hue 20°~90°)·중간 밝기·낮은 채도 중 비중 최대, 헤어/눈썹 = 가장 어두운 군집,
 *   눈동자 = 헤어 다음으로 어두운 군집, 상의 = 남은 것 중 채도 최대, 하의 = 남은 것 중 비중 최대, 신발 = 남은 것 중 가장 어두운 것,
 *   액세서리 = 남은 것 중 채도 최대. 조건을 만족하는 군집이 없으면 그 키는 비워 둔다(임의 기본색 대체 금지).
 */
import { CHARACTER_SLOT_KINDS } from "../../contracts";

import { oklabChroma, oklabHueDeg } from "./kmeans-palette";
import { rankBySimilarity } from "./similarity";

import type { PaletteEntry } from "./kmeans-palette";
import type { Embedding, PresetCatalog, PresetId, RecipeColors, SlotKind } from "../../contracts";

export interface PresetRecommendation {
  readonly presetId: PresetId;
  /** 코사인 유사도 [-1, 1] */
  readonly score: number;
}

export type SlotRecommendations = Readonly<Record<SlotKind, readonly PresetRecommendation[]>>;

export interface RecommendationCoverage {
  /** 임베딩이 있어 후보가 된 프리셋 수 */
  readonly candidates: number;
  /** 카탈로그 전체 프리셋 수 */
  readonly total: number;
  /** 임베딩이 없어 제외된 프리셋 */
  readonly missing: readonly PresetId[];
}

export interface PresetRecommendationResult {
  readonly recommendations: SlotRecommendations;
  readonly coverage: RecommendationCoverage;
}

export const DEFAULT_RECOMMENDATION_K = 3;

/** 슬롯별 상위 k 추천 */
export function recommendPresets(
  queryEmbedding: Embedding,
  thumbnailEmbeddings: Readonly<Partial<Record<PresetId, Embedding>>>,
  catalog: PresetCatalog,
  k: number = DEFAULT_RECOMMENDATION_K,
): PresetRecommendationResult {
  const recommendations: Partial<Record<SlotKind, readonly PresetRecommendation[]>> = {};
  const missing: PresetId[] = [];
  let candidates = 0;
  for (const slot of CHARACTER_SLOT_KINDS) {
    const entries = catalog.bySlot(slot);
    const withEmbedding: { id: PresetId; embedding: Embedding }[] = [];
    for (const entry of entries) {
      const embedding = thumbnailEmbeddings[entry.id];
      if (embedding) withEmbedding.push({ id: entry.id, embedding });
      else missing.push(entry.id);
    }
    candidates += withEmbedding.length;
    recommendations[slot] = rankBySimilarity(queryEmbedding, withEmbedding, k).map((ranked) => ({ presetId: ranked.id, score: ranked.score }));
  }
  return {
    recommendations: recommendations as SlotRecommendations,
    coverage: { candidates, total: catalog.entries.length, missing },
  };
}

type ColorKey = keyof RecipeColors;

interface PaletteCandidate {
  readonly entry: PaletteEntry;
  readonly lightness: number;
  readonly chroma: number;
  readonly hue: number;
}

function candidatesOf(palette: readonly PaletteEntry[]): PaletteCandidate[] {
  return palette.map((entry) => ({ entry, lightness: entry.oklab[0], chroma: oklabChroma(entry.oklab), hue: oklabHueDeg(entry.oklab) }));
}

function pick(pool: PaletteCandidate[], predicate: (candidate: PaletteCandidate) => boolean, better: (a: PaletteCandidate, b: PaletteCandidate) => number): PaletteCandidate | null {
  let best: PaletteCandidate | null = null;
  for (const candidate of pool) {
    if (!predicate(candidate)) continue;
    if (best === null || better(candidate, best) < 0) best = candidate;
  }
  if (best) {
    const index = pool.indexOf(best);
    if (index >= 0) pool.splice(index, 1);
  }
  return best;
}

/** 피부로 볼 수 있는 색: 따뜻한 색상(20°~90°), 밝기 0.45~0.95, 채도 0.16 이하 */
export function isSkinLike(candidate: { lightness: number; chroma: number; hue: number }): boolean {
  return candidate.hue >= 20 && candidate.hue <= 90 && candidate.lightness >= 0.45 && candidate.lightness <= 0.95 && candidate.chroma <= 0.16;
}

/** 팔레트 → 레시피 색 추천(조건을 만족하는 군집이 없으면 해당 키 생략) */
export function recommendColors(palette: readonly PaletteEntry[]): Partial<RecipeColors> {
  const pool = candidatesOf(palette.filter((entry) => entry.weight > 0));
  const result: Partial<Record<ColorKey, string>> = {};
  const byWeightDesc = (a: PaletteCandidate, b: PaletteCandidate): number => b.entry.weight - a.entry.weight;
  const byLightnessAsc = (a: PaletteCandidate, b: PaletteCandidate): number => a.lightness - b.lightness;
  const byChromaDesc = (a: PaletteCandidate, b: PaletteCandidate): number => b.chroma - a.chroma;

  const skin = pick(pool, isSkinLike, byWeightDesc);
  if (skin) result.skin = skin.entry.hex;
  const hair = pick(pool, () => true, byLightnessAsc);
  if (hair) {
    result.hair = hair.entry.hex;
    result.brow = hair.entry.hex;
  }
  const iris = pick(pool, () => true, byLightnessAsc);
  if (iris) result.iris = iris.entry.hex;
  const top = pick(pool, () => true, byChromaDesc);
  if (top) result.top = top.entry.hex;
  const bottom = pick(pool, () => true, byWeightDesc);
  if (bottom) result.bottom = bottom.entry.hex;
  const shoes = pick(pool, () => true, byLightnessAsc);
  if (shoes) result.shoes = shoes.entry.hex;
  const accessory = pick(pool, () => true, byChromaDesc);
  if (accessory) result.accessory = accessory.entry.hex;
  return result;
}

/** 추천 결과 요약(한글): 슬롯별 1순위 프리셋 id와 점수 */
export function summarizeRecommendationsKo(result: PresetRecommendationResult): string {
  const lines: string[] = [];
  for (const slot of CHARACTER_SLOT_KINDS) {
    const first = result.recommendations[slot][0];
    if (first) lines.push(`${slot}: ${first.presetId} (${first.score.toFixed(3)})`);
  }
  const coverage = result.coverage;
  lines.push(`후보 ${coverage.candidates}/${coverage.total}개(썸네일 임베딩 없음 ${coverage.missing.length}개)`);
  return lines.join("\n");
}
