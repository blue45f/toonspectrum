/** Tiled mixed Wang 순서와 같은 N, NE, E, SE, S, SW, W, NW 순서다. */
export const STUDIO_AUTOTILE_NEIGHBORS = Object.freeze([
  { bit: 1, x: 0, y: -1 }, { bit: 2, x: 1, y: -1 },
  { bit: 4, x: 1, y: 0 }, { bit: 8, x: 1, y: 1 },
  { bit: 16, x: 0, y: 1 }, { bit: 32, x: -1, y: 1 },
  { bit: 64, x: -1, y: 0 }, { bit: 128, x: -1, y: -1 },
].map((neighbor) => Object.freeze(neighbor)));

function requireMask(mask: number): void {
  if (!Number.isInteger(mask) || mask < 0 || mask > 255) {
    throw new RangeError("Autotile mask must be an unsigned byte");
  }
}

/** 대각선은 양쪽 직교 이웃이 모두 이어질 때만 같은 지형의 모서리를 연결한다. */
export function normalizeStudioAutotileMask(mask: number): number {
  requireMask(mask);
  let result = mask;
  if ((mask & 5) !== 5) result &= ~2;
  if ((mask & 20) !== 20) result &= ~8;
  if ((mask & 80) !== 80) result &= ~32;
  if ((mask & 65) !== 65) result &= ~128;
  return result;
}

/** 오름차순을 계약으로 고정한다. 이 순서는 아트 파일의 실제 셀 배치를 뜻하지 않는다. */
export const STUDIO_AUTOTILE_CANONICAL_MASKS: readonly number[] = Object.freeze(
  Array.from({ length: 256 }, (_, mask) => mask).filter((mask) => normalizeStudioAutotileMask(mask) === mask),
);
const canonicalFrames = new Map(STUDIO_AUTOTILE_CANONICAL_MASKS.map((mask, frame) => [mask, frame]));

export function studioAutotileFrame(mask: number): number {
  const frame = canonicalFrames.get(normalizeStudioAutotileMask(mask));
  if (frame === undefined) throw new Error("Autotile canonical frame is missing");
  return frame;
}

export interface StudioAutotileTerrainGrid<T extends string | number> {
  readonly width: number;
  readonly height: number;
  /** 행 우선 순서다. null은 빈칸이며 숫자 0은 유효한 지형 식별자다. */
  readonly cells: readonly (T | null)[];
}

/** 경계 밖과 빈 이웃은 연결되지 않는다. 중심이 해당 지형이 아니면 타일을 선택하지 않는다. */
export function studioAutotileMaskAt<T extends string | number>(
  grid: StudioAutotileTerrainGrid<T>,
  column: number,
  row: number,
  terrain: T,
): number | null {
  if (!Number.isSafeInteger(grid.width) || grid.width < 1 || !Number.isSafeInteger(grid.height) || grid.height < 1
    || !Number.isSafeInteger(grid.width * grid.height) || grid.cells.length !== grid.width * grid.height) {
    throw new RangeError("Autotile grid must contain every cell in a finite rectangle");
  }
  if (!Number.isSafeInteger(column) || !Number.isSafeInteger(row)) throw new RangeError("Autotile coordinates must be integers");
  if (typeof terrain === "number" && !Number.isFinite(terrain)) throw new RangeError("Autotile terrain must be finite");
  const matches = (x: number, y: number) => x >= 0 && y >= 0 && x < grid.width && y < grid.height
    && grid.cells[y * grid.width + x] === terrain;
  if (!matches(column, row)) return null;
  let mask = 0;
  for (const neighbor of STUDIO_AUTOTILE_NEIGHBORS) {
    if (matches(column + neighbor.x, row + neighbor.y)) mask |= neighbor.bit;
  }
  return normalizeStudioAutotileMask(mask);
}

export interface StudioAutotileFrameBinding {
  readonly mask: number;
  /** 스프라이트시트 안의 로컬 프레임 번호다. Tiled GID나 canonical 순번과 구분한다. */
  readonly frame: number;
}

export interface StudioAutotileAtlas {
  readonly bindings: readonly StudioAutotileFrameBinding[];
  readonly frameForMask: (mask: number) => number;
}

