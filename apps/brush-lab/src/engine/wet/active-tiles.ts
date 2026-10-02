import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";

import { WET_CH, WET_EXT_CH, WET_FLOATS_PER_TILE } from "./state";

import type { WetState } from "./state";
import type { BinResult } from "../raster/tile-binning";

/**
 * 활성 타일 관리와 Jacobi 읽기용 스냅샷.
 * - 활성 집합 밖의 타일과는 플럭스를 교환하지 않는다(no-flux 경계) → 질량 보존.
 * - 경계 픽셀에 물이 있으면 이웃을 활성화해 다음 스텝에 흐르게 한다.
 */

export const WET_EPS = 1e-4;

function activate(state: WetState, tile: number): void {
  // 새 습식 물리는 확장 풀(흐름층 분포·모세관층·경화 카운터)이 필요하므로 코어와 함께 할당한다.
  state.ensureExt(tile);
  state.active.add(tile);
}

/** dirty 타일 + 8이웃(1링)을 활성화하고 오름차순 목록을 돌려준다. */
export function activeTilesAfterDeposit(state: WetState, bin: BinResult): number[] {
  for (let i = 0; i < bin.dirtyCount; i += 1) {
    const t = bin.dirtyTiles[i] ?? 0;
    const tx = t % state.tilesX;
    const ty = Math.floor(t / state.tilesX);
    for (let oy = -1; oy <= 1; oy += 1) {
      const ny = ty + oy;
      if (ny < 0 || ny >= state.tilesY) continue;
      for (let ox = -1; ox <= 1; ox += 1) {
        const nx = tx + ox;
        if (nx < 0 || nx >= state.tilesX) continue;
        activate(state, ny * state.tilesX + nx);
      }
    }
  }
  return sortedActive(state);
}

export function sortedActive(state: WetState): number[] {
  return Array.from(state.active).sort((a, b) => a - b);
}

/**
 * 경계 픽셀에 물(표면 + 흐름층)이 있는 활성 타일의 4이웃을, 모서리 셀에 물이 있으면 대각 이웃도 활성화한다
 * (LBM은 대각 방향으로도 한 셀씩 흐른다).
 */
export function expandActive(state: WetState): void {
  const TP = TILE_PIXELS;
  const TS = TILE_SIZE;
  const toAdd: number[] = [];
  const last = TS - 1;
  for (const tile of state.active) {
    const slot = state.pool.slotOf(tile);
    if (slot === undefined) continue;
    const data = state.pool.view(slot);
    const eSlot = state.ext ? state.ext.slotOf(tile) : undefined;
    const ext = state.ext && eSlot !== undefined ? state.ext.view(eSlot) : null;
    const w = WET_CH.water * TP;
    const r = WET_EXT_CH.rho * TP;
    const wet = (cell: number): boolean => (data[w + cell] ?? 0) + (ext ? (ext[r + cell] ?? 0) : 0) > WET_EPS;
    const tx = tile % state.tilesX;
    const ty = Math.floor(tile / state.tilesX);
    let left = false;
    let right = false;
    let up = false;
    let down = false;
    for (let i = 0; i < TS; i += 1) {
      if (wet(i * TS)) left = true;
      if (wet(i * TS + last)) right = true;
      if (wet(i)) up = true;
      if (wet(last * TS + i)) down = true;
    }
    if (left && tx > 0) toAdd.push(tile - 1);
    if (right && tx < state.tilesX - 1) toAdd.push(tile + 1);
    if (up && ty > 0) toAdd.push(tile - state.tilesX);
    if (down && ty < state.tilesY - 1) toAdd.push(tile + state.tilesX);
    if (wet(0) && tx > 0 && ty > 0) toAdd.push(tile - state.tilesX - 1);
    if (wet(last) && tx < state.tilesX - 1 && ty > 0) toAdd.push(tile - state.tilesX + 1);
    if (wet(last * TS) && tx > 0 && ty < state.tilesY - 1) toAdd.push(tile + state.tilesX - 1);
    if (wet(last * TS + last) && tx < state.tilesX - 1 && ty < state.tilesY - 1) toAdd.push(tile + state.tilesX + 1);
  }
  for (const t of toAdd) activate(state, t);
}

export interface WetSnapshot {
  tiles: Map<number, Float32Array>;
  tilesX: number;
  tilesY: number;
}

