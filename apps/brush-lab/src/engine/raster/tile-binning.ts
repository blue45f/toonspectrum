import { DAB_FIELD, DAB_FLOATS } from "../core/dab-layout";

import type { DabBatch } from "../core/dab-layout";
import type { DabInstance } from "../core/types";

/**
 * 타일 비닝 CPU 오라클. GPU bin-count/scan/scatter와 같은 CSR을 만든다.
 * refs는 타일 내 dab 인덱스 오름차순(안정 scatter 계약).
 */

export const TILE_SIZE = 16;
export const TILE_PIXELS = 256;
/** rgba f32 = 256 × 4. */
export const STROKE_FLOATS_PER_TILE = 1024;
export const MAX_TILES_PER_DAB_DEFAULT = 4096;

/** inclusive 타일 좌표 범위. */
export interface TileBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 페더 폭(px). WGSL `dab_tile_bounds`가 쓰는 AABB 여유와 같은 식:
 * feather = max(1, (1 − hardness)·min(rx, ry)); spray/airbrush는 산포 여유로 max(rx, ry)를 더한다.
 */
export function dabFeatherPx(dab: DabInstance): number {
  const rmin = Math.min(dab.rx, dab.ry);
  const feather = Math.max(1, (1 - dab.hardness) * rmin);
  const scatter = dab.deposition === "spray" || dab.deposition === "airbrush" ? Math.max(dab.rx, dab.ry) : 0;
  return feather + scatter;
}

/** dab AABB 반경(px) = max(rx, ry) + feather + 1(AA 여유). */
export function dabExtentPx(dab: DabInstance): number {
  return Math.max(dab.rx, dab.ry) + dabFeatherPx(dab) + 1;
}

/** dab가 겹치는 타일 범위. 캔버스 밖이면 null. WGSL `dab_tile_bounds` 미러. */
export function dabTileBounds(dab: DabInstance, tilesX: number, tilesY: number): TileBounds | null {
  const e = dabExtentPx(dab);
  const minX = dab.x - e;
  const maxX = dab.x + e;
  const minY = dab.y - e;
  const maxY = dab.y + e;
  const x0 = Math.max(0, Math.floor(minX / TILE_SIZE));
  const y0 = Math.max(0, Math.floor(minY / TILE_SIZE));
  const x1 = Math.min(tilesX - 1, Math.floor(maxX / TILE_SIZE));
  const y1 = Math.min(tilesY - 1, Math.floor(maxY / TILE_SIZE));
  if (x1 < x0 || y1 < y0) return null;
  return { x0, y0, x1, y1 };
}

export interface BinResult {
  /** 타일별 dab 수(tilesX·tilesY). */
  counts: Uint32Array;
  /** exclusive prefix sum(tilesX·tilesY + 1, 마지막은 총합). */
  offsets: Uint32Array;
  /** 타일 순·dab 인덱스 오름차순 CSR. */
  refs: Uint32Array;
  /** counts > 0인 타일 번호 오름차순. */
  dirtyTiles: Uint32Array;
  dirtyCount: number;
  /** maxTilesPerDab 초과로 건너뛴 dab 수(fail-visible). */
  overflowDabs: number;
}

/** 배치의 dab i에 대해 AABB 계산에 필요한 필드만 읽는다(unpack 비용 회피). */
function boundsOfPacked(
  data: Float32Array,
  i: number,
  tilesX: number,
  tilesY: number,
): TileBounds | null {
  const base = i * DAB_FLOATS;
  const x = data[base + DAB_FIELD.x] ?? 0;
  const y = data[base + DAB_FIELD.y] ?? 0;
  const rx = data[base + DAB_FIELD.rx] ?? 0;
  const ry = data[base + DAB_FIELD.ry] ?? 0;
  const hardness = data[base + DAB_FIELD.hardness] ?? 0;
  const u32 = new Uint32Array(data.buffer, data.byteOffset, data.length);
  const depositionId = (u32[base + DAB_FIELD.flags] ?? 0) >>> 24;
  const rmin = Math.min(rx, ry);
  const feather = Math.max(1, (1 - hardness) * rmin);
  // DEPOSITION_ID: airbrush 1, spray 2
  const scatter = depositionId === 1 || depositionId === 2 ? Math.max(rx, ry) : 0;
  const e = Math.max(rx, ry) + feather + scatter + 1;
  const x0 = Math.max(0, Math.floor((x - e) / TILE_SIZE));
  const y0 = Math.max(0, Math.floor((y - e) / TILE_SIZE));
  const x1 = Math.min(tilesX - 1, Math.floor((x + e) / TILE_SIZE));
  const y1 = Math.min(tilesY - 1, Math.floor((y + e) / TILE_SIZE));
  if (x1 < x0 || y1 < y0) return null;
  return { x0, y0, x1, y1 };
}

/** CSR 비닝. refs는 타일 내 dab 인덱스 오름차순. */
export function binDabs(
  batch: DabBatch,
  tilesX: number,
  tilesY: number,
  maxTilesPerDab = MAX_TILES_PER_DAB_DEFAULT,
): BinResult {
  const tileCount = tilesX * tilesY;
  const counts = new Uint32Array(tileCount);
  const data = batch.data;
  const n = batch.count;
  const boundsCache: (TileBounds | null)[] = new Array<TileBounds | null>(n);
  let overflowDabs = 0;
  for (let i = 0; i < n; i += 1) {
    const b = boundsOfPacked(data, i, tilesX, tilesY);
    if (!b) {
      boundsCache[i] = null;
      continue;
    }
    const span = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    if (span > maxTilesPerDab) {
      overflowDabs += 1;
      boundsCache[i] = null;
      continue;
    }
    boundsCache[i] = b;
    for (let ty = b.y0; ty <= b.y1; ty += 1) {
      const row = ty * tilesX;
      for (let tx = b.x0; tx <= b.x1; tx += 1) {
        counts[row + tx] = (counts[row + tx] ?? 0) + 1;
      }
    }
  }
  const offsets = new Uint32Array(tileCount + 1);
  let total = 0;
  let dirtyCount = 0;
  for (let t = 0; t < tileCount; t += 1) {
    offsets[t] = total;
    const c = counts[t] ?? 0;
    total += c;
    if (c > 0) dirtyCount += 1;
  }
  offsets[tileCount] = total;
  const refs = new Uint32Array(total);
  const cursor = new Uint32Array(tileCount);
  for (let i = 0; i < n; i += 1) {
    const b = boundsCache[i];
    if (!b) continue;
    for (let ty = b.y0; ty <= b.y1; ty += 1) {
      const row = ty * tilesX;
      for (let tx = b.x0; tx <= b.x1; tx += 1) {
        const t = row + tx;
        refs[(offsets[t] ?? 0) + (cursor[t] ?? 0)] = i;
        cursor[t] = (cursor[t] ?? 0) + 1;
      }
    }
  }
  const dirtyTiles = new Uint32Array(dirtyCount);
  let d = 0;
  for (let t = 0; t < tileCount; t += 1) {
    if ((counts[t] ?? 0) > 0) {
      dirtyTiles[d] = t;
      d += 1;
    }
  }
  return { counts, offsets, refs, dirtyTiles, dirtyCount, overflowDabs };
}

/** 타일 t의 dab 인덱스 목록(뷰). */
export function tileRefs(bin: BinResult, tile: number): Uint32Array {
  const start = bin.offsets[tile] ?? 0;
  const end = bin.offsets[tile + 1] ?? start;
  return bin.refs.subarray(start, end);
}
