import { describe, expect, it } from "vitest";

import { presetById } from "../presets/catalog";
import { normalizeProgram } from "../presets/program-schema";
import { renderStroke, Surface } from "../raster/reference-renderer";
import { TILE_SIZE } from "../raster/tile-binning";
import { lineStroke } from "../testing/synthetic-strokes";
import { DEFAULT_PAPER_SPEC } from "../texture/paper-grain";

import {
  compositeOilLayer,
  depositOilWindow,
  flattenOil,
  loadOilWindow,
  newOilCarry,
  OIL_EPS,
  OIL_OPACITY_K,
  oilLayerHasPaint,
  oilWetVolume,
  pushOilWindow,
  stepOil,
  storeOilWindow,
  updateOilCarry,
} from "./oil-layer";
import { wetMediumPreset } from "./params";
import { createWetState, WET_CH, WET_EXT_CH } from "./state";

import type { OilWindow } from "./oil-layer";
import type { BrushProgram } from "../presets/program-schema";

const SIZE = 64;

/** 빈 상태에서 만든 w×h 로컬 창. */
function emptyWindow(w: number, h: number): OilWindow {
  const state = createWetState(SIZE, SIZE, (SIZE / TILE_SIZE) ** 2);
  return loadOilWindow(state, 0, 0, w - 1, h - 1);
}

function volumeOf(win: OilWindow): number {
  let v = 0;
  for (let o = 0; o < win.height.length; o += 1) v += Math.max(0, (win.height[o] ?? 0) - (win.base[o] ?? 0));
  return v;
}

function sum(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] ?? 0;
  return s;
}

/** 균일 색 물감 슬래브(중앙 사각형)를 깐다. */
function slab(win: OilWindow, x0: number, y0: number, x1: number, y1: number, thickness: number, color: readonly [number, number, number]): void {
  const dep = new Float32Array(win.w * win.h);
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) dep[y * win.w + x] = thickness;
  depositOilWindow(win, dep, color, 0);
}

