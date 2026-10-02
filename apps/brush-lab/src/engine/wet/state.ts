import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";
import { TilePool } from "../raster/tile-pool";

import type { TilePaper } from "./paper-wet";

/**
 * 습식 상태. 타일당 12채널 × 256 픽셀을 희소 풀에 둔다(GPU `wetPool` 계약 — 인덱스·순서는 바꾸지 않는다).
 * 채널 배치(slot·256·12 + ch·256 + local):
 *   [0]      water                     — 표면층 물 ws(dab이 놓는 물)
 *   [1..2]   velocity (vx, vy)         — 흐름층(LBM) 거시 속도 u
 *   [3..6]   pigment (r, g, b, mass)   — 부유 안료(색×질량 가중 표현)
 *   [7]      height                    — 유화 높이 H(젖은 물감 + 마른 릴리프)
 *   [8..11]  fixed (r, g, b, mass)     — 침착(재습윤 가능) 안료 d
 *
 * 새 채널은 **별도 확장 풀**(`ext`, 같은 타일 번호·별도 슬롯)에 둔다. 확장 풀은 습식이 처음 필요할 때 만들어
 * 건식 전용 표면은 메모리를 쓰지 않는다. 확장 채널(slot·256·22 + ch·256 + local):
 *   [0..8]   lbm f0..f8                — 흐름층 속도 분포(충돌 후, D2Q9)
 *   [9]      rho                       — 흐름층 물 밀도 ρ = Σ f_i (파생, 이웃 투과율 계산용)
 *   [10]     capillary                 — 모세관(흡수)층 포화 s
 *   [11]     glue                      — 아교(수묵) — 안료 함량에 비례해 핀닝을 키운다
 *   [12]     cure                      — 건조 후 경과 스텝(경화 카운터)
 *   [13..16] hard (r, g, b, mass)      — 경화된 고정 안료 D(재습윤 불가)
 *   [17..19] oil color (r, g, b)       — 유화 물감 색 × 부피(색 가중 표현)
 *   [20]     oilWet                    — 유화 젖은(이동 가능) 부피 m
 *   [21]     oilBase                   — 유화 마른 릴리프 높이
 *   [22]     wetBlur                   — 젖음 마스크의 헬름홀츠 블러 B(Curtis FlowOutward의 블러 마스크 개념; 안료 에지 이동용)
 */
export const WET_CHANNELS = 12 as const;
export const WET_CH = {
  water: 0,
  velocityX: 1,
  velocityY: 2,
  pigmentR: 3,
  pigmentG: 4,
  pigmentB: 5,
  pigmentMass: 6,
  height: 7,
  fixedR: 8,
  fixedG: 9,
  fixedB: 10,
  fixedMass: 11,
} as const;
export const WET_FLOATS_PER_TILE = WET_CHANNELS * TILE_PIXELS;

export const WET_EXT_CHANNELS = 23 as const;
export const WET_EXT_CH = {
  lbm0: 0,
  rho: 9,
  capillary: 10,
  glue: 11,
  cure: 12,
  hardR: 13,
  hardG: 14,
  hardB: 15,
  hardMass: 16,
  oilR: 17,
  oilG: 18,
  oilB: 19,
  oilWet: 20,
  oilBase: 21,
  wetBlur: 22,
} as const;
export const WET_EXT_FLOATS_PER_TILE = WET_EXT_CHANNELS * TILE_PIXELS;

/** 타일 1개의 채널 뷰(복사 없음, 각 256·ch). */
export interface WetTile {
  water: Float32Array;
  velocity: Float32Array;
  pigment: Float32Array;
  height: Float32Array;
  fixed: Float32Array;
}

/** 확장 풀 타일 뷰(복사 없음). */
export interface WetExtTile {
  /** f0..f8(9·256). */
  lbm: Float32Array;
  rho: Float32Array;
  capillary: Float32Array;
  glue: Float32Array;
  cure: Float32Array;
  /** r, g, b, mass(4·256). */
  hard: Float32Array;
  /** r, g, b(3·256). */
  oilColor: Float32Array;
  oilWet: Float32Array;
  oilBase: Float32Array;
  wetBlur: Float32Array;
}

