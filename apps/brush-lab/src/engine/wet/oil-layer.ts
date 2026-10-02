import { kmMixRgb } from "../pigment/kubelka-munk";
import { TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";

import { WET_CH, WET_EXT_CH } from "./state";

import type { WetParams } from "./params";
import type { WetState } from "./state";

/**
 * 유화 물감 층(IMPASTO, Baxter 2004의 높이장·보존 이류·KM 혼색 개념을 재구현 — UNC 코드 미사용).
 *
 * 셀 상태(코어 `height` + 확장 풀):
 *   H(코어 ch7)        총 높이 = 마른 릴리프 B + 물감 부피 V
 *   B(`oilBase`)       평탄화된(마른) 릴리프 높이
 *   m(`oilWet`)        이동 가능한 젖은 부피(m ≤ V) — 밀기·레벨링·혼색은 젖은 물감만 한다
 *   C(`oilColor`)      V × 선형 반사율 색(질량 가중 표현). 색 = C / V
 * - 밀기(shear): 붓 아래 젖은 물감의 일부를 진행·측면 방향 이웃 한 칸으로 gather 이동(부피 보존, 색 동반).
 *   도착한 물감은 이웃의 젖은 물감과 KM 혼색된다(안료 혼색 "흐려짐").
 * - 침착: 붓이 들고 있는 색(픽업 혼색 반영)으로 부피를 더하고, 아래의 젖은 물감과 KM 혼색한다.
 * - 레벨링: 높이차가 항복 문턱(Bingham)을 넘는 곳에서만 젖은 물감이 흘러 평평해진다(부피 보존, 점도로 속도 감쇠).
 * - 건조: 젖은 부피 m이 dryingMs 시간척도로 줄어 굳는다(굳은 물감은 더 이상 움직이지 않는다).
 * 표시: 색은 α = kV/(1 + kV)로 문서 위에 비파괴 합성하고, 릴리프 조명은 총 높이 H로 한다(`reference-renderer.ts`).
 */

/** 불투명도 계수: α = k·V / (1 + k·V). */
export const OIL_OPACITY_K = 4;
/** Bingham 항복 문턱 = oilYield·OIL_YIELD_SCALE(높이 단위). */
export const OIL_YIELD_SCALE = 1.2;
/** 레벨링 유량 계수(프레임 길이 16.67 ms 기준, (1 − viscosity)에 비례). */
export const OIL_LEVEL_RATE = 0.12;
/** 붓 측면 밀기 비율(진행 방향 대비): 붓 가장자리 물감이 옆으로 밀려 둑(ridge)이 생긴다. */
export const OIL_SIDE_GAIN = 0.6;
/** 붓이 매 dab마다 원래 색으로 돌아가는 비율(붓 색 표류의 상한). */
export const OIL_RELOAD = 0.03;
/** 젖은 물감 부피 이하는 0으로 본다. */
export const OIL_EPS = 1e-6;

const TP = TILE_PIXELS;
const TS = TILE_SIZE;
const f = Math.fround;

/** 한 dab이 만지는 영역의 로컬 복사본(행 우선, 타일 경계와 무관). */
export interface OilWindow {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** 총 높이 H. */
  height: Float32Array;
  /** 마른 릴리프 B. */
  base: Float32Array;
  /** 젖은 부피 m. */
  wet: Float32Array;
  /** 색 × 부피. */
  cr: Float32Array;
  cg: Float32Array;
  cb: Float32Array;
}

/** 붓이 들고 있는 색(획 동안 유지, beginStroke마다 새로 만든다). */
export interface OilCarry {
  r: number;
  g: number;
  b: number;
  loaded: boolean;
}

export function newOilCarry(): OilCarry {
  return { r: 0, g: 0, b: 0, loaded: false };
}

function tileViews(
  state: WetState,
  tile: number,
  create: boolean,
): { core: Float32Array; ext: Float32Array } | null {
  let slot = state.pool.slotOf(tile);
  let eSlot = state.ext ? state.ext.slotOf(tile) : undefined;
  if (slot === undefined || eSlot === undefined) {
    if (!create) return null;
    state.touchExt(tile);
    slot = state.pool.slotOf(tile);
    eSlot = state.ext ? state.ext.slotOf(tile) : undefined;
    if (slot === undefined || eSlot === undefined || !state.ext) return null;
  }
  if (!state.ext) return null;
  return { core: state.pool.view(slot), ext: state.ext.view(eSlot) };
}

/** 창(포함 경계)의 현재 상태를 로컬 배열로 복사한다. 캔버스 안으로 잘려 있어야 한다. */
export function loadOilWindow(state: WetState, x0: number, y0: number, x1: number, y1: number): OilWindow {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const n = Math.max(0, w * h);
  const win: OilWindow = {
    x0,
    y0,
    w,
    h,
    height: new Float32Array(n),
    base: new Float32Array(n),
    wet: new Float32Array(n),
    cr: new Float32Array(n),
    cg: new Float32Array(n),
    cb: new Float32Array(n),
  };
  const cache = new Map<number, { core: Float32Array; ext: Float32Array } | null>();
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const tile = Math.floor(y / TS) * state.tilesX + Math.floor(x / TS);
      let v = cache.get(tile);
      if (v === undefined) {
        v = tileViews(state, tile, false);
        cache.set(tile, v);
      }
      if (!v) continue;
      const i = (y % TS) * TS + (x % TS);
      const o = (y - y0) * w + (x - x0);
      win.height[o] = v.core[WET_CH.height * TP + i] ?? 0;
      win.base[o] = v.ext[WET_EXT_CH.oilBase * TP + i] ?? 0;
      win.wet[o] = v.ext[WET_EXT_CH.oilWet * TP + i] ?? 0;
      win.cr[o] = v.ext[WET_EXT_CH.oilR * TP + i] ?? 0;
      win.cg[o] = v.ext[WET_EXT_CH.oilG * TP + i] ?? 0;
      win.cb[o] = v.ext[WET_EXT_CH.oilB * TP + i] ?? 0;
    }
  }
  return win;
}

