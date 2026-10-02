import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";

import { PAD_CELLS, PAD_SIZE } from "./paper-wet";
import { WET_CH, WET_EXT_CH } from "./state";

import type { WetState } from "./state";

/**
 * 물 스텝용 1셀 헤일로 패딩 스냅샷(18×18). 한 서브스텝의 모든 활성 타일을 먼저 이 구조로 복사한 뒤(= 읽기 전용 이전 상태)
 * 타일을 순회하며 새 상태를 상태 풀에 쓴다. 읽기는 전부 스냅샷에서 하므로 타일 순회 순서가 결과에 영향을 주지 않는다.
 *
 * 채널(스냅샷 안): f0..f8(0..8), rho(9), ws(10), s(11), g r·g·b·mass(12..15), ux(16), uy(17), delta(18), b(19: 젖음 블러).
 * `valid[p]`가 0인 셀은 벽이다: 종이 가장자리(타일 격자 밖)이거나 활성 집합 밖 이웃 타일의 셀(no-slip, 플럭스 0).
 */
export const PCH = {
  f0: 0,
  rho: 9,
  ws: 10,
  s: 11,
  g0: 12,
  ux: 16,
  uy: 17,
  delta: 18,
  b: 19,
} as const;
export const PAD_CHANNELS = 20;

const TP = TILE_PIXELS;
const TS = TILE_SIZE;
const PS = PAD_SIZE;
const PC = PAD_CELLS;

export interface PaddedTile {
  tile: number;
  tx: number;
  ty: number;
  data: Float32Array;
  valid: Uint8Array;
}

function newPadded(): PaddedTile {
  return { tile: -1, tx: 0, ty: 0, data: new Float32Array(PAD_CHANNELS * PAD_CELLS), valid: new Uint8Array(PAD_CELLS) };
}

/** 재사용 풀(상태별): 서브스텝마다 새로 할당하지 않는다. */
const arenas = new WeakMap<WetState, PaddedTile[]>();

function arenaOf(state: WetState): PaddedTile[] {
  let a = arenas.get(state);
  if (!a) {
    a = [];
    arenas.set(state, a);
  }
  return a;
}

// 가져온 상수는 모듈 지역 값으로 복사한다(로더에 따라 가져온 바인딩 접근이 getter 호출이라 핫 루프에서 느리다).
const W_OFF = WET_CH.water * TP;
const VX_OFF = WET_CH.velocityX * TP;
const VY_OFF = WET_CH.velocityY * TP;
const G_OFF = WET_CH.pigmentR * TP;
const F0_OFF = WET_EXT_CH.lbm0 * TP;
const RHO_OFF = WET_EXT_CH.rho * TP;
const S_OFF = WET_EXT_CH.capillary * TP;
const B_OFF = WET_EXT_CH.wetBlur * TP;
const P_RHO = PCH.rho * PC;
const P_WS = PCH.ws * PC;
const P_S = PCH.s * PC;
const P_G0 = PCH.g0 * PC;
const P_UX = PCH.ux * PC;
const P_UY = PCH.uy * PC;
const P_DELTA = PCH.delta * PC;
const P_B = PCH.b * PC;

function fillRegion(out: PaddedTile, core: Float32Array, ext: Float32Array, dx: number, dy: number): void {
  const px0 = dx < 0 ? 0 : dx > 0 ? PS - 1 : 1;
  const px1 = dx === 0 ? PS - 2 : px0;
  const py0 = dy < 0 ? 0 : dy > 0 ? PS - 1 : 1;
  const py1 = dy === 0 ? PS - 2 : py0;
  const d = out.data;
  for (let py = py0; py <= py1; py += 1) {
    const ly = dy < 0 ? TS - 1 : dy > 0 ? 0 : py - 1;
    for (let px = px0; px <= px1; px += 1) {
      const lx = dx < 0 ? TS - 1 : dx > 0 ? 0 : px - 1;
      const si = ly * TS + lx;
      const di = py * PS + px;
      for (let q = 0; q < 9; q += 1) d[q * PC + di] = ext[F0_OFF + q * TP + si] ?? 0;
      d[P_RHO + di] = ext[RHO_OFF + si] ?? 0;
      d[P_WS + di] = core[W_OFF + si] ?? 0;
      d[P_S + di] = ext[S_OFF + si] ?? 0;
      for (let q = 0; q < 4; q += 1) d[P_G0 + q * PC + di] = core[G_OFF + q * TP + si] ?? 0;
      d[P_UX + di] = core[VX_OFF + si] ?? 0;
      d[P_UY + di] = core[VY_OFF + si] ?? 0;
      d[P_DELTA + di] = 0;
      d[P_B + di] = ext[B_OFF + si] ?? 0;
      out.valid[di] = 1;
    }
  }
}