/** 표시용(비파괴) 합성 파라미터 — 마지막 습식 획의 프로그램에서 래치한다. */
export interface WetRenderState {
  /** 바탕과 KM 혼색으로 합성한다. */
  km: boolean;
}

export interface WetState {
  width: number;
  height: number;
  tilesX: number;
  tilesY: number;
  /** WET_CHANNELS·256 floats/tile. */
  pool: TilePool;
  /** 확장 풀(WET_EXT_CHANNELS·256 floats/tile). 처음 필요할 때 만들어진다. */
  ext: TilePool | null;
  /** 시뮬레이션이 갱신하는 타일 집합(젖어 있거나 1링 이웃). */
  active: Set<number>;
  /** 유화 물감이 있는 타일(젖음 감쇠 대상). */
  oilTiles: Set<number>;
  /** 가상 시간(ms). */
  timeMs: number;
  /** 종이 파생 필드 캐시(타일별). 키가 바뀌면 비운다. */
  paperCache: { key: string; tiles: Map<number, TilePaper> } | null;
  /** 표시 합성 파라미터. */
  render: WetRenderState;
  /** 타일 뷰. 미할당 타일은 null(= 건조, 빈 상태). */
  view(tile: number): WetTile | null;
  /** 타일을 할당하고 뷰를 돌려준다(용량 초과 → StrokeBudgetExceededError). */
  touch(tile: number): WetTile;
  /** 확장 풀 타일 뷰(없으면 null). */
  extView(tile: number): WetExtTile | null;
  /** 확장 풀 타일을 할당하고 뷰를 돌려준다(코어 타일도 함께 할당한다). */
  touchExt(tile: number): WetExtTile;
  /** `touchExt`와 같지만 뷰를 만들지 않는다(핫 경로에서 서브배열 생성을 피한다). */
  ensureExt(tile: number): void;
}

function sliceTile(data: Float32Array): WetTile {
  const n = TILE_PIXELS;
  return {
    water: data.subarray(WET_CH.water * n, (WET_CH.water + 1) * n),
    velocity: data.subarray(WET_CH.velocityX * n, (WET_CH.velocityY + 1) * n),
    pigment: data.subarray(WET_CH.pigmentR * n, (WET_CH.pigmentMass + 1) * n),
    height: data.subarray(WET_CH.height * n, (WET_CH.height + 1) * n),
    fixed: data.subarray(WET_CH.fixedR * n, (WET_CH.fixedMass + 1) * n),
  };
}

export function sliceExtTile(data: Float32Array): WetExtTile {
  const n = TILE_PIXELS;
  return {
    lbm: data.subarray(WET_EXT_CH.lbm0 * n, (WET_EXT_CH.lbm0 + 9) * n),
    rho: data.subarray(WET_EXT_CH.rho * n, (WET_EXT_CH.rho + 1) * n),
    capillary: data.subarray(WET_EXT_CH.capillary * n, (WET_EXT_CH.capillary + 1) * n),
    glue: data.subarray(WET_EXT_CH.glue * n, (WET_EXT_CH.glue + 1) * n),
    cure: data.subarray(WET_EXT_CH.cure * n, (WET_EXT_CH.cure + 1) * n),
    hard: data.subarray(WET_EXT_CH.hardR * n, (WET_EXT_CH.hardMass + 1) * n),
    oilColor: data.subarray(WET_EXT_CH.oilR * n, (WET_EXT_CH.oilB + 1) * n),
    oilWet: data.subarray(WET_EXT_CH.oilWet * n, (WET_EXT_CH.oilWet + 1) * n),
    oilBase: data.subarray(WET_EXT_CH.oilBase * n, (WET_EXT_CH.oilBase + 1) * n),
    wetBlur: data.subarray(WET_EXT_CH.wetBlur * n, (WET_EXT_CH.wetBlur + 1) * n),
  };
}