/**
 * 로컬 배열을 상태에 되쓴다. 비어 있는 셀만 있는 미할당 타일은 만들지 않지만, 타일 안의 어느 셀이든 물감이 있으면
 * (창을 훑는 순서와 무관하게) 타일을 만들고 `oilTiles`에 올린다.
 */
export function storeOilWindow(state: WetState, win: OilWindow): void {
  const cache = new Map<number, { core: Float32Array; ext: Float32Array }>();
  for (let y = win.y0; y < win.y0 + win.h; y += 1) {
    for (let x = win.x0; x < win.x0 + win.w; x += 1) {
      const o = (y - win.y0) * win.w + (x - win.x0);
      const tile = Math.floor(y / TS) * state.tilesX + Math.floor(x / TS);
      const any = (win.height[o] ?? 0) !== 0 || (win.base[o] ?? 0) !== 0;
      let v = cache.get(tile);
      if (v === undefined) {
        const found = tileViews(state, tile, any);
        if (!found) continue;
        v = found;
        cache.set(tile, v);
      }
      if (any) state.oilTiles.add(tile);
      const i = (y % TS) * TS + (x % TS);
      v.core[WET_CH.height * TP + i] = win.height[o] ?? 0;
      v.ext[WET_EXT_CH.oilBase * TP + i] = win.base[o] ?? 0;
      v.ext[WET_EXT_CH.oilWet * TP + i] = win.wet[o] ?? 0;
      v.ext[WET_EXT_CH.oilR * TP + i] = win.cr[o] ?? 0;
      v.ext[WET_EXT_CH.oilG * TP + i] = win.cg[o] ?? 0;
      v.ext[WET_EXT_CH.oilB * TP + i] = win.cb[o] ?? 0;
    }
  }
}

/** 물감 부피 V = H − B. */
function volumeAt(win: OilWindow, o: number): number {
  const v = (win.height[o] ?? 0) - (win.base[o] ?? 0);
  return v > 0 ? v : 0;
}

/**
 * 부피 보존 gather 밀기(젖은 물감만, 색 동반). `amount[o]`(0..1)는 셀 o의 젖은 부피 중 이동 비율이고
 * (dirX[o], dirY[o]) ∈ {−1, 0, 1} 중 한 축 방향 이웃 한 칸으로 간다. 창 밖(캔버스 밖)으로는 보내지 않는다(no-flux).
 * 도착한 물감은 이웃의 젖은 물감과 KM 혼색(가중 = 도착량 / (도착량 + mixing·이웃 젖은 부피))된다.
 */
