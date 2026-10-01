/**
 * 페인트 레이어: 부위(PartRole)별 RGBA8 straight 텍스처와 소프트 dab 스탬프, 타일 undo 토큰.
 *
 * 규약
 * - 레이어는 top-down 행 순서, straight alpha(contracts/paint.ts). UV v=0이 첫 행이다(glTF 텍스처 규약).
 * - dab 마스크: hardness 1 = 하드 엣지(0.5px 커버리지 AA), hardness 0 = 가우시안(σ = r/3),
 *   그 사이는 반지름×hardness 안쪽을 평탄하게 두고 바깥을 가우시안으로 감쇠(가장자리에서 정확히 0).
 * - 합성은 선형 공간 source-over(sRGB ↔ linear 변환, Porter-Duff 1984 straight alpha 식).
 * - undo 토큰은 PAINT_TILE_SIZE(64px) 타일의 변경 전 바이트다. 한 스트로크에서 같은 타일은 한 번만 스냅샷한다.
 */
import { PAINT_LAYER_DEFAULT_SIZE, PAINT_TILE_SIZE } from "../contracts";
import { linearToSrgb, parseHex, srgbToLinear } from "../shared/color";

import type { BrushDab, BrushSettings, PaintLayer, PaintUndoTile, PaintUndoToken, PartRole } from "../contracts";

/** 구현 측이 revision을 올릴 수 있는 레이어(엔진 포트에는 PaintLayer로 넘긴다). */
export interface MutablePaintLayer extends PaintLayer {
  revision: number;
}

/** 랩 모드에서 dab 반지름이 레이어 절반을 넘으면 같은 픽셀을 두 번 칠하므로 상한을 둔다. */
export const MAX_BRUSH_RADIUS_PX = 256;
export const MIN_BRUSH_RADIUS_PX = 0.5;

/** 가우시안 감쇠 계수: exp(-4.5·t²)는 t=1에서 0.011 — 이를 빼서 가장자리를 정확히 0으로 만든다. */
const GAUSS_K = 4.5;
const GAUSS_EDGE = Math.exp(-GAUSS_K);

const SRGB_TO_LINEAR_LUT: Float32Array = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** [0,1) 랩(음수·1 이상도 처리) */
export function wrapUnit(value: number): number {
  const wrapped = value - Math.floor(value);
  return wrapped >= 1 ? 0 : wrapped;
}

export function createPaintLayer(part: PartRole, width = PAINT_LAYER_DEFAULT_SIZE, height = width): MutablePaintLayer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`createPaintLayer: 크기 ${width}×${height}는 양의 정수여야 합니다.`);
  }
  return { part, width, height, rgba: new Uint8ClampedArray(width * height * 4), revision: 0 };
}

export function clonePaintLayer(layer: PaintLayer): MutablePaintLayer {
  return { part: layer.part, width: layer.width, height: layer.height, rgba: new Uint8ClampedArray(layer.rgba), revision: layer.revision };
}

/** 레이어에 칠해진 픽셀(alpha>0)이 하나라도 있는지 */
export function isPaintLayerEmpty(layer: PaintLayer): boolean {
  for (let i = 3; i < layer.rgba.length; i += 4) if (layer.rgba[i] !== 0) return false;
  return true;
}

/**
 * dab 마스크(0..1). distancePx = 픽셀 중심과 dab 중심 거리.
 * hardness ≥ 1: 하드 엣지(반지름 경계 0.5px 커버리지 AA). hardness 0: 가우시안(σ=r/3), r에서 0.
 */
export function dabMask(distancePx: number, radiusPx: number, hardness: number): number {
  if (radiusPx <= 0 || distancePx < 0) return 0;
  if (hardness >= 1) return clamp01(radiusPx + 0.5 - distancePx);
  const d = distancePx / radiusPx;
  if (d >= 1) return 0;
  const inner = clamp01(hardness);
  const t = d <= inner ? 0 : (d - inner) / (1 - inner);
  return (Math.exp(-GAUSS_K * t * t) - GAUSS_EDGE) / (1 - GAUSS_EDGE);
}

/** 브러시 색을 선형 RGB로. 형식이 틀리면 throw(무음 기본색 금지). */
export function brushLinearColor(color: string): readonly [number, number, number] {
  const parsed = parseHex(color);
  if (!parsed) throw new Error(`브러시 색 "${color}"은 소문자 #rrggbb 형식이어야 합니다.`);
  return [SRGB_TO_LINEAR_LUT[parsed[0]] ?? 0, SRGB_TO_LINEAR_LUT[parsed[1]] ?? 0, SRGB_TO_LINEAR_LUT[parsed[2]] ?? 0];
}

function linearToByte(value: number): number {
  return Math.round(linearToSrgb(value) * 255);
}

/**
 * 한 픽셀에 선형 공간 source-over 합성(제자리). src는 선형 RGB, sa는 source alpha 0..1.
 */