describe("유화 물감 층: 부피 보존 밀기", () => {
  it("밀기는 총 부피·젖은 부피를 정확히 보존하고(캔버스 밖 유출 없음) 음수 부피를 만들지 않는다", () => {
    const win = emptyWindow(24, 24);
    slab(win, 6, 6, 17, 17, 1.5, [0.2, 0.4, 0.8]);
    const v0 = volumeOf(win);
    const w0 = oilWetVolume(win);
    const amount = new Float32Array(24 * 24);
    const dirX = new Int8Array(24 * 24);
    const dirY = new Int8Array(24 * 24);
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const o = y * 24 + x;
        amount[o] = 0.15 + 0.5 * ((x * 7 + y * 13) % 5) / 5;
        // 가장자리·모서리에서 밖으로 향하는 방향도 섞는다(밖으로는 보내지 않는다).
        const k = (x + 2 * y) % 4;
        dirX[o] = k === 0 ? 1 : k === 1 ? -1 : 0;
        dirY[o] = k === 2 ? 1 : k === 3 ? -1 : 0;
      }
    }
    for (let pass = 0; pass < 12; pass += 1) pushOilWindow(win, amount, dirX, dirY, 0.6);
    expect(volumeOf(win)).toBeCloseTo(v0, 3);
    expect(oilWetVolume(win)).toBeCloseTo(w0, 3);
    for (let o = 0; o < win.height.length; o += 1) {
      expect((win.height[o] ?? 0) - (win.base[o] ?? 0)).toBeGreaterThanOrEqual(-1e-6);
      expect(win.wet[o] ?? 0).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("단색 물감의 색 질량(색 × 부피)도 밀기로 보존된다", () => {
    const win = emptyWindow(24, 24);
    slab(win, 4, 4, 15, 15, 1.2, [0.6, 0.3, 0.1]);
    const before = [sum(win.cr), sum(win.cg), sum(win.cb)];
    const amount = new Float32Array(24 * 24).fill(0.4);
    const dirX = new Int8Array(24 * 24).fill(1);
    const dirY = new Int8Array(24 * 24);
    for (let pass = 0; pass < 8; pass += 1) pushOilWindow(win, amount, dirX, dirY, 0.6);
    expect(sum(win.cr)).toBeCloseTo(before[0] ?? 0, 2);
    expect(sum(win.cg)).toBeCloseTo(before[1] ?? 0, 2);
    expect(sum(win.cb)).toBeCloseTo(before[2] ?? 0, 2);
    // 진행 방향(+x)으로 물감이 이동했다: 무게중심이 오른쪽으로 간다.
    let mx = 0;
    let m = 0;
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const v = (win.height[y * 24 + x] ?? 0) - (win.base[y * 24 + x] ?? 0);
        mx += v * x;
        m += v;
      }
    }
    expect(mx / m).toBeGreaterThan(9.5 + 0.5);
  });

  it("KM 혼색: 도착한 물감은 이웃 젖은 물감과 섞여 두 색 사이가 되고(혼색 깊이 > 0), 깊이 0이면 도착 색이 덮는다", () => {
    const mixed = (mixing: number): [number, number, number] => {
      const win = emptyWindow(8, 1);
      slab(win, 0, 0, 3, 0, 1, [0.9, 0.05, 0.05]); // 빨강 (x 0..3)
      slab(win, 4, 0, 7, 0, 1, [0.05, 0.05, 0.9]); // 파랑 (x 4..7)
      const amount = new Float32Array(8);
      const dirX = new Int8Array(8);
      const dirY = new Int8Array(8);
      amount[3] = 0.5; // 빨강 가장자리 한 칸이 파랑 쪽(+x)으로 밀린다.
      dirX[3] = 1;
      pushOilWindow(win, amount, dirX, dirY, mixing);
      const v = (win.height[4] ?? 0) - (win.base[4] ?? 0);
      return [(win.cr[4] ?? 0) / v, (win.cg[4] ?? 0) / v, (win.cb[4] ?? 0) / v];
    };
    const m = mixed(1);
    const covered = mixed(0);
    // 파랑(0.05, 0.05, 0.9) 위에 빨강이 1/3 섞인다(KM은 K/S 공간 혼합이라 어두운 파랑 쪽으로 치우친다):
    // 빨강 채널은 파랑보다 커지고 덮어쓴 경우보다 작으며, 파랑 채널은 순파랑보다 작다.
    expect(m[0]).toBeGreaterThan(0.05 + 0.01);
    expect(m[0]).toBeLessThan(covered[0]);
    expect(m[2]).toBeLessThan(0.9 - 0.02);
    expect(m[2]).toBeGreaterThan(covered[2]);
    expect(covered[0]).toBeGreaterThan(0.85);
    expect(covered[2]).toBeLessThan(0.1);
  });
});

