import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";
import { DEFAULT_PAPER_SPEC, samplePaper } from "../texture/paper-grain";

import { neighborsOf, readNeighbor, sortedActive } from "./active-tiles";
import { WET_KERNEL } from "./params";
import { WET_CH } from "./state";

import type { WetSnapshot } from "./active-tiles";
import type { WetParams } from "./params";
import type { WetState } from "./state";
import type { PaperField } from "../texture/paper-grain";

/**
 * 물 스텝(CPU 참조): 5점 Jacobi 확산 + 증발 + 모세관 흡수 + 속도장(−∇water).
 * - 확산 계수 D = waterDiffusionScale·diffusion(스텝당, 격자 단위; 명시적 안정 한계 0.25 이하)
 * - 증발: evaporation·dt + water·dt/dryingMs
 * - 흡수: capillary·absorptivity·absorb(paper)·capillaryScale·dt
 * 활성 집합 밖과는 교환하지 않으므로 Σwater(전) = Σwater(후) + evaporated + absorbed.
 * 에지 다크닝은 안료 스텝의 이류 항(마른 쪽으로 −∇water 방향)으로 생긴다(step-pigment.ts).
 */
export interface WaterStepReceipt {
  evaporated: number;
  absorbed: number;
}

const f = Math.fround;

export function stepWater(
  state: WetState,
  snap: WetSnapshot,
  params: WetParams,
  dtMs: number,
  paper: PaperField | null,
): WaterStepReceipt {
  const D = WET_KERNEL.waterDiffusionScale * params.diffusion;
  const W = WET_CH.water;
  const wOff = W * TILE_PIXELS;
  const vxOff = WET_CH.velocityX * TILE_PIXELS;
  const vyOff = WET_CH.velocityY * TILE_PIXELS;
  const evapRate = params.evaporation * dtMs;
  const dryRate = params.dryingMs > 0 ? dtMs / params.dryingMs : 0;
  const absorbRate = params.capillary * params.absorptivity * WET_KERNEL.capillaryScale * dtMs;
  let evaporated = 0;
  let absorbed = 0;
  for (const tile of sortedActive(state)) {
    const slot = state.pool.slotOf(tile);
    const nb = neighborsOf(snap, tile);
    if (slot === undefined || !nb) continue;
    const src = nb.c;
    const dst = state.pool.view(slot);
    const tx = tile % state.tilesX;
    const ty = Math.floor(tile / state.tilesX);
    for (let ly = 0; ly < TILE_SIZE; ly += 1) {
      for (let lx = 0; lx < TILE_SIZE; lx += 1) {
        const i = ly * TILE_SIZE + lx;
        const w = src[wOff + i] ?? 0;
        const wl = readNeighbor(nb, lx - 1, ly, wOff) ?? w;
        const wr = readNeighbor(nb, lx + 1, ly, wOff) ?? w;
        const wu = readNeighbor(nb, lx, ly - 1, wOff) ?? w;
        const wd = readNeighbor(nb, lx, ly + 1, wOff) ?? w;
        let nw = w + D * (wl + wr + wu + wd - 4 * w);
        if (nw < 0) nw = 0;
        const ev = Math.min(nw, evapRate + nw * dryRate);
        nw -= ev;
        evaporated += ev;
        let absorbA = 0.5;
        if (paper) {
          absorbA = samplePaper(paper, tx * TILE_SIZE + lx + 0.5, ty * TILE_SIZE + ly + 0.5, DEFAULT_PAPER_SPEC).absorb;
        }
        const ab = Math.min(nw, absorbRate * absorbA);
        nw -= ab;
        absorbed += ab;
        dst[wOff + i] = f(nw);
        dst[vxOff + i] = f(-(wr - wl) * 0.5);
        dst[vyOff + i] = f(-(wd - wu) * 0.5);
      }
    }
  }
  return { evaporated, absorbed };
}
