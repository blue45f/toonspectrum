import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";
import { TilePool } from "../raster/tile-pool";

/**
 * 습식 상태(베타). 타일당 12채널 × 256 픽셀을 희소 풀에 둔다.
 * 채널 배치(GPU `wetPool`과 동일, slot·256·12 + ch·256 + local):
 *   [0]      water
 *   [1..2]   velocity (vx, vy)
 *   [3..6]   pigment (r, g, b, mass)   — 부유 안료, 선형 반사율 가중
 *   [7]      height                    — 임파스토 높이
 *   [8..11]  fixed (r, g, b, mass)     — 침착·건조된 안료
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

/** 타일 1개의 채널 뷰(복사 없음, 각 256·ch). */
export interface WetTile {
  water: Float32Array;
  velocity: Float32Array;
  pigment: Float32Array;
  height: Float32Array;
  fixed: Float32Array;
}

export interface WetState {
  width: number;
  height: number;
  tilesX: number;
  tilesY: number;
  /** WET_CHANNELS·256 floats/tile. */
  pool: TilePool;
  /** 시뮬레이션이 갱신하는 타일 집합(젖어 있거나 1링 이웃). */
  active: Set<number>;
  /** 가상 시간(ms). */
  timeMs: number;
  /** 타일 뷰. 미할당 타일은 null(= 건조, 빈 상태). */
  view(tile: number): WetTile | null;
  /** 타일을 할당하고 뷰를 돌려준다(용량 초과 → StrokeBudgetExceededError). */
  touch(tile: number): WetTile;
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

export function createWetState(width: number, height: number, capacityTiles: number): WetState {
  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);
  const pool = new TilePool(capacityTiles, WET_FLOATS_PER_TILE);
  const state: WetState = {
    width,
    height,
    tilesX,
    tilesY,
    pool,
    active: new Set<number>(),
    timeMs: 0,
    view(tile: number): WetTile | null {
      const slot = pool.slotOf(tile);
      if (slot === undefined) return null;
      return sliceTile(pool.view(slot));
    },
    touch(tile: number): WetTile {
      const slot = pool.alloc(tile);
      return sliceTile(pool.view(slot));
    },
  };
  return state;
}

/** 타일 번호 → (tx, ty). */
export function tileCoord(tile: number, tilesX: number): { tx: number; ty: number } {
  return { tx: tile % tilesX, ty: Math.floor(tile / tilesX) };
}

/** 상태 전체의 물·안료 총량(질량 보존 테스트용). */
export function wetTotals(state: WetState): { water: number; pigment: number; fixed: number } {
  let water = 0;
  let pigment = 0;
  let fixed = 0;
  for (const [, slot] of state.pool.entries()) {
    const t = sliceTile(state.pool.view(slot));
    for (let i = 0; i < TILE_PIXELS; i += 1) {
      water += t.water[i] ?? 0;
      pigment += t.pigment[3 * TILE_PIXELS + i] ?? 0;
      fixed += t.fixed[3 * TILE_PIXELS + i] ?? 0;
    }
  }
  return { water, pigment, fixed };
}