describe("유화 물감 층: 침착·표시 합성·평탄화", () => {
  it("침착은 부피를 더하고 젖은 부피도 같이 늘며, 불투명도 α = kV/(1 + kV)로 문서에 올라간다", () => {
    const state = createWetState(SIZE, SIZE, 16);
    const win = loadOilWindow(state, 8, 8, 23, 23);
    const dep = new Float32Array(win.w * win.h).fill(0.25);
    depositOilWindow(win, dep, [0.2, 0.6, 0.3], 0.6);
    storeOilWindow(state, win);
    expect(volumeOf(win)).toBeCloseTo(0.25 * 16 * 16, 3);
    expect(oilWetVolume(win)).toBeCloseTo(0.25 * 16 * 16, 3);
    expect(oilLayerHasPaint(state)).toBe(true);

    const doc = new Float32Array(SIZE * SIZE * 4);
    const stats = compositeOilLayer(state, doc, SIZE);
    expect(stats.cells).toBe(16 * 16);
    const o = (12 * SIZE + 12) * 4;
    const alpha = (OIL_OPACITY_K * 0.25) / (1 + OIL_OPACITY_K * 0.25);
    expect(doc[o + 3]).toBeCloseTo(alpha, 6);
    expect(doc[o]).toBeCloseTo(0.2 * alpha, 5);
    expect(doc[o + 1]).toBeCloseTo(0.6 * alpha, 5);
    // 비파괴 합성은 상태를 바꾸지 않는다.
    expect(oilLayerHasPaint(state)).toBe(true);
  });

  it("평탄화: 색은 문서로 옮겨지고 부피는 마른 릴리프로 굳으며 두 번 굽는 일이 없다", () => {
    const state = createWetState(SIZE, SIZE, 16);
    const win = loadOilWindow(state, 8, 8, 23, 23);
    depositOilWindow(win, new Float32Array(win.w * win.h).fill(0.3), [0.5, 0.2, 0.1], 0.6);
    storeOilWindow(state, win);
    const doc = new Float32Array(SIZE * SIZE * 4);
    flattenOil(state, doc, SIZE);
    const o = (12 * SIZE + 12) * 4;
    expect(doc[o + 3]).toBeGreaterThan(0.5);
    // 릴리프 높이는 남고(H = B) 젖은 부피·색은 0이다.
    const slot = state.pool.slotOf(Math.floor(12 / TILE_SIZE) * state.tilesX + Math.floor(12 / TILE_SIZE));
    const eSlot = state.ext?.slotOf(Math.floor(12 / TILE_SIZE) * state.tilesX + Math.floor(12 / TILE_SIZE));
    if (slot === undefined || eSlot === undefined || !state.ext) throw new Error("타일 없음");
    const i = (12 % TILE_SIZE) * TILE_SIZE + (12 % TILE_SIZE);
    const core = state.pool.view(slot);
    const ext = state.ext.view(eSlot);
    expect(core[WET_CH.height * 256 + i]).toBeCloseTo(0.3, 6);
    expect(ext[WET_EXT_CH.oilBase * 256 + i]).toBeCloseTo(0.3, 6);
    expect(ext[WET_EXT_CH.oilWet * 256 + i]).toBe(0);
    expect(oilLayerHasPaint(state)).toBe(false);
    const copy = new Float32Array(doc);
    flattenOil(state, doc, SIZE);
    expect(doc).toEqual(copy);
  });

  it("타일 경계를 가로지르는 창을 되써도 첫 셀이 비었다는 이유로 물감이 사라지지 않는다(저장 순서 회귀)", () => {
    const state = createWetState(SIZE, SIZE, 16);
    // 창은 타일 (0,0)과 (1,0)에 걸치고 타일 (1,0)의 왼쪽 위 셀(16, 0)은 비어 있다. 물감은 (20, 5)에만 있다.
    const win = loadOilWindow(state, 12, 0, 27, 7);
    const dep = new Float32Array(win.w * win.h);
    dep[5 * win.w + (20 - 12)] = 0.7;
    depositOilWindow(win, dep, [0.3, 0.3, 0.3], 0.6);
    storeOilWindow(state, win);
    const reloaded = loadOilWindow(state, 12, 0, 27, 7);
    expect(volumeOf(reloaded)).toBeCloseTo(0.7, 6);
    expect(state.oilTiles.has(1)).toBe(true);
    // 물감이 없는 창은 타일을 만들지 않는다.
    const clean = createWetState(SIZE, SIZE, 16);
    storeOilWindow(clean, loadOilWindow(clean, 0, 0, 31, 31));
    expect(clean.pool.used()).toBe(0);
    expect(clean.oilTiles.size).toBe(0);
  });
});

