/**
 * 참고 이미지 추천 오케스트레이션(순수, 임베딩 함수 주입).
 * LabState.thumbnails의 ready 래스터를 임베딩(캐시 키 = ThumbnailEntry.cacheKey)하고 참고 이미지 임베딩과 비교해
 * 슬롯별 추천을 만든다. 썸네일이 아직 없거나 실패한 프리셋은 후보에서 빠지고 사유 목록으로 노출한다.
 */
import { opaqueRatio, rasterToRgbaImage } from "./image-sampling";
import { recommendPresets } from "./recommend";

import type { PresetRecommendationResult } from "./recommend";
import type { CapturedRaster, Embedding, PresetCatalog, PresetId, ThumbnailEntry } from "../../contracts";

export interface ThumbnailEmbeddingCache {
  get(key: string): Embedding | undefined;
  set(key: string, embedding: Embedding): void;
  readonly size: number;
  clear(): void;
}

/** 단순 LRU(Map 삽입 순서) 캐시 */
export function createThumbnailEmbeddingCache(limit = 512): ThumbnailEmbeddingCache {
  const map = new Map<string, Embedding>();
  return {
    get(key) {
      const value = map.get(key);
      if (value) {
        map.delete(key);
        map.set(key, value);
      }
      return value;
    },
    set(key, embedding) {
      map.delete(key);
      map.set(key, embedding);
      while (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    get size() {
      return map.size;
    },
    clear() {
      map.clear();
    },
  };
}

export type EmbedRaster = (raster: CapturedRaster) => Promise<Embedding>;

export interface SkippedThumbnail {
  readonly presetId: PresetId;
  readonly reasonKo: string;
}

export interface EmbedThumbnailsResult {
  readonly embeddings: Readonly<Partial<Record<PresetId, Embedding>>>;
  readonly embedded: number;
  readonly reused: number;
  readonly skipped: readonly SkippedThumbnail[];
}

export interface EmbedThumbnailsOptions {
  /** 불투명 비율이 이 값 미만인(거의 투명한) 썸네일은 제외(기본 0.02) */
  readonly minOpaqueRatio?: number;
  readonly onProgress?: (done: number, total: number) => void;
}

/** ready 썸네일을 임베딩한다(캐시 적중은 재사용). 임베딩 실패는 해당 프리셋만 건너뛰고 사유를 남긴다. */
export async function embedThumbnails(
  thumbnails: Readonly<Record<string, ThumbnailEntry>>,
  embedRaster: EmbedRaster,
  cache: ThumbnailEmbeddingCache,
  options: EmbedThumbnailsOptions = {},
): Promise<EmbedThumbnailsResult> {
  const minOpaque = options.minOpaqueRatio ?? 0.02;
  const embeddings: Partial<Record<PresetId, Embedding>> = {};
  const skipped: SkippedThumbnail[] = [];
  let embedded = 0;
  let reused = 0;
  const entries = Object.entries(thumbnails) as Array<[PresetId, ThumbnailEntry]>;
  let done = 0;
  for (const [presetId, entry] of entries) {
    done += 1;
    if (entry.status === "pending") {
      skipped.push({ presetId, reasonKo: "썸네일 생성 중" });
    } else if (entry.status === "failed" || !entry.raster) {
      skipped.push({ presetId, reasonKo: entry.reasonKo ? `썸네일 실패: ${entry.reasonKo}` : "썸네일 래스터 없음" });
    } else {
      const cached = cache.get(entry.cacheKey);
      if (cached) {
        embeddings[presetId] = cached;
        reused += 1;
      } else if (opaqueRatio(rasterToRgbaImage(entry.raster)) < minOpaque) {
        skipped.push({ presetId, reasonKo: "썸네일이 거의 투명해 임베딩하지 않았습니다." });
      } else {
        try {
          const embedding = await embedRaster(entry.raster);
          cache.set(entry.cacheKey, embedding);
          embeddings[presetId] = embedding;
          embedded += 1;
        } catch (error) {
          skipped.push({ presetId, reasonKo: `임베딩 실패: ${error instanceof Error ? error.message : String(error)}` });
        }
      }
    }
    options.onProgress?.(done, entries.length);
  }
  return { embeddings, embedded, reused, skipped };
}

export interface ReferenceRecommendationArgs {
  readonly queryEmbedding: Embedding;
  readonly thumbnails: Readonly<Record<string, ThumbnailEntry>>;
  readonly catalog: PresetCatalog;
  readonly embedRaster: EmbedRaster;
  readonly cache: ThumbnailEmbeddingCache;
  readonly k?: number;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface ReferenceRecommendation extends PresetRecommendationResult {
  readonly thumbnails: EmbedThumbnailsResult;
}

/** 참고 이미지 임베딩 + 썸네일 임베딩 → 슬롯별 추천 */
export async function recommendFromReference(args: ReferenceRecommendationArgs): Promise<ReferenceRecommendation> {
  const thumbnails = await embedThumbnails(args.thumbnails, args.embedRaster, args.cache, { onProgress: args.onProgress });
  const result = recommendPresets(args.queryEmbedding, thumbnails.embeddings, args.catalog, args.k);
  return { ...result, thumbnails };
}