export function pushOilWindow(
  win: OilWindow,
  amount: Float32Array,
  dirX: Int8Array,
  dirY: Int8Array,
  mixing: number,
): void {
  const { w, h } = win;
  const n = w * h;
  const mv = new Float32Array(n);
  const target = new Int32Array(n).fill(-1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = y * w + x;
      const a = amount[o] ?? 0;
      if (a <= 0) continue;
      const nx = x + (dirX[o] ?? 0);
      const ny = y + (dirY[o] ?? 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || (nx === x && ny === y)) continue;
      const m = win.wet[o] ?? 0;
      if (m <= OIL_EPS) continue;
      mv[o] = f(m * (a > 1 ? 1 : a));
      target[o] = ny * w + nx;
    }
  }
  const outH = new Float32Array(win.height);
  const outWet = new Float32Array(win.wet);
  const outR = new Float32Array(win.cr);
  const outG = new Float32Array(win.cg);
  const outB = new Float32Array(win.cb);
  const NB_DX = [-1, 1, 0, 0] as const;
  const NB_DY = [0, 0, -1, 1] as const;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = y * w + x;
      // 자기 유출 후 남는 양(색은 그대로)
      const v0 = volumeAt(win, o);
      const own = mv[o] ?? 0;
      const vr = v0 - own;
      const mr = (win.wet[o] ?? 0) - own;
      let cr = v0 > OIL_EPS ? (win.cr[o] ?? 0) / v0 : 0;
      let cg = v0 > OIL_EPS ? (win.cg[o] ?? 0) / v0 : 0;
      let cb = v0 > OIL_EPS ? (win.cb[o] ?? 0) / v0 : 0;
      let incoming = 0;
      for (let k = 0; k < 4; k += 1) {
        const sx = x + (NB_DX[k] ?? 0);
        const sy = y + (NB_DY[k] ?? 0);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const so = sy * w + sx;
        if ((target[so] ?? -1) !== o) continue;
        const q = mv[so] ?? 0;
        if (q <= 0) continue;
        const sv = volumeAt(win, so);
        if (sv <= OIL_EPS) continue;
        const qr = (win.cr[so] ?? 0) / sv;
        const qg = (win.cg[so] ?? 0) / sv;
        const qb = (win.cb[so] ?? 0) / sv;
        if (vr + incoming <= OIL_EPS) {
          cr = qr;
          cg = qg;
          cb = qb;
        } else {
          const t = q / (q + mixing * (mr + incoming) + 1e-9);
          [cr, cg, cb] = kmMixRgb([cr, cg, cb], [qr, qg, qb], t);
        }
        incoming += q;
      }
      const vNew = vr + incoming;
      outH[o] = f((win.base[o] ?? 0) + vNew);
      outWet[o] = f(mr + incoming);
      outR[o] = f(cr * vNew);
      outG[o] = f(cg * vNew);
      outB[o] = f(cb * vNew);
    }
  }
  win.height.set(outH);
  win.wet.set(outWet);
  win.cr.set(outR);
  win.cg.set(outG);
  win.cb.set(outB);
}

/**
 * 붓이 들고 있는 색을 갱신한다: 붓 아래 젖은 물감의 평균 색을 pickup 비율로 집어 들고(KM 혼색),
 * 매 dab 원래 색으로 조금 돌아간다(`OIL_RELOAD`). `weight`는 dab 영역의 cov·mask. 반환: 이번 dab이 쓸 색.
 */
