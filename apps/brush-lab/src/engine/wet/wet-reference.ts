import { kmMixRgb } from "../pigment/kubelka-munk";
import { superellipseCoverage } from "../raster/coverage";
import { TILE_PIXELS, TILE_SIZE, tileRefs } from "../raster/tile-binning";

import { activeTilesAfterDeposit, expandActive, snapshotActive } from "./active-tiles";
import { relaxHeight } from "./impasto";
import { WET_CH, wetTotals } from "./state";
import { stepDry } from "./step-dry";
import { stepPigment } from "./step-pigment";
import { stepWater } from "./step-water";

import type { WetParams } from "./params";
import type { WetState } from "./state";
import type { DabBatch } from "../core/dab-layout";
import type { BinResult } from "../raster/tile-binning";
import type { PaperField } from "../texture/paper-grain";

/**
 * 습식 CPU 참조 커널(베타). GPU `wet_step`은 같은 풀 레이아웃(slot·12ch)을 읽고 쓰며 이 구현과 패리티를 검증한다.
 * 스텝 순서: water → pigment → height(임파스토 점성 완화) → dry → 활성 확장. 모두 활성 타일만 갱신한다.
 */
export interface WetStepReceipt {
  activeTiles: number;
  waterTotal: number;
  pigmentTotal: number;
  fixedTotal: number;
  driedTiles: number;
  /** 이 스텝에서 증발·흡수된 물(질량 장부). */
  evaporated: number;
  absorbed: number;
}

const f = Math.fround;

/** dab의 wet·pigmentMass를 커버리지 가중으로 투입한다(팁 마스크 없음, 테스트·단독 경로용). */
export function depositWet(state: WetState, batch: DabBatch, bin: BinResult): void {
  const wOff = WET_CH.water * TILE_PIXELS;
  const pOff = WET_CH.pigmentR * TILE_PIXELS;
  for (let d = 0; d < bin.dirtyCount; d += 1) {
    const tile = bin.dirtyTiles[d] ?? 0;
    const refs = tileRefs(bin, tile);
    const data = state.pool.view(state.pool.alloc(tile));
    const tx = tile % state.tilesX;
    const ty = Math.floor(tile / state.tilesX);
    for (let k = 0; k < refs.length; k += 1) {
      const dab = batch.at(refs[k] ?? 0);
      const pr = dab.a > 0 ? dab.r / dab.a : 0;
      const pg = dab.a > 0 ? dab.g / dab.a : 0;
      const pb = dab.a > 0 ? dab.b / dab.a : 0;
      for (let ly = 0; ly < TILE_SIZE; ly += 1) {
        for (let lx = 0; lx < TILE_SIZE; lx += 1) {
          const cov = superellipseCoverage(tx * TILE_SIZE + lx + 0.5 - dab.x, ty * TILE_SIZE + ly + 0.5 - dab.y, dab);
          if (cov <= 0) continue;
          const i = ly * TILE_SIZE + lx;
          data[wOff + i] = f((data[wOff + i] ?? 0) + dab.wet * cov);
          const mass = dab.pigmentMass * cov;
          data[pOff + 3 * TILE_PIXELS + i] = f((data[pOff + 3 * TILE_PIXELS + i] ?? 0) + mass);
          data[pOff + i] = f((data[pOff + i] ?? 0) + pr * mass);
          data[pOff + TILE_PIXELS + i] = f((data[pOff + TILE_PIXELS + i] ?? 0) + pg * mass);
          data[pOff + 2 * TILE_PIXELS + i] = f((data[pOff + 2 * TILE_PIXELS + i] ?? 0) + pb * mass);
        }
      }
    }
  }
  activeTilesAfterDeposit(state, bin);
}

/** dtMs를 params.substeps로 나눠 전진한다. */
export function stepWet(state: WetState, params: WetParams, dtMs: number, paper: PaperField | null): WetStepReceipt {
  const substeps = Math.max(1, Math.floor(params.substeps));
  const h = dtMs / substeps;
  let evaporated = 0;
  let absorbed = 0;
  let driedTiles = 0;
  for (let s = 0; s < substeps; s += 1) {
    if (state.active.size === 0) break;
    const snap = snapshotActive(state);
    const w = stepWater(state, snap, params, h, paper);
    evaporated += w.evaporated;
    absorbed += w.absorbed;
    stepPigment(state, snap, params, paper);
    relaxHeight(state, snap, params);
    driedTiles += stepDry(state).driedTiles;
    expandActive(state);
  }
  state.timeMs += dtMs;
  const totals = wetTotals(state);
  return {
    activeTiles: state.active.size,
    waterTotal: totals.water,
    pigmentTotal: totals.pigment,
    fixedTotal: totals.fixed,
    driedTiles,
    evaporated,
    absorbed,
  };
}

/** 안료 질량 → 불투명도. */
export const BAKE_MASS_TO_ALPHA = 3;

/**
 * fixed + 부유 안료를 문서(선형 premultiplied)에 굽는다.
 * alpha = 1 − exp(−mass·3), 색 = 질량 가중 평균 반사율. km이면 바탕색과 KM 혼색.
 */
export function bakeWet(state: WetState, doc: Float32Array, width: number, opts: { km?: boolean } = {}): void {
  const pOff = WET_CH.pigmentR * TILE_PIXELS;
  const fxOff = WET_CH.fixedR * TILE_PIXELS;
  for (const [tile, slot] of state.pool.entries()) {
    const data = state.pool.view(slot);
    const tx = tile % state.tilesX;
    const ty = Math.floor(tile / state.tilesX);
    for (let ly = 0; ly < TILE_SIZE; ly += 1) {
      const py = ty * TILE_SIZE + ly;
      if (py >= state.height) continue;
      for (let lx = 0; lx < TILE_SIZE; lx += 1) {
        const px = tx * TILE_SIZE + lx;
        if (px >= state.width) continue;
        const i = ly * TILE_SIZE + lx;
        const mass = (data[pOff + 3 * TILE_PIXELS + i] ?? 0) + (data[fxOff + 3 * TILE_PIXELS + i] ?? 0);
        if (mass <= 0) continue;
        const r = ((data[pOff + i] ?? 0) + (data[fxOff + i] ?? 0)) / mass;
        const g = ((data[pOff + TILE_PIXELS + i] ?? 0) + (data[fxOff + TILE_PIXELS + i] ?? 0)) / mass;
        const b = ((data[pOff + 2 * TILE_PIXELS + i] ?? 0) + (data[fxOff + 2 * TILE_PIXELS + i] ?? 0)) / mass;
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
        // 구운 안료는 문서로 옮겨졌으므로 비운다(재굽기 방지).
        for (let ch = 0; ch < 4; ch += 1) {
          data[pOff + ch * TILE_PIXELS + i] = 0;
          data[fxOff + ch * TILE_PIXELS + i] = 0;
        }
      }
    }
  }
}
