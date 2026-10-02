import { kmMixRgb } from "../pigment/kubelka-munk";
import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";

import { WET_CH, WET_EXT_CH } from "./state";

import type { WetState } from "./state";

/**
 * 수채 층 합성. 부유 안료 + 침착(d) + 고정(D) 안료의 질량으로 알파를 정하고 문서(선형 premultiplied)에 올린다.
 * alpha = 1 − exp(−mass·3), 색 = 질량 가중 평균 반사율, km이면 바탕색과 KM 혼색.
 * - `compositeWaterLayer`: 비파괴(표시용). 문서를 바꾸지 않고 복사본에 합성하는 용도로 쓴다.
 * - `bakeWet`: 파괴(문서에 굽고 층을 비운다, 재굽기 방지). 건조 후 평탄화·wasm 표면이 쓴다.
 * 두 함수는 같은 수식이라 같은 상태에서 같은 문서를 만든다.
 */

/** 안료 질량 → 불투명도. */
export const BAKE_MASS_TO_ALPHA = 3;

export interface LayerBakeOptions {
  km?: boolean;
}

const f = Math.fround;

function applyWaterLayer(state: WetState, doc: Float32Array, width: number, opts: LayerBakeOptions, clear: boolean): void {
  const TP = TILE_PIXELS;
  const TS = TILE_SIZE;
  const pOff = WET_CH.pigmentR * TP;
  const fxOff = WET_CH.fixedR * TP;
  const hardOff = WET_EXT_CH.hardR * TP;
  for (const [tile, slot] of state.pool.entries()) {
    const data = state.pool.view(slot);
    const eSlot = state.ext ? state.ext.slotOf(tile) : undefined;
    const ext = state.ext && eSlot !== undefined ? state.ext.view(eSlot) : null;
    const tx = tile % state.tilesX;
    const ty = Math.floor(tile / state.tilesX);
    for (let ly = 0; ly < TS; ly += 1) {
      const py = ty * TS + ly;
      if (py >= state.height) continue;
      for (let lx = 0; lx < TS; lx += 1) {
        const px = tx * TS + lx;
        if (px >= state.width) continue;
        const i = ly * TS + lx;
        const hm = ext ? (ext[hardOff + 3 * TP + i] ?? 0) : 0;
        const mass = (data[pOff + 3 * TP + i] ?? 0) + (data[fxOff + 3 * TP + i] ?? 0) + hm;
        if (mass <= 0) continue;
        const hr = ext ? (ext[hardOff + i] ?? 0) : 0;
        const hg = ext ? (ext[hardOff + TP + i] ?? 0) : 0;
        const hb = ext ? (ext[hardOff + 2 * TP + i] ?? 0) : 0;
        const r = ((data[pOff + i] ?? 0) + (data[fxOff + i] ?? 0) + hr) / mass;
        const g = ((data[pOff + TP + i] ?? 0) + (data[fxOff + TP + i] ?? 0) + hg) / mass;
        const b = ((data[pOff + 2 * TP + i] ?? 0) + (data[fxOff + 2 * TP + i] ?? 0) + hb) / mass;
        const alpha = f(1 - Math.exp(-mass * BAKE_MASS_TO_ALPHA));
        const o = (py * width + px) * 4;
        const da = doc[o + 3] ?? 0;
        let cr = r;
        let cg = g;
        let cb = b;
        if (opts.km && da > 0) {
          const dr = (doc[o] ?? 0) / da;
          const dg = (doc[o + 1] ?? 0) / da;
          const db = (doc[o + 2] ?? 0) / da;
          [cr, cg, cb] = kmMixRgb([dr, dg, db], [r, g, b], alpha);
        }
        const k = f(1 - alpha);
        doc[o] = f(cr * alpha + (doc[o] ?? 0) * k);
        doc[o + 1] = f(cg * alpha + (doc[o + 1] ?? 0) * k);
        doc[o + 2] = f(cb * alpha + (doc[o + 2] ?? 0) * k);
        doc[o + 3] = f(alpha + da * k);
        if (clear) {
          for (let ch = 0; ch < 4; ch += 1) {
            data[pOff + ch * TP + i] = 0;
            data[fxOff + ch * TP + i] = 0;
            if (ext) ext[hardOff + ch * TP + i] = 0;
          }
        }
      }
    }
  }
}

/** 비파괴 합성: `doc`(보통 문서의 복사본)에 수채 층을 올린다. 상태는 바뀌지 않는다. */
export function compositeWaterLayer(state: WetState, doc: Float32Array, width: number, opts: LayerBakeOptions = {}): void {
  applyWaterLayer(state, doc, width, opts, false);
}

/**
 * fixed + 부유 + 고정(D) 안료를 문서에 굽고 층을 비운다(재굽기 방지).
 * 구운 안료는 문서로 옮겨졌으므로 풀의 안료 채널을 0으로 만든다.
 */
export function bakeWet(state: WetState, doc: Float32Array, width: number, opts: LayerBakeOptions = {}): void {
  applyWaterLayer(state, doc, width, opts, true);
}