export function updateOilCarry(
  win: OilWindow,
  weight: Float32Array,
  carry: OilCarry,
  dabColor: readonly [number, number, number],
  depositTotal: number,
  pickup: number,
): [number, number, number] {
  if (!carry.loaded) {
    carry.r = dabColor[0];
    carry.g = dabColor[1];
    carry.b = dabColor[2];
    carry.loaded = true;
    return [carry.r, carry.g, carry.b];
  }
  let mu = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  if (pickup > 0) {
    for (let o = 0; o < weight.length; o += 1) {
      const wgt = weight[o] ?? 0;
      if (wgt <= 0) continue;
      const m = win.wet[o] ?? 0;
      if (m <= OIL_EPS) continue;
      const v = volumeAt(win, o);
      if (v <= OIL_EPS) continue;
      const q = wgt * m;
      mu += q;
      sr += (q * (win.cr[o] ?? 0)) / v;
      sg += (q * (win.cg[o] ?? 0)) / v;
      sb += (q * (win.cb[o] ?? 0)) / v;
    }
  }
  let c: [number, number, number] = [carry.r, carry.g, carry.b];
  if (mu > OIL_EPS) {
    const wMix = (pickup * mu) / (mu + depositTotal + 1e-9);
    c = kmMixRgb(c, [sr / mu, sg / mu, sb / mu], wMix);
  }
  c = kmMixRgb(c, dabColor, OIL_RELOAD);
  carry.r = c[0];
  carry.g = c[1];
  carry.b = c[2];
  return c;
}

/**
 * 침착: dep[o]만큼 부피를 더하고 색을 섞는다. 아래 젖은 물감은 새 물감과 KM 혼색(가중 = dV / (dV + mixing·m)),
 * 마른 물감은 가려진다(가중 1). 새 물감은 젖어 있다.
 */
export function depositOilWindow(
  win: OilWindow,
  dep: Float32Array,
  color: readonly [number, number, number],
  mixing: number,
): void {
  for (let o = 0; o < dep.length; o += 1) {
    const dv = dep[o] ?? 0;
    if (dv <= 0) continue;
    const v0 = volumeAt(win, o);
    const m0 = win.wet[o] ?? 0;
    let cr = color[0];
    let cg = color[1];
    let cb = color[2];
    if (v0 > OIL_EPS && m0 > OIL_EPS) {
      const t = dv / (dv + mixing * m0 + 1e-9);
      [cr, cg, cb] = kmMixRgb([(win.cr[o] ?? 0) / v0, (win.cg[o] ?? 0) / v0, (win.cb[o] ?? 0) / v0], color, t);
    }
    const v1 = v0 + dv;
    win.height[o] = f((win.height[o] ?? 0) + dv);
    win.wet[o] = f(m0 + dv);
    win.cr[o] = f(cr * v1);
    win.cg[o] = f(cg * v1);
    win.cb[o] = f(cb * v1);
  }
}

/** 한 dab 영역의 평균 젖은 물감 색에 쓰는 가중 합(테스트·진단용): 창 전체 젖은 부피. */
export function oilWetVolume(win: OilWindow): number {
  let s = 0;
  for (let o = 0; o < win.wet.length; o += 1) s += win.wet[o] ?? 0;
  return s;
}

// ---- 레벨링·건조(서브스텝) ----

const PAD = TS + 2;
const PADC = PAD * PAD;

interface OilPadded {
  height: Float32Array;
  vol: Float32Array;
  wet: Float32Array;
  cr: Float32Array;
  cg: Float32Array;
  cb: Float32Array;
  valid: Uint8Array;
}

function newOilPadded(): OilPadded {
  return {
    height: new Float32Array(PADC),
    vol: new Float32Array(PADC),
    wet: new Float32Array(PADC),
    cr: new Float32Array(PADC),
    cg: new Float32Array(PADC),
    cb: new Float32Array(PADC),
    valid: new Uint8Array(PADC),
  };
}

function buildOilPadded(state: WetState, tile: number, out: OilPadded, active: ReadonlySet<number>): void {
  out.height.fill(0);
  out.vol.fill(0);
  out.wet.fill(0);
  out.cr.fill(0);
  out.cg.fill(0);
  out.cb.fill(0);
  out.valid.fill(0);
  const tx = tile % state.tilesX;
  const ty = Math.floor(tile / state.tilesX);
  for (let py = 0; py < PAD; py += 1) {
    for (let px = 0; px < PAD; px += 1) {
      const gx = tx * TS - 1 + px;
      const gy = ty * TS - 1 + py;
      if (gx < 0 || gy < 0 || gx >= state.tilesX * TS || gy >= state.tilesY * TS) continue;
      const nt = Math.floor(gy / TS) * state.tilesX + Math.floor(gx / TS);
      if (nt !== tile && !active.has(nt)) continue;
      const v = tileViews(state, nt, false);
      if (!v) continue;
      const i = (gy % TS) * TS + (gx % TS);
      const p = py * PAD + px;
      const h = v.core[WET_CH.height * TP + i] ?? 0;
      const b = v.ext[WET_EXT_CH.oilBase * TP + i] ?? 0;
      out.height[p] = h;
      out.vol[p] = h > b ? h - b : 0;
      out.wet[p] = v.ext[WET_EXT_CH.oilWet * TP + i] ?? 0;
      out.cr[p] = v.ext[WET_EXT_CH.oilR * TP + i] ?? 0;
      out.cg[p] = v.ext[WET_EXT_CH.oilG * TP + i] ?? 0;
      out.cb[p] = v.ext[WET_EXT_CH.oilB * TP + i] ?? 0;
      out.valid[p] = 1;
    }
  }
}