describe("유화 물감 층: 레벨링과 건조 시간", () => {
  /** 한 타일 가운데에 봉우리 하나를 둔 상태와 활성 타일 목록. */
  function ridgeState(height: number): { state: ReturnType<typeof createWetState>; tiles: number[] } {
    const state = createWetState(SIZE, SIZE, 16);
    const win = loadOilWindow(state, 16, 16, 31, 31);
    const dep = new Float32Array(win.w * win.h);
    dep[8 * win.w + 8] = height;
    dep[8 * win.w + 7] = height * 0.5;
    depositOilWindow(win, dep, [0.4, 0.4, 0.4], 0.6);
    storeOilWindow(state, win);
    const tiles = [1 * 4 + 1];
    for (const t of tiles) state.active.add(t);
    return { state, tiles };
  }

  function totalHeight(state: ReturnType<typeof createWetState>): number {
    const slot = state.pool.slotOf(5);
    if (slot === undefined) return 0;
    const core = state.pool.view(slot);
    let s = 0;
    for (let i = 0; i < 256; i += 1) s += core[WET_CH.height * 256 + i] ?? 0;
    return s;
  }

  it("항복 문턱을 넘는 높이차만 흐르고(점도 1이면 정지), 레벨링은 총 높이를 보존한다", () => {
    const soft = wetMediumPreset("oil", { viscosity: 0.2, oilYield: 0.25 });
    const stiff = wetMediumPreset("oil", { viscosity: 1 });
    const a = ridgeState(3);
    const h0 = totalHeight(a.state);
    let moved = 0;
    for (let i = 0; i < 40; i += 1) moved += stepOil(a.state, soft, 1000 / 60, a.tiles).size;
    expect(moved).toBeGreaterThan(0);
    expect(totalHeight(a.state)).toBeCloseTo(h0, 3);
    // 봉우리가 낮아졌다(흘렀다).
    const slot = a.state.pool.slotOf(5);
    expect(slot).not.toBeUndefined();
    const peak = slot === undefined ? 0 : (a.state.pool.view(slot)[WET_CH.height * 256 + 8 * 16 + 8] ?? 0);
    expect(peak).toBeLessThan(3);

    const b = ridgeState(3);
    for (let i = 0; i < 40; i += 1) stepOil(b.state, stiff, 1000 / 60, b.tiles);
    const slotB = b.state.pool.slotOf(5);
    const peakB = slotB === undefined ? 0 : (b.state.pool.view(slotB)[WET_CH.height * 256 + 8 * 16 + 8] ?? 0);
    expect(peakB).toBeCloseTo(3, 5);
  });

  it("항복 문턱 이하의 완만한 높이차는 점도가 낮아도 그대로 남는다(Bingham)", () => {
    const params = wetMediumPreset("oil", { viscosity: 0, oilYield: 0.5 });
    const { state, tiles } = ridgeState(0.2);
    const before = totalHeight(state);
    for (let i = 0; i < 30; i += 1) stepOil(state, params, 1000 / 60, tiles);
    const slot = state.pool.slotOf(5);
    const peak = slot === undefined ? 0 : (state.pool.view(slot)[WET_CH.height * 256 + 8 * 16 + 8] ?? 0);
    expect(peak).toBeCloseTo(0.2, 5);
    expect(totalHeight(state)).toBeCloseTo(before, 5);
  });

  it("건조: 젖은 부피가 dryingMs 시간척도로 줄고, 마른 물감(부피)은 그대로 남아 릴리프가 된다", () => {
    const params = wetMediumPreset("oil", { dryingMs: 2000, viscosity: 1 });
    const { state, tiles } = ridgeState(1);
    const wetBefore = (() => {
      const e = state.ext?.view(state.ext.slotOf(5) ?? 0);
      let s = 0;
      for (let i = 0; i < 256; i += 1) s += e?.[WET_EXT_CH.oilWet * 256 + i] ?? 0;
      return s;
    })();
    for (let i = 0; i < 60; i += 1) stepOil(state, params, 1000 / 60, tiles);
    const e = state.ext?.view(state.ext.slotOf(5) ?? 0);
    let wetAfter = 0;
    for (let i = 0; i < 256; i += 1) wetAfter += e?.[WET_EXT_CH.oilWet * 256 + i] ?? 0;
    // 1초 = 60 스텝, 시간척도 2초: 젖은 부피 ≈ exp(−0.5)배.
    expect(wetAfter / wetBefore).toBeCloseTo(Math.exp(-0.5), 1);
    expect(totalHeight(state)).toBeCloseTo(1.5, 5);
    // 오래 지나면 사실상 완전히 마른다(젖은 부피 < ε).
    for (let i = 0; i < 1500; i += 1) stepOil(state, params, 1000 / 60, tiles);
    let wetEnd = 0;
    const e2 = state.ext?.view(state.ext.slotOf(5) ?? 0);
    for (let i = 0; i < 256; i += 1) wetEnd += e2?.[WET_EXT_CH.oilWet * 256 + i] ?? 0;
    expect(wetEnd).toBeLessThan(OIL_EPS * 256 * 100);
  });
});

