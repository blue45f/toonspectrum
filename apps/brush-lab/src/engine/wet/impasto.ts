import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";

import { neighborsOf, readNeighbor, sortedActive } from "./active-tiles";
import { WET_KERNEL } from "./params";
import { WET_CH } from "./state";

import type { WetSnapshot } from "./active-tiles";
import type { WetParams } from "./params";
import type { WetState } from "./state";

/**
 * 임파스토(베타): 높이맵 조명, 붓이 미는 부피 보존 밀기, 점성 완화.
 * IMPaSTo(Baxter 2004)의 높이장·보존 이류 개념만 가져왔고 코드는 복제하지 않았다.
 */

const f = Math.fround;

/**
 * 중앙차분 법선 + 램버트. 반환은 픽셀당 조명 계수(0..1).
 * light는 정규화하지 않아도 된다. gain은 높이 → 기울기 배율.
 */
export function impastoLighting(
  height: Float32Array,
  width: number,
  light: readonly [number, number, number],
  gain = 1,
): Float32Array {
  const n = height.length;
  const rows = Math.floor(n / width);
  const out = new Float32Array(n);
  const ll = Math.hypot(light[0], light[1], light[2]) || 1;
  const lx = light[0] / ll;
  const ly = light[1] / ll;
  const lz = light[2] / ll;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const hl = height[y * width + Math.max(0, x - 1)] ?? 0;
      const hr = height[y * width + Math.min(width - 1, x + 1)] ?? 0;
      const hu = height[Math.max(0, y - 1) * width + x] ?? 0;
      const hd = height[Math.min(rows - 1, y + 1) * width + x] ?? 0;
      const nx = -(hr - hl) * 0.5 * gain;
      const ny = -(hd - hu) * 0.5 * gain;
      const nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      const lambert = (nx * lx + ny * ly + nz * lz) / nl;
      out[i] = f(lambert < 0 ? 0 : lambert > 1 ? 1 : lambert);
    }
  }
  return out;
}

/** Blinn-Phong 하이라이트 지수(릴리프 광택). GPU 미러 `impasto_specular`와 같은 값. */
export const IMPASTO_SHININESS = 24;

/** 평탄면(법선 (0,0,1))의 하이라이트 값 (N·H)^shininess — 표시 시점에 이 값을 빼서 평탄면 변화 0을 보장한다. */
export function impastoSpecularFlat(light: readonly [number, number, number], shininess = IMPASTO_SHININESS): number {
  const ll = Math.hypot(light[0], light[1], light[2]) || 1;
  const hx = light[0] / ll;
  const hy = light[1] / ll;
  const hz = light[2] / ll + 1;
  const hl = Math.hypot(hx, hy, hz) || 1;
  return f(Math.max(0, hz / hl) ** shininess);
}

/**
 * Blinn-Phong 하이라이트: (N·H)^shininess, H = normalize(L + V), V = (0, 0, 1)(정사 시점).
 * 램버트(`impastoLighting`)가 알베도를 배율하는 것과 달리 **가산** 항이라 검은 물감의 능선에도 광택이 보인다.
 * 반환은 픽셀당 0..1·f32. 법선은 `impastoLighting`과 같은 중앙차분·gain.
 */
export function impastoSpecular(
  height: Float32Array,
  width: number,
  light: readonly [number, number, number],
  gain = 1,
  shininess = IMPASTO_SHININESS,
): Float32Array {
  const n = height.length;
  const rows = Math.floor(n / width);
  const out = new Float32Array(n);
  const ll = Math.hypot(light[0], light[1], light[2]) || 1;
  const hx0 = light[0] / ll;
  const hy0 = light[1] / ll;
  const hz0 = light[2] / ll + 1;
  const hl = Math.hypot(hx0, hy0, hz0) || 1;
  const hx = hx0 / hl;
  const hy = hy0 / hl;
  const hz = hz0 / hl;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const hL = height[y * width + Math.max(0, x - 1)] ?? 0;
      const hR = height[y * width + Math.min(width - 1, x + 1)] ?? 0;
      const hU = height[Math.max(0, y - 1) * width + x] ?? 0;
      const hD = height[Math.min(rows - 1, y + 1) * width + x] ?? 0;
      const nx = -(hR - hL) * 0.5 * gain;
      const ny = -(hD - hU) * 0.5 * gain;
      const nl = Math.hypot(nx, ny, 1);
      const ndh = (nx * hx + ny * hy + hz) / nl;
      out[i] = f(ndh <= 0 ? 0 : Math.min(1, ndh) ** shininess);
    }
  }
  return out;
}

