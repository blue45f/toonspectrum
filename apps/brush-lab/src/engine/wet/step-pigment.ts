import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";
import { DEFAULT_PAPER_SPEC, samplePaper } from "../texture/paper-grain";

import { neighborsOf, readNeighbor, sortedActive, WET_EPS } from "./active-tiles";
import { WET_KERNEL } from "./params";
import { WET_CH } from "./state";

import type { TileNeighbors, WetSnapshot } from "./active-tiles";
import type { WetParams } from "./params";
import type { WetState } from "./state";
import type { PaperField } from "../texture/paper-grain";

/**
 * 안료 스텝(CPU 참조). 모두 gather 방식이라 유출·유입이 같은 식으로 계산돼 질량이 보존된다.
 * - 확산: 양쪽 모두 젖은 셀 사이에서 Dp = pigmentDiffusionScale·diffusion
 * - 에지 다크닝: 젖은 셀에서 더 마른 이웃으로 k·clamp((w_a − w_b)/(w_a + ε))·m_a 이류
 *   (k = edgeAdvectionScale·edgeDarkening). 물이 흐르는 방향(−∇water)으로 안료가 딸려가는 항이며,
 *   마른 이웃으로 넘어간 안료는 건조 스텝에서 바로 침착돼 가장자리에 모인다.
 * - 총 유출 비율은 0.5로 캡(비음수 보장)
 * - 그래뉼레이션: 젖은 셀에서 granulationScale·granulation·bump·m을 fixed로 침전
 * r, g, b는 mass와 같은 비율로 움직인다(색-질량 가중 표현).
 *
 * 구현: 1패스에서 활성 타일마다 셀별 4방향 유출 비율을 선계산하고, 2패스에서 자기 보유분 + 이웃 유입을 모은다.
 * GPU `wet_out_fractions`/`wet_step`과 같은 수식·합산 순서다.
 */

const f = Math.fround;
const MAX_OUT = 0.5;
const NEIGHBOR_DX = [-1, 1, 0, 0] as const;
const NEIGHBOR_DY = [0, 0, -1, 1] as const;
/** 이웃 n의 어느 유출 방향이 나에게 들어오는가: 왼쪽 이웃의 "오른쪽(1)" 유출 등. */
const INCOMING = [1, 0, 3, 2] as const;

/** 타일의 모든 셀에 대한 4방향 유출 비율(cell·4 + n). 마른 셀은 0. */
function tileOutFractions(nb: TileNeighbors, Dp: number, k: number): Float32Array {
  const out = new Float32Array(TILE_PIXELS * 4);
  const wOff = WET_CH.water * TILE_PIXELS;
  for (let ly = 0; ly < TILE_SIZE; ly += 1) {
    for (let lx = 0; lx < TILE_SIZE; lx += 1) {
      const i = ly * TILE_SIZE + lx;
      const w = nb.c[wOff + i] ?? 0;
      if (w <= WET_EPS) continue;
      const base = i * 4;
      let sum = 0;
      for (let n = 0; n < 4; n += 1) {
        const wn = readNeighbor(nb, lx + NEIGHBOR_DX[n], ly + NEIGHBOR_DY[n], wOff);
        if (wn === null) continue;
        let frac = 0;
        if (wn > WET_EPS) frac += Dp;
        const dw = w - wn;
        if (dw > 0) frac += k * Math.min(1, dw / (w + 1e-3));
        out[base + n] = frac;
        sum += frac;
      }
      if (sum > MAX_OUT) {
        const sc = MAX_OUT / sum;
        for (let n = 0; n < 4; n += 1) out[base + n] = (out[base + n] ?? 0) * sc;
      }
    }
  }
  return out;
}

/** 이웃 셀 (nx, ny)(한 좌표만 한 칸 벗어남)의 유출 비율 배열에서 방향 dir 값. 이웃 타일이 없으면 0. */
function neighborFrac(
  self: Float32Array,
  l: Float32Array | undefined,
  r: Float32Array | undefined,
  u: Float32Array | undefined,
  d: Float32Array | undefined,
  nx: number,
  ny: number,
  dir: number,
): number {
  if (nx < 0) return l ? (l[(ny * TILE_SIZE + TILE_SIZE - 1) * 4 + dir] ?? 0) : 0;
  if (nx >= TILE_SIZE) return r ? (r[ny * TILE_SIZE * 4 + dir] ?? 0) : 0;
  if (ny < 0) return u ? (u[((TILE_SIZE - 1) * TILE_SIZE + nx) * 4 + dir] ?? 0) : 0;
  if (ny >= TILE_SIZE) return d ? (d[nx * 4 + dir] ?? 0) : 0;
  return self[(ny * TILE_SIZE + nx) * 4 + dir] ?? 0;
}