export function compositePixelLinear(rgba: Uint8ClampedArray, index: number, src: readonly [number, number, number], sa: number): void {
  if (sa <= 0) return;
  const da = (rgba[index + 3] ?? 0) / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  const dw = (da * (1 - sa)) / outA;
  const sw = sa / outA;
  const dr = SRGB_TO_LINEAR_LUT[rgba[index] ?? 0] ?? 0;
  const dg = SRGB_TO_LINEAR_LUT[rgba[index + 1] ?? 0] ?? 0;
  const db = SRGB_TO_LINEAR_LUT[rgba[index + 2] ?? 0] ?? 0;
  rgba[index] = linearToByte(src[0] * sw + dr * dw);
  rgba[index + 1] = linearToByte(src[1] * sw + dg * dw);
  rgba[index + 2] = linearToByte(src[2] * sw + db * dw);
  rgba[index + 3] = Math.round(outA * 255);
}

// ---------------------------------------------------------------- 타일 스냅샷(undo)

export interface TileSnapshotSet {
  readonly layer: PaintLayer;
  /** "tx,ty" → 변경 전 타일 */
  readonly tiles: Map<string, PaintUndoTile>;
}

export function createTileSnapshotSet(layer: PaintLayer): TileSnapshotSet {
  return { layer, tiles: new Map() };
}

/** 타일 크기(가장자리 타일은 잘린 크기) */
export function tileExtent(layer: Pick<PaintLayer, "width" | "height">, tx: number, ty: number): { x: number; y: number; w: number; h: number } {
  const x = tx * PAINT_TILE_SIZE;
  const y = ty * PAINT_TILE_SIZE;
  return { x, y, w: Math.min(PAINT_TILE_SIZE, layer.width - x), h: Math.min(PAINT_TILE_SIZE, layer.height - y) };
}

function copyTile(layer: PaintLayer, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const srcStart = ((y + row) * layer.width + x) * 4;
    data.set(layer.rgba.subarray(srcStart, srcStart + w * 4), row * w * 4);
  }
  return data;
}

/** 아직 스냅샷하지 않은 타일이면 변경 전 바이트를 저장한다. */
export function snapshotTile(set: TileSnapshotSet, tx: number, ty: number): void {
  const key = `${tx},${ty}`;
  if (set.tiles.has(key)) return;
  const { x, y, w, h } = tileExtent(set.layer, tx, ty);
  if (w <= 0 || h <= 0) return;
  set.tiles.set(key, { x, y, data: copyTile(set.layer, x, y, w, h) });
}

/** 레이어의 모든 타일을 스냅샷한다(레이어 비우기 등 전체 변경의 undo용). */
export function snapshotAllTiles(set: TileSnapshotSet): void {
  const tilesX = Math.ceil(set.layer.width / PAINT_TILE_SIZE);
  const tilesY = Math.ceil(set.layer.height / PAINT_TILE_SIZE);
  for (let ty = 0; ty < tilesY; ty += 1) for (let tx = 0; tx < tilesX; tx += 1) snapshotTile(set, tx, ty);
}