const FACE = [-1, 1, -PAD, PAD] as const;

/**
 * 유화 서브스텝: (1) Bingham 레벨링(젖은 물감만, 높이차가 항복 문턱을 넘는 면에서 유량 = rate·초과분, 면당 ≤ 원천 젖은 부피의 1/4)
 * (2) 젖은 부피 건조 감쇠. 반환: 레벨링 유량이 남아 계속 활성으로 둘 타일.
 */
export function stepOil(state: WetState, params: WetParams, hMs: number, tiles: readonly number[]): Set<number> {
  const keep = new Set<number>();
  const rate = OIL_LEVEL_RATE * (1 - params.viscosity) * (hMs / (1000 / 60));
  const yieldH = params.oilYield * OIL_YIELD_SCALE;
  if (rate > 0 && tiles.length > 0) {
    const activeSet = new Set(tiles);
    const padded = new Map<number, OilPadded>();
    for (const tile of tiles) {
      const pd = newOilPadded();
      buildOilPadded(state, tile, pd, activeSet);
      padded.set(tile, pd);
    }
    for (const tile of tiles) {
      const pd = padded.get(tile);
      const views = tileViews(state, tile, false);
      if (!pd || !views) continue;
      let moved = 0;
      for (let ly = 0; ly < TS; ly += 1) {
        for (let lx = 0; lx < TS; lx += 1) {
          const p = (ly + 1) * PAD + (lx + 1);
          const i = ly * TS + lx;
          const v = pd.vol[p] ?? 0;
          const h = pd.height[p] ?? 0;
          const m = pd.wet[p] ?? 0;
          let out = 0;
          let inV = 0;
          let inR = 0;
          let inG = 0;
          let inB = 0;
          for (let k = 0; k < 4; k += 1) {
            const q = p + (FACE[k] ?? 0);
            if (pd.valid[q] === 0) continue;
            const hq = pd.height[q] ?? 0;
            const dOut = h - hq - yieldH;
            if (dOut > 0 && m > OIL_EPS) out += Math.min(rate * dOut, 0.25 * m);
            const dIn = hq - h - yieldH;
            const mq = pd.wet[q] ?? 0;
            if (dIn > 0 && mq > OIL_EPS) {
              const fl = Math.min(rate * dIn, 0.25 * mq);
              const vq = Math.max(pd.vol[q] ?? 0, OIL_EPS);
              inV += fl;
              inR += (fl * (pd.cr[q] ?? 0)) / vq;
              inG += (fl * (pd.cg[q] ?? 0)) / vq;
              inB += (fl * (pd.cb[q] ?? 0)) / vq;
            }
          }
          if (out <= 0 && inV <= 0) continue;
          moved += out + inV;
          const cxr = v > OIL_EPS ? (pd.cr[p] ?? 0) / v : 0;
          const cxg = v > OIL_EPS ? (pd.cg[p] ?? 0) / v : 0;
          const cxb = v > OIL_EPS ? (pd.cb[p] ?? 0) / v : 0;
          views.core[WET_CH.height * TP + i] = f(h - out + inV);
          views.ext[WET_EXT_CH.oilWet * TP + i] = f(m - out + inV);
          views.ext[WET_EXT_CH.oilR * TP + i] = f((pd.cr[p] ?? 0) - out * cxr + inR);
          views.ext[WET_EXT_CH.oilG * TP + i] = f((pd.cg[p] ?? 0) - out * cxg + inG);
          views.ext[WET_EXT_CH.oilB * TP + i] = f((pd.cb[p] ?? 0) - out * cxb + inB);
        }
      }
      if (moved > 1e-5) keep.add(tile);
    }
  }
  // 건조: 젖은 부피가 시간척도 dryingMs로 줄어든다.
  const decay = 1 - Math.min(1, hMs / Math.max(1, params.dryingMs));
  for (const tile of state.oilTiles) {
    const views = tileViews(state, tile, false);
    if (!views) continue;
    for (let i = 0; i < TP; i += 1) {
      const m = views.ext[WET_EXT_CH.oilWet * TP + i] ?? 0;
      if (m > 0) views.ext[WET_EXT_CH.oilWet * TP + i] = m * decay < OIL_EPS ? 0 : f(m * decay);
    }
  }
  return keep;
}