export function createWetState(width: number, height: number, capacityTiles: number): WetState {
  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);
  const pool = new TilePool(capacityTiles, WET_FLOATS_PER_TILE);
  let ext: TilePool | null = null;
  const state: WetState = {
    width,
    height,
    tilesX,
    tilesY,
    pool,
    get ext(): TilePool | null {
      return ext;
    },
    active: new Set<number>(),
    oilTiles: new Set<number>(),
    timeMs: 0,
    paperCache: null,
    render: { km: false },
    view(tile: number): WetTile | null {
      const slot = pool.slotOf(tile);
      if (slot === undefined) return null;
      return sliceTile(pool.view(slot));
    },
    touch(tile: number): WetTile {
      const slot = pool.alloc(tile);
      return sliceTile(pool.view(slot));
    },
    extView(tile: number): WetExtTile | null {
      if (!ext) return null;
      const slot = ext.slotOf(tile);
      if (slot === undefined) return null;
      return sliceExtTile(ext.view(slot));
    },
    touchExt(tile: number): WetExtTile {
      pool.alloc(tile);
      if (!ext) ext = new TilePool(pool.capacityTiles, WET_EXT_FLOATS_PER_TILE);
      return sliceExtTile(ext.view(ext.alloc(tile)));
    },
    ensureExt(tile: number): void {
      pool.alloc(tile);
      if (!ext) ext = new TilePool(pool.capacityTiles, WET_EXT_FLOATS_PER_TILE);
      ext.alloc(tile);
    },
  };
  return state;
}

/** 타일 번호 → (tx, ty). */
export function tileCoord(tile: number, tilesX: number): { tx: number; ty: number } {
  return { tx: tile % tilesX, ty: Math.floor(tile / tilesX) };
}

export interface WetTotals {
  /** 표면 + 흐름 + 모세관 층 물 총량(증발 장부와 짝). */
  water: number;
  /** 표면층(ws). */
  surface: number;
  /** 흐름층(ρ). */
  flow: number;
  /** 모세관층(s). */
  capillary: number;
  /** 부유 안료 질량. */
  pigment: number;
  /** 침착 + 고정 안료 질량(d + D). */
  fixed: number;
  /** 재습윤 가능한 침착 안료(d). */
  rewettable: number;
  /** 경화된 고정 안료(D). */
  hardFixed: number;
  /** 유화 물감 부피(높이 − 마른 릴리프). */
  oilVolume: number;
}

/** 상태 전체의 물·안료 총량(질량 보존 테스트용). */
export function wetTotals(state: WetState): WetTotals {
  const TP = TILE_PIXELS;
  let surface = 0;
  let flow = 0;
  let capillary = 0;
  let pigment = 0;
  let rewettable = 0;
  let hardFixed = 0;
  let oilVolume = 0;
  for (const [tile, slot] of state.pool.entries()) {
    const t = sliceTile(state.pool.view(slot));
    const eSlot = state.ext ? state.ext.slotOf(tile) : undefined;
    const e = state.ext && eSlot !== undefined ? sliceExtTile(state.ext.view(eSlot)) : null;
    for (let i = 0; i < TP; i += 1) {
      surface += t.water[i] ?? 0;
      pigment += t.pigment[3 * TP + i] ?? 0;
      rewettable += t.fixed[3 * TP + i] ?? 0;
      if (e) {
        flow += e.rho[i] ?? 0;
        capillary += e.capillary[i] ?? 0;
        hardFixed += e.hard[3 * TP + i] ?? 0;
      }
      oilVolume += Math.max(0, (t.height[i] ?? 0) - (e ? (e.oilBase[i] ?? 0) : 0));
    }
  }
  return {
    water: surface + flow + capillary,
    surface,
    flow,
    capillary,
    pigment,
    fixed: rewettable + hardFixed,
    rewettable,
    hardFixed,
    oilVolume,
  };
}
