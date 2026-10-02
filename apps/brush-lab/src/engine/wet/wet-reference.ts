import { superellipseCoverage } from "../raster/coverage";
import { TILE_PIXELS, TILE_SIZE, tileRefs } from "../raster/tile-binning";
import { DEFAULT_PAPER_SPEC } from "../texture/paper-grain";

import { activeTilesAfterDeposit, expandActive, sortedActive } from "./active-tiles";
import { BAKE_MASS_TO_ALPHA, bakeWet } from "./layer-composite";
import { stepOil } from "./oil-layer";
import { WET_CH, WET_EXT_CH, wetTotals } from "./state";
import { retireDriedTiles } from "./step-dry";
import { stepWaterMedia } from "./step-water";

import type { WetParams } from "./params";
import type { WetState } from "./state";
import type { DabBatch } from "../core/dab-layout";
import type { BinResult } from "../raster/tile-binning";
import type { PaperField, PaperSpec } from "../texture/paper-grain";

/**
 * 습식 CPU 참조 커널. GPU `wet_step`은 같은 풀 레이아웃(slot·12ch + 확장 풀)을 읽고 쓰며 이 구현과 패리티를 검증한다.
 * 스텝 순서(서브스텝당): 물(LBM 흐름층·3층 물 교환·안료 수송·침착·경화) → 건조 타일 정리 → 활성 확장.
 * 유화(`medium: "oil"`)는 높이장 레벨링·젖음 감쇠(`oil-layer.ts`)로 대신한다. 모두 활성 타일만 갱신한다.
 */
export interface WetStepReceipt {
  activeTiles: number;
  /** 표면 + 흐름 + 모세관 층 물 총량. */
  waterTotal: number;
  pigmentTotal: number;
  /** 침착 + 고정(d + D) 안료 총량. */
  fixedTotal: number;
  driedTiles: number;
  /** 이 호출에서 증발한 물(질량 장부: Σwater(전) + 투입 = Σwater(후) + evaporated). */
  evaporated: number;
  /** 표면층에서 흐름·모세관층으로 흡수(seep)된 물 — 내부 이동이라 장부에 영향이 없다. */
  absorbed: number;
  /** 재부유한 침착 안료 질량(재습윤·백런 진단). */
  lifted: number;
}

export { BAKE_MASS_TO_ALPHA, bakeWet };

const f = Math.fround;

/** dab의 wet·pigmentMass를 커버리지 가중으로 투입한다(팁 마스크 없음, 테스트·단독 경로용). */
export function depositWet(state: WetState, batch: DabBatch, bin: BinResult): void {
  const TP = TILE_PIXELS;
  const TS = TILE_SIZE;
  const wOff = WET_CH.water * TP;
  const pOff = WET_CH.pigmentR * TP;
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
      for (let ly = 0; ly < TS; ly += 1) {
        for (let lx = 0; lx < TS; lx += 1) {
          const cov = superellipseCoverage(tx * TS + lx + 0.5 - dab.x, ty * TS + ly + 0.5 - dab.y, dab);
          if (cov <= 0) continue;
          const i = ly * TS + lx;
          data[wOff + i] = f((data[wOff + i] ?? 0) + dab.wet * cov);
          const mass = dab.pigmentMass * cov;
          data[pOff + 3 * TP + i] = f((data[pOff + 3 * TP + i] ?? 0) + mass);
          data[pOff + i] = f((data[pOff + i] ?? 0) + pr * mass);
          data[pOff + TP + i] = f((data[pOff + TP + i] ?? 0) + pg * mass);
          data[pOff + 2 * TP + i] = f((data[pOff + 2 * TP + i] ?? 0) + pb * mass);
        }
      }
    }
  }
  activeTilesAfterDeposit(state, bin);
}

export interface StepWetOptions {
  /** 타일 순회 순서(결정성 시험용: 결과는 순서와 무관해야 한다). */
  tileOrder?: "ascending" | "descending";
  /** 종이 샘플링 스펙(기본 `DEFAULT_PAPER_SPEC`; wasm 표면과 같은 기본을 쓴다). */
  paperSpec?: PaperSpec;
}