// ---- 표시 합성·평탄화 ----

export interface OilCompositeStats {
  /** 합성한 셀 수. */
  cells: number;
}

/** 비파괴 합성: 물감 색을 α = kV/(1 + kV)로 `doc`(문서 복사본, 선형 premultiplied)에 올린다. */
export function compositeOilLayer(state: WetState, doc: Float32Array, width: number, clear = false): OilCompositeStats {
  let cells = 0;
  const tilesSorted = Array.from(state.oilTiles).sort((a, b) => a - b);
  for (const tile of tilesSorted) {
    const views = tileViews(state, tile, false);
    if (!views) continue;
    const tx = tile % state.tilesX;
    const ty = Math.floor(tile / state.tilesX);
    for (let ly = 0; ly < TS; ly += 1) {
      const py = ty * TS + ly;
      if (py >= state.height) continue;
      for (let lx = 0; lx < TS; lx += 1) {
        const px = tx * TS + lx;
        if (px >= state.width) continue;
        const i = ly * TS + lx;
        const h = views.core[WET_CH.height * TP + i] ?? 0;
        const b = views.ext[WET_EXT_CH.oilBase * TP + i] ?? 0;
        const v = h > b ? h - b : 0;
        if (v <= OIL_EPS) continue;
        const alpha = f((OIL_OPACITY_K * v) / (1 + OIL_OPACITY_K * v));
        const k = f(1 - alpha);
        const o = (py * width + px) * 4;
        doc[o] = f(((views.ext[WET_EXT_CH.oilR * TP + i] ?? 0) / v) * alpha + (doc[o] ?? 0) * k);
        doc[o + 1] = f(((views.ext[WET_EXT_CH.oilG * TP + i] ?? 0) / v) * alpha + (doc[o + 1] ?? 0) * k);
        doc[o + 2] = f(((views.ext[WET_EXT_CH.oilB * TP + i] ?? 0) / v) * alpha + (doc[o + 2] ?? 0) * k);
        doc[o + 3] = f(alpha + (doc[o + 3] ?? 0) * k);
        cells += 1;
        if (clear) {
          // 평탄화: 부피는 마른 릴리프로 굳고 색·젖음은 문서로 옮겨졌다.
          views.ext[WET_EXT_CH.oilBase * TP + i] = h;
          views.ext[WET_EXT_CH.oilWet * TP + i] = 0;
          views.ext[WET_EXT_CH.oilR * TP + i] = 0;
          views.ext[WET_EXT_CH.oilG * TP + i] = 0;
          views.ext[WET_EXT_CH.oilB * TP + i] = 0;
        }
      }
    }
  }
  return { cells };
}

/** 유화 물감 층을 문서에 굽고(부피는 마른 릴리프로 유지) 색·젖음을 비운다. */
export function flattenOil(state: WetState, doc: Float32Array, width: number): OilCompositeStats {
  return compositeOilLayer(state, doc, width, true);
}

/** 유화 물감(젖은 또는 마른)이 남아 있는 타일이 있는가. */
export function oilLayerHasPaint(state: WetState): boolean {
  for (const tile of state.oilTiles) {
    const views = tileViews(state, tile, false);
    if (!views) continue;
    for (let i = 0; i < TP; i += 1) {
      const h = views.core[WET_CH.height * TP + i] ?? 0;
      const b = views.ext[WET_EXT_CH.oilBase * TP + i] ?? 0;
      if (h - b > OIL_EPS) return true;
    }
  }
  return false;
}
