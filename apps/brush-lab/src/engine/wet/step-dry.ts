import { TILE_PIXELS } from "../raster/tile-binning";

import { sortedActive, WET_EPS } from "./active-tiles";
import { WET_CH } from "./state";

import type { WetState } from "./state";

/**
 * 건조 스텝: water < ε인 셀의 부유 안료를 fixed로 옮긴다.
 * 타일에 물도 부유 안료도 없으면 활성 집합에서 뺀다(이후 fixed 불변).
 */
export function stepDry(state: WetState): { driedTiles: number } {
  const wOff = WET_CH.water * TILE_PIXELS;
  const pOff = WET_CH.pigmentR * TILE_PIXELS;
  const fxOff = WET_CH.fixedR * TILE_PIXELS;
  let driedTiles = 0;
  for (const tile of sortedActive(state)) {
    const slot = state.pool.slotOf(tile);
    if (slot === undefined) {
      state.active.delete(tile);
      continue;
    }
    const data = state.pool.view(slot);
    let wet = false;
    let pigment = false;
    for (let i = 0; i < TILE_PIXELS; i += 1) {
      const w = data[wOff + i] ?? 0;
      if (w < WET_EPS) {
        data[wOff + i] = 0;
        for (let ch = 0; ch < 4; ch += 1) {
          const p = data[pOff + ch * TILE_PIXELS + i] ?? 0;
          if (p !== 0) {
            data[fxOff + ch * TILE_PIXELS + i] = Math.fround((data[fxOff + ch * TILE_PIXELS + i] ?? 0) + p);
            data[pOff + ch * TILE_PIXELS + i] = 0;
          }
        }
      } else {
        wet = true;
        if ((data[pOff + 3 * TILE_PIXELS + i] ?? 0) > WET_EPS) pigment = true;
      }
    }
    if (!wet && !pigment) {
      state.active.delete(tile);
      driedTiles += 1;
    }
  }
  return { driedTiles };
}