/**
 * 활성 타일(오름차순)의 패딩 스냅샷을 만든다. 활성 집합 밖이거나 확장 풀이 없는 이웃은 벽(valid 0)으로 남는다.
 * 반환 맵은 다음 호출까지만 유효하다(풀 재사용).
 */
export function buildPaddedSnapshots(state: WetState, tiles: readonly number[]): Map<number, PaddedTile> {
  const arena = arenaOf(state);
  const out = new Map<number, PaddedTile>();
  const ext = state.ext;
  if (!ext) return out;
  for (let n = 0; n < tiles.length; n += 1) {
    const tile = tiles[n] ?? 0;
    let pt = arena[n];
    if (!pt) {
      pt = newPadded();
      arena[n] = pt;
    }
    pt.tile = tile;
    pt.tx = tile % state.tilesX;
    pt.ty = Math.floor(tile / state.tilesX);
    pt.data.fill(0);
    pt.valid.fill(0);
    out.set(tile, pt);
  }
  for (const pt of out.values()) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = pt.tx + dx;
        const ny = pt.ty + dy;
        if (nx < 0 || ny < 0 || nx >= state.tilesX || ny >= state.tilesY) continue;
        const nt = ny * state.tilesX + nx;
        if (nt !== pt.tile && !out.has(nt)) continue;
        const cs = state.pool.slotOf(nt);
        const es = ext.slotOf(nt);
        if (cs === undefined || es === undefined) continue;
        fillRegion(pt, state.pool.view(cs), ext.view(es), dx, dy);
      }
    }
  }
  return out;
}

/**
 * 에지 필드 Δ(Curtis FlowOutward 개념): 젖은 셀의 8이웃 중 마른(유효) 셀 비율. 젖음 전선 한 겹에서만 0이 아니다.
 * 타일 안쪽을 먼저 계산한 뒤 이웃 타일 값을 헤일로로 교환한다(2단계, 타일 순서 무관).
 */
export function computeEdgeDelta(snaps: Map<number, PaddedTile>, tilesX: number, rhoMin: number): void {
  const NEIGH = [-PS - 1, -PS, -PS + 1, -1, 1, PS - 1, PS, PS + 1];
  const wsOff = P_WS;
  const rhoOff = P_RHO;
  const dOff = P_DELTA;
  for (const pt of snaps.values()) {
    const d = pt.data;
    for (let ly = 0; ly < TS; ly += 1) {
      for (let lx = 0; lx < TS; lx += 1) {
        const p = (ly + 1) * PS + (lx + 1);
        if ((d[wsOff + p] ?? 0) + (d[rhoOff + p] ?? 0) <= rhoMin) continue;
        let dry = 0;
        for (let k = 0; k < 8; k += 1) {
          const q = p + (NEIGH[k] ?? 0);
          if (pt.valid[q] === 0) continue;
          if ((d[wsOff + q] ?? 0) + (d[rhoOff + q] ?? 0) <= rhoMin) dry += 1;
        }
        d[dOff + p] = dry * 0.125;
      }
    }
  }
  for (const pt of snaps.values()) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nb = snaps.get((pt.ty + dy) * tilesX + (pt.tx + dx));
        if (!nb || nb.tx !== pt.tx + dx || nb.ty !== pt.ty + dy) continue;
        const px0 = dx < 0 ? 0 : dx > 0 ? PS - 1 : 1;
        const px1 = dx === 0 ? PS - 2 : px0;
        const py0 = dy < 0 ? 0 : dy > 0 ? PS - 1 : 1;
        const py1 = dy === 0 ? PS - 2 : py0;
        for (let py = py0; py <= py1; py += 1) {
          const ly = dy < 0 ? TS - 1 : dy > 0 ? 0 : py - 1;
          for (let px = px0; px <= px1; px += 1) {
            const lx = dx < 0 ? TS - 1 : dx > 0 ? 0 : px - 1;
            pt.data[dOff + py * PS + px] = nb.data[dOff + (ly + 1) * PS + (lx + 1)] ?? 0;
          }
        }
      }
    }
  }
}