/** 활성 타일 데이터를 복사한다(Jacobi 읽기 전용). */
export function snapshotActive(state: WetState): WetSnapshot {
  const tiles = new Map<number, Float32Array>();
  for (const tile of state.active) {
    const slot = state.pool.slotOf(tile);
    if (slot === undefined) continue;
    tiles.set(tile, new Float32Array(state.pool.view(slot)));
  }
  return { tiles, tilesX: state.tilesX, tilesY: state.tilesY };
}

/**
 * 타일 tile의 (lx, ly)(−1..16 허용)에서 채널 ch 값을 읽는다.
 * 이웃이 활성 집합 밖이면 null(no-flux).
 */
export function readCell(snap: WetSnapshot, tile: number, lx: number, ly: number, ch: number): number | null {
  let t = tile;
  let x = lx;
  let y = ly;
  if (x < 0) {
    if (t % snap.tilesX === 0) return null;
    t -= 1;
    x += TILE_SIZE;
  } else if (x >= TILE_SIZE) {
    if (t % snap.tilesX === snap.tilesX - 1) return null;
    t += 1;
    x -= TILE_SIZE;
  }
  if (y < 0) {
    if (t < snap.tilesX) return null;
    t -= snap.tilesX;
    y += TILE_SIZE;
  } else if (y >= TILE_SIZE) {
    if (t >= snap.tilesX * (snap.tilesY - 1)) return null;
    t += snap.tilesX;
    y -= TILE_SIZE;
  }
  const data = snap.tiles.get(t);
  if (!data) return null;
  return data[ch * TILE_PIXELS + y * TILE_SIZE + x] ?? 0;
}

/** 채널 ch의 타일 내 오프셋. */
export function chOffset(ch: number): number {
  return ch * TILE_PIXELS;
}

/**
 * 타일과 4이웃 타일의 스냅샷 배열(gather 커널의 핫루프용). 이웃이 활성 집합 밖이면 null(no-flux).
 * `readCell`과 같은 의미지만 Map 조회를 타일당 1회로 줄인다.
 */
export interface TileNeighbors {
  tile: number;
  c: Float32Array;
  l: Float32Array | null;
  r: Float32Array | null;
  u: Float32Array | null;
  d: Float32Array | null;
  /** 이웃 타일 번호(없으면 −1). */
  lt: number;
  rt: number;
  ut: number;
  dt: number;
}

export function neighborsOf(snap: WetSnapshot, tile: number): TileNeighbors | null {
  const c = snap.tiles.get(tile);
  if (!c) return null;
  const tx = tile % snap.tilesX;
  const ty = Math.floor(tile / snap.tilesX);
  const lt = tx > 0 ? tile - 1 : -1;
  const rt = tx < snap.tilesX - 1 ? tile + 1 : -1;
  const ut = ty > 0 ? tile - snap.tilesX : -1;
  const dt = ty < snap.tilesY - 1 ? tile + snap.tilesX : -1;
  return {
    tile,
    c,
    l: lt >= 0 ? (snap.tiles.get(lt) ?? null) : null,
    r: rt >= 0 ? (snap.tiles.get(rt) ?? null) : null,
    u: ut >= 0 ? (snap.tiles.get(ut) ?? null) : null,
    d: dt >= 0 ? (snap.tiles.get(dt) ?? null) : null,
    lt,
    rt,
    ut,
    dt,
  };
}

/**
 * 타일 로컬 (lx, ly)(한 좌표만 −1 또는 16까지 벗어날 수 있음)의 채널 오프셋 chOff 값.
 * 이웃 타일이 활성 집합 밖이면 null. `readCell(snap, tile, lx, ly, ch)`와 같은 값.
 */
export function readNeighbor(nb: TileNeighbors, lx: number, ly: number, chOff: number): number | null {
  if (lx < 0) return nb.l ? (nb.l[chOff + ly * TILE_SIZE + TILE_SIZE - 1] ?? 0) : null;
  if (lx >= TILE_SIZE) return nb.r ? (nb.r[chOff + ly * TILE_SIZE] ?? 0) : null;
  if (ly < 0) return nb.u ? (nb.u[chOff + (TILE_SIZE - 1) * TILE_SIZE + lx] ?? 0) : null;
  if (ly >= TILE_SIZE) return nb.d ? (nb.d[chOff + lx] ?? 0) : null;
  return nb.c[chOff + ly * TILE_SIZE + lx] ?? 0;
}

export const WET_TILE_FLOATS = WET_FLOATS_PER_TILE;