/** 높이 채널의 픽셀 단위 접근기(타일 풀 위). 읽기는 미할당 타일을 0으로 보고, 쓰기는 타일을 할당한다. */
export interface HeightAccess {
  get(px: number, py: number): number;
  set(px: number, py: number, value: number): void;
}

/**
 * 습식 풀의 높이 채널 접근기. 타일 뷰를 호출 수명 동안 캐시하므로 픽셀마다 `state.view()`를 만들지 않는다.
 * 캔버스 밖 좌표는 호출자가 걸러야 한다(타일 인덱스가 맞지 않는다).
 */
export function wetHeightAccess(state: WetState): HeightAccess {
  const hOff = WET_CH.height * TILE_PIXELS;
  const cache = new Map<number, Float32Array>();
  const viewOf = (tile: number, create: boolean): Float32Array | null => {
    const hit = cache.get(tile);
    if (hit) return hit;
    let slot = state.pool.slotOf(tile);
    if (slot === undefined) {
      if (!create) return null;
      slot = state.pool.alloc(tile);
    }
    const view = state.pool.view(slot).subarray(hOff, hOff + TILE_PIXELS);
    cache.set(tile, view);
    return view;
  };
  const tileOf = (px: number, py: number): number => Math.floor(py / TILE_SIZE) * state.tilesX + Math.floor(px / TILE_SIZE);
  const localOf = (px: number, py: number): number => (py % TILE_SIZE) * TILE_SIZE + (px % TILE_SIZE);
  return {
    get(px, py) {
      const view = viewOf(tileOf(px, py), false);
      return view ? (view[localOf(px, py)] ?? 0) : 0;
    },
    set(px, py, value) {
      const view = viewOf(tileOf(px, py), true);
      if (view) view[localOf(px, py)] = f(value);
    },
  };
}

/** 픽셀 단위 포함 경계(inclusive). */
export interface PixelWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 부피 보존 gather 밀기(타일 경계를 넘는다). 창 `win` 안의 각 픽셀은 높이의 `amountAt(px, py)`(0..1) 비율을
 * 진행 방향(dirX, dirY 중 절댓값이 큰 축)의 이웃 한 칸으로 보낸다. 캔버스 밖으로는 보내지 않는다(no-flux).
 * out_p = h_p − moved_p(하류가 캔버스 안일 때) + moved_{상류}(상류가 캔버스 안일 때)이며 합이 정확히 보존된다.
 * 타일 국소 버전(2026-10-01 이전)은 타일 하류 경계에 물감이 쌓여 16 px 격자 무늬를 만들었다.
 * 창은 캔버스 안으로 잘려 있어야 하며, 높이가 바뀌는 영역은 창 + 진행 축 양쪽 1 px이다.
 */