/** 제작된 47개 전환 타일을 명시적으로 바인딩한다. 누락된 아트를 다른 타일로 대체하지 않는다. */
export function createStudioAutotileAtlas(
  bindings: readonly StudioAutotileFrameBinding[],
  frameCount: number,
): StudioAutotileAtlas {
  if (!Number.isSafeInteger(frameCount) || frameCount < 47) throw new RangeError("Autotile atlas requires at least 47 frames");
  const frames = new Map<number, number>();
  const usedFrames = new Set<number>();
  for (const binding of bindings) {
    if (normalizeStudioAutotileMask(binding.mask) !== binding.mask) throw new Error("Autotile atlas mask must be canonical");
    if (!Number.isSafeInteger(binding.frame) || binding.frame < 0 || binding.frame >= frameCount) {
      throw new RangeError("Autotile atlas frame is out of bounds");
    }
    if (frames.has(binding.mask) || usedFrames.has(binding.frame)) throw new Error("Autotile atlas contains a duplicate mask or frame");
    frames.set(binding.mask, binding.frame);
    usedFrames.add(binding.frame);
  }
  if (frames.size !== STUDIO_AUTOTILE_CANONICAL_MASKS.length) throw new Error("Autotile atlas must cover all 47 masks");
  const frameForMask = (mask: number): number => {
    const frame = frames.get(normalizeStudioAutotileMask(mask));
    if (frame === undefined) throw new Error("Autotile atlas frame is missing");
    return frame;
  };
  return Object.freeze({
    bindings: Object.freeze(STUDIO_AUTOTILE_CANONICAL_MASKS.map((mask) => Object.freeze({ mask, frame: frameForMask(mask) }))),
    frameForMask,
  });
}

function requireWangColors(terrainIndex: number, backgroundIndex: number): void {
  if (!Number.isInteger(terrainIndex) || terrainIndex < 1 || terrainIndex > 254
    || !Number.isInteger(backgroundIndex) || backgroundIndex < 0 || backgroundIndex > 254
    || terrainIndex === backgroundIndex) throw new RangeError("Wang colors must be distinct Tiled color indexes");
}

/** https://doc.mapeditor.org/en/stable/reference/tmx-map-format/#wangtile 의 시계방향 순서를 따른다. */
export function studioAutotileWangId(mask: number, terrainIndex = 1, backgroundIndex = 0): readonly number[] {
  requireWangColors(terrainIndex, backgroundIndex);
  const normalized = normalizeStudioAutotileMask(mask);
  return Object.freeze(STUDIO_AUTOTILE_NEIGHBORS.map(({ bit }) => normalized & bit ? terrainIndex : backgroundIndex));
}

/** 외부 metadata의 모서리 오류는 조용히 정규화하지 않고 가져오기 단계에서 거절한다. */
export function studioAutotileMaskFromWangId(wangId: readonly number[], terrainIndex = 1, backgroundIndex = 0): number {
  requireWangColors(terrainIndex, backgroundIndex);
  if (wangId.length !== 8) throw new Error("Wang ID must contain eight color indexes");
  let mask = 0;
  for (const [index, color] of wangId.entries()) {
    if (color !== terrainIndex && color !== backgroundIndex) throw new Error("Wang ID contains an unrelated terrain");
    if (color === terrainIndex) mask |= 1 << index;
  }
  if (normalizeStudioAutotileMask(mask) !== mask) throw new Error("Wang ID is not a canonical blob pattern");
  return mask;
}

export interface StudioAutotileWangSet {
  readonly type: string;
  readonly wangtiles: readonly { readonly tileid: number; readonly wangid: readonly number[] }[];
}

/** 실제 Tiled mixed Wang metadata와 로컬 tileid를 연결한다. 텍스처나 픽셀은 생성하지 않는다. */
export function createStudioAutotileAtlasFromWangSet(
  set: StudioAutotileWangSet,
  tileCount: number,
  terrainIndex = 1,
  backgroundIndex = 0,
): StudioAutotileAtlas {
  if (set.type !== "mixed") throw new Error("Blob autotiles require a mixed Wang set");
  return createStudioAutotileAtlas(set.wangtiles.map((tile) => ({
    mask: studioAutotileMaskFromWangId(tile.wangid, terrainIndex, backgroundIndex), frame: tile.tileid,
  })), tileCount);
}