/** 스냅샷을 undo 토큰으로(타일은 y,x 순 정렬 — 결정적). */
export function toUndoToken(set: TileSnapshotSet): PaintUndoToken {
  const tiles = [...set.tiles.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  return { part: set.layer.part, tiles, tileSize: PAINT_TILE_SIZE };
}

/** 여러 토큰을 하나로(같은 타일은 먼저 나온 토큰 우선 = 가장 이른 변경 전 상태). */
export function mergeUndoTokens(tokens: readonly PaintUndoToken[]): PaintUndoToken | null {
  const first = tokens[0];
  if (!first) return null;
  const seen = new Map<string, PaintUndoTile>();
  for (const token of tokens) {
    if (token.part !== first.part) throw new Error(`mergeUndoTokens: 부위가 다른 토큰(${token.part} ≠ ${first.part})은 합칠 수 없습니다.`);
    for (const tile of token.tiles) {
      const key = `${tile.x},${tile.y}`;
      if (!seen.has(key)) seen.set(key, tile);
    }
  }
  const tiles = [...seen.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  return { part: first.part, tiles, tileSize: PAINT_TILE_SIZE };
}

/**
 * 토큰의 타일을 레이어에 되돌리고(undo) 되돌리기 전 상태를 담은 역토큰(redo용)을 돌려준다.
 * 부위·범위가 맞지 않으면 throw한다(무음 손상 금지).
 */
export function applyUndoToken(layer: MutablePaintLayer, token: PaintUndoToken): PaintUndoToken {
  if (token.part !== layer.part) {
    throw new Error(`applyUndoToken: 토큰 부위(${token.part})가 레이어 부위(${layer.part})와 다릅니다.`);
  }
  const inverse: PaintUndoTile[] = [];
  for (const tile of token.tiles) {
    const w = Math.min(PAINT_TILE_SIZE, layer.width - tile.x);
    const h = Math.min(PAINT_TILE_SIZE, layer.height - tile.y);
    if (tile.x < 0 || tile.y < 0 || w <= 0 || h <= 0 || tile.x % PAINT_TILE_SIZE !== 0 || tile.y % PAINT_TILE_SIZE !== 0) {
      throw new Error(`applyUndoToken: 타일 (${tile.x},${tile.y})이 레이어 ${layer.width}×${layer.height} 범위를 벗어납니다.`);
    }
    if (tile.data.length !== w * h * 4) {
      throw new Error(`applyUndoToken: 타일 (${tile.x},${tile.y}) 데이터 길이 ${tile.data.length} ≠ ${w * h * 4}.`);
    }
    inverse.push({ x: tile.x, y: tile.y, data: copyTile(layer, tile.x, tile.y, w, h) });
    for (let row = 0; row < h; row += 1) {
      layer.rgba.set(tile.data.subarray(row * w * 4, (row + 1) * w * 4), ((tile.y + row) * layer.width + tile.x) * 4);
    }
  }
  layer.revision += 1;
  return { part: token.part, tiles: inverse, tileSize: PAINT_TILE_SIZE };
}

// ---------------------------------------------------------------- dab 스탬프

export interface StampOptions {
  /** UV 경계를 넘는 dab을 반대편으로 감는다(기본 true). */
  readonly wrap?: boolean;
  /** 스트로크 단위로 공유하는 스냅샷(없으면 dab 하나가 토큰 하나). */
  readonly snapshots?: TileSnapshotSet;
}

/** 랩 모드에서 유효 반지름(레이어 절반 미만으로 제한) */
export function effectiveRadius(brush: Pick<BrushSettings, "radiusPx">, layer: Pick<PaintLayer, "width" | "height">, wrap: boolean): number {
  const radius = Math.min(MAX_BRUSH_RADIUS_PX, Math.max(MIN_BRUSH_RADIUS_PX, brush.radiusPx));
  if (!wrap) return radius;
  return Math.min(radius, Math.max(MIN_BRUSH_RADIUS_PX, (Math.min(layer.width, layer.height) - 2) / 2));
}

/**
 * dab 하나를 레이어에 스탬프한다(제자리). alpha = opacity × pressure × mask. 돌려주는 토큰은
 * 이 dab이 새로 건드린 타일(공유 스냅샷이 있으면 이미 저장된 타일 제외)의 변경 전 상태다.
 */
export function stampDab(layer: MutablePaintLayer, dab: BrushDab, brush: BrushSettings, options: StampOptions = {}): PaintUndoToken {
  const wrap = options.wrap ?? true;
  const { width, height, rgba } = layer;
  const radius = effectiveRadius(brush, layer, wrap);
  const strength = clamp01(brush.opacity) * clamp01(dab.pressure);
  const color = brushLinearColor(brush.color);
  const cx = (wrap ? wrapUnit(dab.u) : dab.u) * width;
  const cy = (wrap ? wrapUnit(dab.v) : dab.v) * height;
  const snapshots = options.snapshots ?? createTileSnapshotSet(layer);
  const touched = new Map<string, PaintUndoTile>();

  const x0 = Math.floor(cx - radius - 1);
  const x1 = Math.ceil(cx + radius + 1);
  const y0 = Math.floor(cy - radius - 1);
  const y1 = Math.ceil(cy + radius + 1);
  for (let py = y0; py <= y1; py += 1) {
    const y = wrap ? ((py % height) + height) % height : py;
    if (y < 0 || y >= height) continue;
    const dy = py + 0.5 - cy;
    for (let px = x0; px <= x1; px += 1) {
      const x = wrap ? ((px % width) + width) % width : px;
      if (x < 0 || x >= width) continue;
      const dx = px + 0.5 - cx;
      const mask = dabMask(Math.sqrt(dx * dx + dy * dy), radius, brush.hardness);
      if (mask <= 0) continue;
      const sa = strength * mask;
      if (sa <= 0) continue;
      const tx = Math.floor(x / PAINT_TILE_SIZE);
      const ty = Math.floor(y / PAINT_TILE_SIZE);
      const key = `${tx},${ty}`;
      if (!snapshots.tiles.has(key)) {
        snapshotTile(snapshots, tx, ty);
        const tile = snapshots.tiles.get(key);
        if (tile) touched.set(key, tile);
      }
      compositePixelLinear(rgba, (y * width + x) * 4, color, sa);
    }
  }
  layer.revision += 1;
  const tiles = [...touched.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  return { part: layer.part, tiles, tileSize: PAINT_TILE_SIZE };
}

/** 픽셀 RGBA 읽기(테스트·패널 미리보기용) */
export function readPixel(layer: PaintLayer, x: number, y: number): readonly [number, number, number, number] {
  const i = (y * layer.width + x) * 4;
  return [layer.rgba[i] ?? 0, layer.rgba[i + 1] ?? 0, layer.rgba[i + 2] ?? 0, layer.rgba[i + 3] ?? 0];
}