export function pushHeightField(
  access: HeightAccess,
  width: number,
  height: number,
  win: PixelWindow,
  dirX: number,
  dirY: number,
  amountAt: (px: number, py: number) => number,
): void {
  const horizontal = Math.abs(dirX) >= Math.abs(dirY);
  const sx = horizontal ? (dirX >= 0 ? 1 : -1) : 0;
  const sy = horizontal ? 0 : dirY >= 0 ? 1 : -1;
  const rx0 = Math.max(0, win.x0 - (horizontal ? 1 : 0));
  const rx1 = Math.min(width - 1, win.x1 + (horizontal ? 1 : 0));
  const ry0 = Math.max(0, win.y0 - (horizontal ? 0 : 1));
  const ry1 = Math.min(height - 1, win.y1 + (horizontal ? 0 : 1));
  const rw = rx1 - rx0 + 1;
  const rh = ry1 - ry0 + 1;
  if (rw <= 0 || rh <= 0) return;
  const cur = new Float32Array(rw * rh);
  const moved = new Float32Array(rw * rh);
  for (let y = ry0; y <= ry1; y += 1) {
    for (let x = rx0; x <= rx1; x += 1) {
      const i = (y - ry0) * rw + (x - rx0);
      const h = access.get(x, y);
      cur[i] = h;
      if (h > 0 && x >= win.x0 && x <= win.x1 && y >= win.y0 && y <= win.y1) {
        const a = amountAt(x, y);
        moved[i] = f(h * (a < 0 ? 0 : a > 1 ? 1 : a));
      }
    }
  }
  for (let y = ry0; y <= ry1; y += 1) {
    for (let x = rx0; x <= rx1; x += 1) {
      const i = (y - ry0) * rw + (x - rx0);
      const h = cur[i] ?? 0;
      const downIn = x + sx >= 0 && x + sx < width && y + sy >= 0 && y + sy < height;
      const ux = x - sx;
      const uy = y - sy;
      const upIn = ux >= 0 && ux < width && uy >= 0 && uy < height;
      let next = h - (downIn ? (moved[i] ?? 0) : 0);
      if (upIn && ux >= rx0 && ux <= rx1 && uy >= ry0 && uy <= ry1) next += moved[(uy - ry0) * rw + (ux - rx0)] ?? 0;
      if (next !== h) access.set(x, y, next < 0 ? 0 : next);
    }
  }
}

/** 스냅샷의 활성 타일 중 높이가 있는 타일이 하나라도 있는가(완화 스텝 생략용). */
export function snapshotHasHeight(snap: WetSnapshot): boolean {
  const off = WET_CH.height * TILE_PIXELS;
  for (const data of snap.tiles.values()) {
    for (let i = 0; i < TILE_PIXELS; i += 1) {
      if ((data[off + i] ?? 0) > 0) return true;
    }
  }
  return false;
}

/**
 * 점성 완화: 높이의 5점 Jacobi 확산 Dh = heightRelaxScale·(1 − viscosity).
 * 활성 집합 밖과는 교환하지 않아(no-flux) 총 부피가 보존된다. 점성 1이면 변화 없음.
 */
export function relaxHeight(state: WetState, snap: WetSnapshot, params: WetParams): void {
  const v = params.viscosity < 0 ? 0 : params.viscosity > 1 ? 1 : params.viscosity;
  const Dh = WET_KERNEL.heightRelaxScale * (1 - v);
  if (Dh <= 0 || !snapshotHasHeight(snap)) return;
  const hOff = WET_CH.height * TILE_PIXELS;
  for (const tile of sortedActive(state)) {
    const slot = state.pool.slotOf(tile);
    const nb = neighborsOf(snap, tile);
    if (slot === undefined || !nb) continue;
    const src = nb.c;
    const dst = state.pool.view(slot);
    for (let ly = 0; ly < TILE_SIZE; ly += 1) {
      for (let lx = 0; lx < TILE_SIZE; lx += 1) {
        const i = ly * TILE_SIZE + lx;
        const h = src[hOff + i] ?? 0;
        const hl = readNeighbor(nb, lx - 1, ly, hOff) ?? h;
        const hr = readNeighbor(nb, lx + 1, ly, hOff) ?? h;
        const hu = readNeighbor(nb, lx, ly - 1, hOff) ?? h;
        const hd = readNeighbor(nb, lx, ly + 1, hOff) ?? h;
        const nh = h + Dh * (hl + hr + hu + hd - 4 * h);
        dst[hOff + i] = f(nh < 0 ? 0 : nh);
      }
    }
  }
}