export function stepPigment(state: WetState, snap: WetSnapshot, params: WetParams, paper: PaperField | null): void {
  const Dp = WET_KERNEL.pigmentDiffusionScale * params.diffusion;
  const k = WET_KERNEL.edgeAdvectionScale * params.edgeDarkening;
  const gran = params.granulation * WET_KERNEL.granulationScale;
  const wOff = WET_CH.water * TILE_PIXELS;
  const pOff = WET_CH.pigmentR * TILE_PIXELS;
  const fxOff = WET_CH.fixedR * TILE_PIXELS;
  const active = sortedActive(state);
  // 1패스: 유출 비율
  const fracs = new Map<number, Float32Array>();
  const neighbors = new Map<number, TileNeighbors>();
  for (const tile of active) {
    const nb = neighborsOf(snap, tile);
    if (!nb) continue;
    neighbors.set(tile, nb);
    fracs.set(tile, tileOutFractions(nb, Dp, k));
  }
  // 2패스: gather
  const next = [0, 0, 0, 0];
  for (const tile of active) {
    const slot = state.pool.slotOf(tile);
    const nb = neighbors.get(tile);
    const self = fracs.get(tile);
    if (slot === undefined || !nb || !self) continue;
    const fl = nb.lt >= 0 ? fracs.get(nb.lt) : undefined;
    const fr = nb.rt >= 0 ? fracs.get(nb.rt) : undefined;
    const fu = nb.ut >= 0 ? fracs.get(nb.ut) : undefined;
    const fd = nb.dt >= 0 ? fracs.get(nb.dt) : undefined;
    const dst = state.pool.view(slot);
    const tx = tile % state.tilesX;
    const ty = Math.floor(tile / state.tilesX);
    for (let ly = 0; ly < TILE_SIZE; ly += 1) {
      for (let lx = 0; lx < TILE_SIZE; lx += 1) {
        const i = ly * TILE_SIZE + lx;
        const base = i * 4;
        const keep = 1 - ((self[base] ?? 0) + (self[base + 1] ?? 0) + (self[base + 2] ?? 0) + (self[base + 3] ?? 0));
        for (let ch = 0; ch < 4; ch += 1) {
          next[ch] = (nb.c[pOff + ch * TILE_PIXELS + i] ?? 0) * keep;
        }
        for (let n = 0; n < 4; n += 1) {
          const nx = lx + NEIGHBOR_DX[n];
          const ny = ly + NEIGHBOR_DY[n];
          if (readNeighbor(nb, nx, ny, wOff) === null) continue;
          const frac = neighborFrac(self, fl, fr, fu, fd, nx, ny, INCOMING[n]);
          if (frac <= 0) continue;
          for (let ch = 0; ch < 4; ch += 1) {
            next[ch] = (next[ch] ?? 0) + (readNeighbor(nb, nx, ny, pOff + ch * TILE_PIXELS) ?? 0) * frac;
          }
        }
        const w = nb.c[wOff + i] ?? 0;
        if (w > WET_EPS && gran > 0) {
          const bump = paper
            ? samplePaper(paper, tx * TILE_SIZE + lx + 0.5, ty * TILE_SIZE + ly + 0.5, DEFAULT_PAPER_SPEC).bump
            : 0.5;
          const depFrac = Math.min(1, gran * bump);
          for (let ch = 0; ch < 4; ch += 1) {
            const dep = (next[ch] ?? 0) * depFrac;
            next[ch] = (next[ch] ?? 0) - dep;
            dst[fxOff + ch * TILE_PIXELS + i] = f((dst[fxOff + ch * TILE_PIXELS + i] ?? 0) + dep);
          }
        }
        for (let ch = 0; ch < 4; ch += 1) {
          dst[pOff + ch * TILE_PIXELS + i] = f(Math.max(0, next[ch] ?? 0));
        }
      }
    }
  }
}