/** dtMs를 params.substeps로 나눠 전진한다. */
export function stepWet(
  state: WetState,
  params: WetParams,
  dtMs: number,
  paper: PaperField | null,
  opts: StepWetOptions = {},
): WetStepReceipt {
  const substeps = Math.max(1, Math.floor(params.substeps));
  const h = dtMs / substeps;
  const spec = opts.paperSpec ?? DEFAULT_PAPER_SPEC;
  let evaporated = 0;
  let absorbed = 0;
  let lifted = 0;
  let driedTiles = 0;
  for (let s = 0; s < substeps; s += 1) {
    if (state.active.size === 0 && state.oilTiles.size === 0) break;
    const sorted = sortedActive(state);
    const tiles = opts.tileOrder === "descending" ? sorted.reverse() : sorted;
    if (params.medium === "oil") {
      const keep = stepOil(state, params, h, tiles);
      driedTiles += retireDriedTiles(state, tiles, keep);
    } else {
      const { receipt, keep } = stepWaterMedia({ state, params, hMs: h, paper: { field: paper, spec }, tiles });
      evaporated += receipt.evaporated;
      absorbed += receipt.seeped;
      lifted += receipt.lifted;
      driedTiles += retireDriedTiles(state, tiles, keep);
      expandActive(state);
    }
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
    lifted,
  };
}

/** 시간별 농도 스냅샷(읽기 전용 복사본). bench의 확산 반경·백런·에지 다크닝 지표가 소비한다. */
export interface WetConcentrationSnapshot {
  /** 창의 왼쪽 위(캔버스 px)와 크기. */
  readonly x0: number;
  readonly y0: number;
  readonly width: number;
  readonly height: number;
  /** 상태의 가상 시간(ms). */
  readonly timeMs: number;
  /** 총 안료 질량 = 부유 + 침착(d) + 고정(D). */
  readonly pigment: Float32Array;
  /** 부유 안료 질량. */
  readonly suspended: Float32Array;
  /** 침착 + 고정 안료 질량. */
  readonly deposited: Float32Array;
  /** 재습윤 가능한 침착 안료(d). */
  readonly rewettable: Float32Array;
  /** 표면 + 흐름 + 모세관 층 물. */
  readonly water: Float32Array;
}

export interface SnapshotWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 습식 상태의 농도 스냅샷을 만든다(창은 포함 경계, 기본은 캔버스 전체). 상태는 바뀌지 않는다.
 * 미할당 타일은 0이다.
 */
export function snapshotConcentration(state: WetState, region?: SnapshotWindow): WetConcentrationSnapshot {
  const TP = TILE_PIXELS;
  const TS = TILE_SIZE;
  // 매개변수 이름을 `window`로 두면 DOM 전역과 구별되지 않아 경계 테스트(engine DOM 전역 금지)가 오탐한다.
  const x0 = Math.max(0, region?.x0 ?? 0);
  const y0 = Math.max(0, region?.y0 ?? 0);
  const x1 = Math.min(state.width - 1, region?.x1 ?? state.width - 1);
  const y1 = Math.min(state.height - 1, region?.y1 ?? state.height - 1);
  const width = Math.max(0, x1 - x0 + 1);
  const height = Math.max(0, y1 - y0 + 1);
  const pigment = new Float32Array(width * height);
  const suspended = new Float32Array(width * height);
  const deposited = new Float32Array(width * height);
  const rewettable = new Float32Array(width * height);
  const water = new Float32Array(width * height);
  const txMin = Math.floor(x0 / TS);
  const txMax = Math.floor(x1 / TS);
  const tyMin = Math.floor(y0 / TS);
  const tyMax = Math.floor(y1 / TS);
  for (let ty = tyMin; ty <= tyMax; ty += 1) {
    for (let tx = txMin; tx <= txMax; tx += 1) {
      const tile = ty * state.tilesX + tx;
      const slot = state.pool.slotOf(tile);
      if (slot === undefined) continue;
      const core = state.pool.view(slot);
      const eSlot = state.ext ? state.ext.slotOf(tile) : undefined;
      const ext = state.ext && eSlot !== undefined ? state.ext.view(eSlot) : null;
      for (let ly = 0; ly < TS; ly += 1) {
        const py = ty * TS + ly;
        if (py < y0 || py > y1) continue;
        for (let lx = 0; lx < TS; lx += 1) {
          const px = tx * TS + lx;
          if (px < x0 || px > x1) continue;
          const i = ly * TS + lx;
          const o = (py - y0) * width + (px - x0);
          const g = core[WET_CH.pigmentMass * TP + i] ?? 0;
          const d = core[WET_CH.fixedMass * TP + i] ?? 0;
          const hard = ext ? (ext[WET_EXT_CH.hardMass * TP + i] ?? 0) : 0;
          suspended[o] = g;
          rewettable[o] = d;
          deposited[o] = d + hard;
          pigment[o] = g + d + hard;
          water[o] =
            (core[WET_CH.water * TP + i] ?? 0) +
            (ext ? (ext[WET_EXT_CH.rho * TP + i] ?? 0) + (ext[WET_EXT_CH.capillary * TP + i] ?? 0) : 0);
        }
      }
    }
  }
  return { x0, y0, width, height, timeMs: state.timeMs, pigment, suspended, deposited, rewettable, water };
}