describe("유화 붓: 픽업·점도 전단·스머지 상호작용(Surface)", () => {
  /** 점도만 바꾼 유화 프로그램. 침착을 거의 끄고(flow ≈ 0) 밀기만 본다. */
  function pushProgram(viscosity: number, flow = 1e-4): BrushProgram {
    const base = presetById("oil-impasto");
    return normalizeProgram({
      ...base,
      deposition: { ...base.deposition, flow },
      paper: { ...base.paper, enabled: false },
      wet: wetMediumPreset("oil", { viscosity }),
    });
  }

  /** 미리 물감 띠를 깔아 둔 표면: 가운데 가로 띠(두께 1.5)를 젖은 상태로. */
  function prepaintedSurface(): Surface {
    const surface = new Surface(SIZE, SIZE);
    const warm = pushProgram(0.5);
    surface.beginStroke(warm, 1);
    surface.endStroke();
    const wet = surface.wet;
    if (!wet) throw new Error("습식 상태 없음");
    const win = loadOilWindow(wet, 0, 20, SIZE - 1, 43);
    const dep = new Float32Array(win.w * win.h);
    for (let y = 8; y < 16; y += 1) for (let x = 6; x < 58; x += 1) dep[y * win.w + x] = 1.5;
    depositOilWindow(win, dep, [0.8, 0.2, 0.1], 0.6);
    storeOilWindow(wet, win);
    return surface;
  }

  /** 총 물감 부피와 y 방향 무게중심(경계 안). */
  function slabStats(surface: Surface): { volume: number; meanY: number; meanX: number } {
    const wet = surface.wet;
    if (!wet) throw new Error("습식 상태 없음");
    const win = loadOilWindow(wet, 0, 0, SIZE - 1, SIZE - 1);
    let v = 0;
    let my = 0;
    let mx = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const o = y * SIZE + x;
        const vv = Math.max(0, (win.height[o] ?? 0) - (win.base[o] ?? 0));
        v += vv;
        my += vv * y;
        mx += vv * x;
      }
    }
    return { volume: v, meanY: my / v, meanX: mx / v };
  }

  it("점도가 낮을수록 붓이 젖은 물감을 더 많이 밀고(무게중심 이동·고랑), 총 부피는 보존된다(침착 ≈ 0)", () => {
    const shifts = [0, 0.5, 1].map((viscosity) => {
      const surface = prepaintedSurface();
      const before = slabStats(surface);
      // 띠(y 28..35)를 위에서 아래로 가로지르는 획: 아래(+y)로 민다.
      const program = pushProgram(viscosity);
      renderStroke(program, lineStroke(32, 22, 32, 42, 0.8, { durationMs: 300 }), { width: SIZE, height: SIZE, seed: 1, surface });
      const after = slabStats(surface);
      // 점도에 따른 레벨링·건조 때문에 정확히 같지는 않지만 침착이 거의 없으므로 부피는 유지된다.
      expect(after.volume / before.volume).toBeCloseTo(1, 1);
      return Math.abs(after.meanY - before.meanY);
    });
    expect(shifts[0]).toBeGreaterThan(shifts[1] ?? 0);
    expect(shifts[1]).toBeGreaterThan(shifts[2] ?? 0);
    expect(shifts[2]).toBeLessThan(1e-3);
  }, 30_000);

  it("붓 픽업: 젖은 물감 위를 지나면 붓 색이 그 색 쪽으로 이동하고, 픽업 0이면 붓 원래 색을 유지한다", () => {
    const win = emptyWindow(8, 8);
    slab(win, 0, 0, 7, 7, 1, [0.9, 0.1, 0.1]); // 빨강 젖은 물감
    const weight = new Float32Array(64).fill(1);
    const brush: [number, number, number] = [0.1, 0.1, 0.9]; // 파랑 붓
    const picked = newOilCarry();
    updateOilCarry(win, weight, picked, brush, 1, 0.5); // 첫 dab: 붓 색을 싣는다
    const c1 = updateOilCarry(win, weight, picked, brush, 1, 0.5);
    expect(c1[0]).toBeGreaterThan(0.1 + 0.05);
    expect(c1[2]).toBeLessThan(0.9 - 0.05);
    const clean = newOilCarry();
    updateOilCarry(win, weight, clean, brush, 1, 0);
    const c0 = updateOilCarry(win, weight, clean, brush, 1, 0);
    expect(c0[2]).toBeGreaterThan(0.85);
  });

  it("건식·수채 획이 시작되면 유화 층을 먼저 문서에 굽는다(쌓는 순서 보존), 스머지는 구운 색을 집는다", () => {
    const surface = new Surface(SIZE, SIZE);
    const oil = presetById("oil-impasto");
    renderStroke(oil, lineStroke(10, 32, 54, 32, 0.8, { durationMs: 300 }), { width: SIZE, height: SIZE, seed: 1, surface });
    const wet = surface.wet;
    if (!wet) throw new Error("습식 상태 없음");
    expect(oilLayerHasPaint(wet)).toBe(true);
    const docA = ((32 * SIZE) + 32) * 4 + 3;
    expect(surface.document[docA]).toBe(0); // 아직 문서에 굽지 않았다(표시 시점 합성)
    expect(surface.toLinear()[docA]).toBeGreaterThan(0.3);
    const smudge = presetById("smudge-blend");
    renderStroke(smudge, lineStroke(10, 32, 54, 32, 0.7, { durationMs: 200 }), { width: SIZE, height: SIZE, seed: 2, surface });
    // 스머지 획이 시작되며 유화 층이 문서에 구워졌다: 문서에 색이 있고 유화 층은 마른 릴리프만 남는다.
    expect(surface.document[docA]).toBeGreaterThan(0.3);
    expect(oilLayerHasPaint(wet)).toBe(false);
    expect(surface.heightMap(wet).some((h) => h > 0)).toBe(true);
  }, 30_000);

  it("유화 색은 타일 경계(16 px)에서 이음새가 없다: 경계 열의 평균 알파 기울기가 안쪽과 같은 수준이다", () => {
    const size = 96;
    const surface = new Surface(size, size);
    renderStroke(presetById("oil-impasto"), lineStroke(8, 48, 88, 48, 0.7, { durationMs: 400 }), { width: size, height: size, seed: 3, surface });
    const wet = surface.wet;
    if (!wet) throw new Error("습식 상태 없음");
    const win = loadOilWindow(wet, 0, 0, size - 1, size - 1);
    const alpha = (x: number, y: number): number => {
      const o = y * size + x;
      const v = Math.max(0, (win.height[o] ?? 0) - (win.base[o] ?? 0));
      return (OIL_OPACITY_K * v) / (1 + OIL_OPACITY_K * v);
    };
    let bs = 0;
    let bn = 0;
    let is = 0;
    let inn = 0;
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        if (alpha(x, y) <= 0.05) continue;
        const d = Math.abs(alpha(x, y) - alpha(x - 1, y));
        if (x % TILE_SIZE === 0) {
          bs += d;
          bn += 1;
        } else {
          is += d;
          inn += 1;
        }
      }
    }
    expect(bn).toBeGreaterThan(5);
    expect(bs / bn / (is / inn)).toBeLessThan(1.5);
  }, 30_000);

  it("기본 종이 스펙 상수는 유지된다(회귀: 종이 비활성 프로그램 경로가 종이 없이 동작)", () => {
    expect(DEFAULT_PAPER_SPEC.enabled).toBe(true);
    const program = pushProgram(0.5);
    expect(program.paper.enabled).toBe(false);
    expect(program.wet?.medium).toBe("oil");
  });
});
