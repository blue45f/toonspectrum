import { describe, expect, it } from "vitest";

import { DabBatch } from "../core/dab-layout";
import { binDabs, TILE_PIXELS, TILE_SIZE } from "../raster/tile-binning";
import { DEFAULT_PAPER_SPEC, generatePaper, samplePaper } from "../texture/paper-grain";

import { snapshotActive } from "./active-tiles";
import { IMPASTO_SHININESS, impastoLighting, impastoSpecular, impastoSpecularFlat, pushHeightField, relaxHeight, wetHeightAccess } from "./impasto";
import { compositeWaterLayer } from "./layer-composite";
import { DEFAULT_WET_PARAMS, normalizeWetParams, WET_KERNEL, wetParamsSchema } from "./params";
import { createWetState, WET_CH, WET_CHANNELS, WET_FLOATS_PER_TILE, wetTotals } from "./state";
import { BAKE_MASS_TO_ALPHA, bakeWet, depositWet, snapshotConcentration, stepWet } from "./wet-reference";

import type { WetParams } from "./params";
import type { WetState } from "./state";
import type { DabInstance } from "../core/types";

const SIZE = 128;
const TILES = SIZE / TILE_SIZE;
const CENTER = SIZE / 2;
const RADIUS = 12;
const FRAME_MS = 1000 / 60;

function dab(partial: Partial<DabInstance> = {}): DabInstance {
  return {
    x: CENTER,
    y: CENTER,
    rx: RADIUS,
    ry: RADIUS,
    angle: 0,
    hardness: 1,
    flow: 1,
    shapeExp: 2,
    r: 0.2,
    g: 0.1,
    b: 0.6,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 1,
    pigmentMass: 0.5,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "wet-flow",
    ...partial,
  };
}

/** 원판 1개를 투입한 상태. */
function disc(water = 1, extra: Partial<DabInstance> = {}): WetState {
  const state = createWetState(SIZE, SIZE, TILES * TILES);
  const batch = new DabBatch(1);
  batch.push(dab({ wet: water, ...extra }));
  depositWet(state, batch, binDabs(batch, TILES, TILES));
  return state;
}

/** 채널 ch를 문서 크기 배열로 모은다(미할당 타일 0). */
function field(state: WetState, ch: number): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  for (const [tile, slot] of state.pool.entries()) {
    const data = state.pool.view(slot);
    const tx = tile % TILES;
    const ty = Math.floor(tile / TILES);
    for (let ly = 0; ly < TILE_SIZE; ly += 1) {
      for (let lx = 0; lx < TILE_SIZE; lx += 1) {
        out[(ty * TILE_SIZE + ly) * SIZE + tx * TILE_SIZE + lx] = data[ch * TILE_PIXELS + ly * TILE_SIZE + lx] ?? 0;
      }
    }
  }
  return out;
}

function dryOut(state: WetState, params: WetParams): number {
  let steps = 0;
  for (; steps < 4000; steps += 1) {
    if (stepWet(state, params, FRAME_MS, null).activeTiles === 0) break;
  }
  return steps;
}

/** 침착 footprint의 바깥 ringPx 링 평균 / 내부 평균(벤치 edgeDarkeningRatio와 같은 정의). */
function ringRatio(fixed: Float32Array, ringPx: number): number {
  let max = 0;
  for (let i = 0; i < fixed.length; i += 1) max = Math.max(max, fixed[i] ?? 0);
  const mask = new Uint8Array(fixed.length);
  for (let i = 0; i < fixed.length; i += 1) mask[i] = (fixed[i] ?? 0) > max * 1e-3 ? 1 : 0;
  let core = mask;
  for (let k = 0; k < ringPx; k += 1) {
    const next = new Uint8Array(core.length);
    for (let y = 1; y < SIZE - 1; y += 1) {
      for (let x = 1; x < SIZE - 1; x += 1) {
        const i = y * SIZE + x;
        next[i] = core[i] && core[i - 1] && core[i + 1] && core[i - SIZE] && core[i + SIZE] ? 1 : 0;
      }
    }
    core = next;
  }
  let ring = 0;
  let rn = 0;
  let inner = 0;
  let inn = 0;
  for (let i = 0; i < fixed.length; i += 1) {
    if (!mask[i]) continue;
    if (core[i]) {
      inner += fixed[i] ?? 0;
      inn += 1;
    } else {
      ring += fixed[i] ?? 0;
      rn += 1;
    }
  }
  return inn > 0 && rn > 0 ? ring / rn / (inner / inn) : 0;
}

describe("습식 CPU 참조 커널", () => {
  it("레이아웃: 12채널·256 픽셀, 채널 인덱스가 0..11을 한 번씩 덮는다", () => {
    expect(WET_CHANNELS).toBe(12);
    expect(WET_FLOATS_PER_TILE).toBe(12 * 256);
    expect(Object.values(WET_CH).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("wetParamsSchema: 기본값 채움, 범위 밖 거부", () => {
    expect(normalizeWetParams({})).toEqual(DEFAULT_WET_PARAMS);
    expect(normalizeWetParams(undefined)).toEqual(DEFAULT_WET_PARAMS);
    expect(() => wetParamsSchema.parse({ diffusion: 2 })).toThrow();
    expect(() => wetParamsSchema.parse({ substeps: 0 })).toThrow();
    expect(normalizeWetParams({ edgeDarkening: 1.5 }).edgeDarkening).toBe(1.5);
  });

  it("depositWet: 커버리지 가중 투입(Σwater ≈ π·r²·wet, 0.5% 이내)·활성 타일 = dirty + 1링", () => {
    const state = disc(1);
    const totals = wetTotals(state);
    expect(Math.abs(totals.water / (Math.PI * RADIUS * RADIUS) - 1)).toBeLessThan(0.005);
    expect(Math.abs(totals.pigment / (0.5 * Math.PI * RADIUS * RADIUS) - 1)).toBeLessThan(0.005);
    expect(totals.fixed).toBe(0);
    // 원판은 타일 (3,3)(3,4)(4,3)(4,4)에 걸치고 1링을 더해 4×4 = 16 타일이 활성
    expect(state.active.size).toBe(16);
    expect(state.view(0)).toBeNull();
  });

  it("질량 보존: Σwater(전) = Σwater(후) + 증발(흡수는 내부 이동), 안료 + 침착 총량 불변(상대 1e-5)", () => {
    const state = disc(2);
    const pigment0 = wetTotals(state).pigment;
    for (let i = 0; i < 40; i += 1) {
      const before = wetTotals(state).water;
      const r = stepWet(state, DEFAULT_WET_PARAMS, FRAME_MS, null);
      expect(Math.abs(r.waterTotal + r.evaporated - before)).toBeLessThanOrEqual(1e-5 * Math.max(before, 1e-6));
      expect(Math.abs(r.pigmentTotal + r.fixedTotal - pigment0)).toBeLessThanOrEqual(1e-5 * pigment0);
      expect(r.absorbed).toBeGreaterThanOrEqual(0);
      if (r.activeTiles === 0) break;
    }
  });

  it("음수 없음·분산 단조 증가(확산)·젖음 전선의 흐름층 속도는 바깥을 향한다", () => {
    const state = disc(2);
    // 증발·흡수를 끄고 순수 흐름·확산만 본다(일정 증발은 얇은 가장자리를 먼저 지워 분산을 줄일 수 있다).
    const diffusionOnly: WetParams = { ...DEFAULT_WET_PARAMS, evaporation: 0, capillary: 0, dryingMs: 60000 };
    let prevVar = -1;
    for (let i = 0; i < 12; i += 1) {
      stepWet(state, diffusionOnly, FRAME_MS, null);
      const w = field(state, WET_CH.water);
      let m0 = 0;
      let m2 = 0;
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const v = w[y * SIZE + x] ?? 0;
          m0 += v;
          m2 += v * ((x + 0.5 - CENTER) ** 2 + (y + 0.5 - CENTER) ** 2);
        }
      }
      const variance = m2 / m0;
      // f32 반올림 잡음(≈1e-7)을 허용하는 단조 증가.
      expect(variance).toBeGreaterThan(prevVar - 1e-6);
      prevVar = variance;
      let negatives = 0;
      for (let ch = 0; ch < WET_CHANNELS; ch += 1) {
        if (ch === WET_CH.velocityX || ch === WET_CH.velocityY) continue;
        const f = field(state, ch);
        for (let k = 0; k < f.length; k += 1) if ((f[k] ?? 0) < 0) negatives += 1;
      }
      expect(negatives).toBe(0);
    }
    // 흐름층 속도(코어 vx, vy)의 반지름 성분 평균: 젖음 전선 고리에서 바깥(+)이다.
    const vx = field(state, WET_CH.velocityX);
    const vy = field(state, WET_CH.velocityY);
    let radial = 0;
    let n = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const dx = x + 0.5 - CENTER;
        const dy = y + 0.5 - CENTER;
        const r = Math.hypot(dx, dy);
        if (r < RADIUS - 4 || r > RADIUS + 4 || (vx[y * SIZE + x] ?? 0) === 0) continue;
        radial += ((vx[y * SIZE + x] ?? 0) * dx + (vy[y * SIZE + x] ?? 0) * dy) / r;
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(radial / n).toBeGreaterThan(0);
  });

  it("대칭 초기조건은 x·y 거울 대칭을 유지한다(|Δ| ≤ 1e-5)", () => {
    const state = disc(2);
    for (let i = 0; i < 10; i += 1) stepWet(state, DEFAULT_WET_PARAMS, FRAME_MS, null);
    for (const ch of [WET_CH.water, WET_CH.pigmentMass, WET_CH.fixedMass]) {
      const f = field(state, ch);
      let worst = 0;
      let nonzero = 0;
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const v = f[y * SIZE + x] ?? 0;
          if (v !== 0) nonzero += 1;
          worst = Math.max(worst, Math.abs(v - (f[y * SIZE + (SIZE - 1 - x)] ?? 0)), Math.abs(v - (f[(SIZE - 1 - y) * SIZE + x] ?? 0)));
        }
      }
      expect(worst, `channel ${ch}`).toBeLessThanOrEqual(1e-5);
      if (ch !== WET_CH.fixedMass) expect(nonzero).toBeGreaterThan(0);
    }
  });

  it("에지 다크닝: 건조 후 바깥 3 px 링/내부 침착비가 기본값(0.8)에서 ≥ 1.15, edgeDarkening에 단조", () => {
    const ratios = [0, 0.8, 1.5].map((edgeDarkening) => {
      const state = disc(1);
      dryOut(state, { ...DEFAULT_WET_PARAMS, edgeDarkening });
      expect(wetTotals(state).water).toBe(0);
      return ringRatio(field(state, WET_CH.fixedMass), 3);
    });
    expect(ratios[1]).toBeGreaterThanOrEqual(1.15);
    expect(ratios[2]).toBeGreaterThan(ratios[1] ?? 0);
    expect(ratios[1]).toBeGreaterThan(ratios[0] ?? 0);
    expect(ratios[0]).toBeLessThan(1.05);
    expect(WET_KERNEL.edgeAdvectionScale).toBeGreaterThan(0);
  });

  it("그래뉼레이션: granulation이 클수록 안료가 종이 요철의 골로 모여 침착이 종이 높이에 더 음의 방향으로 민감하다", () => {
    const spec = { ...DEFAULT_PAPER_SPEC, roughness: 0.8 };
    const paper = generatePaper(spec);
    /** 중심 근처(반경 18 이내) 침착의 종이 높이 회귀 기울기 / 평균 침착. */
    const sensitivity = (granulation: number): number => {
      const state = disc(1.2, { rx: 30, ry: 30, pigmentMass: 0.3 });
      for (let i = 0; i < 900; i += 1) {
        if (stepWet(state, { ...DEFAULT_WET_PARAMS, granulation }, FRAME_MS, paper, { paperSpec: spec }).activeTiles === 0) break;
      }
      const dep = snapshotConcentration(state).deposited;
      const a: number[] = [];
      const b: number[] = [];
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          if (Math.hypot(x + 0.5 - CENTER, y + 0.5 - CENTER) > 18) continue;
          a.push(dep[y * SIZE + x] ?? 0);
          b.push(samplePaper(paper, x + 0.5, y + 0.5, spec).bump);
        }
      }
      const ma = a.reduce((s2, v) => s2 + v, 0) / a.length;
      const mb = b.reduce((s2, v) => s2 + v, 0) / b.length;
      let sab = 0;
      let sbb = 0;
      for (let i = 0; i < a.length; i += 1) {
        sab += ((a[i] ?? 0) - ma) * ((b[i] ?? 0) - mb);
        sbb += ((b[i] ?? 0) - mb) ** 2;
      }
      return sab / sbb / ma;
    };
    const none = sensitivity(0);
    const some = sensitivity(0.5);
    const strong = sensitivity(1);
    expect(Math.abs(none)).toBeLessThan(0.2);
    expect(some).toBeLessThan(none - 0.5);
    expect(strong).toBeLessThan(some - 0.3);
  }, 30_000);

  it("활성 타일 밖의 할당 타일은 변하지 않고, 건조 뒤에는 fixed가 불변이며 결정적이다", () => {
    const state = disc(1);
    const far = TILES * TILES - 1;
    const t = state.touch(far);
    t.water[0] = 0.5;
    t.pigment[3 * TILE_PIXELS] = 0.25;
    expect(state.active.has(far)).toBe(false);
    const steps = dryOut(state, DEFAULT_WET_PARAMS);
    expect(steps).toBeGreaterThan(0);
    expect(state.view(far)?.water[0]).toBe(0.5);
    expect(state.view(far)?.pigment[3 * TILE_PIXELS]).toBe(0.25);
    const fixedA = field(state, WET_CH.fixedMass);
    for (let i = 0; i < 5; i += 1) {
      const r = stepWet(state, DEFAULT_WET_PARAMS, FRAME_MS, null);
      expect(r.activeTiles).toBe(0);
    }
    expect(field(state, WET_CH.fixedMass)).toEqual(fixedA);
    // 결정성: 다시 만들어 같은 스텝 → 같은 바이트
    const again = disc(1);
    const t2 = again.touch(far);
    t2.water[0] = 0.5;
    t2.pigment[3 * TILE_PIXELS] = 0.25;
    expect(dryOut(again, DEFAULT_WET_PARAMS)).toBe(steps);
    expect(field(again, WET_CH.fixedMass)).toEqual(fixedA);
    expect(field(again, WET_CH.fixedR)).toEqual(field(state, WET_CH.fixedR));
  });

  it("bakeWet: alpha = 1 − exp(−3·mass), 색은 질량 가중 평균(침착 + 고정), 구운 뒤 안료는 비워진다(재굽기 없음)", () => {
    const state = disc(1);
    dryOut(state, DEFAULT_WET_PARAMS);
    const mass = snapshotConcentration(state).pigment;
    const doc = new Float32Array(SIZE * SIZE * 4);
    bakeWet(state, doc, SIZE);
    const i = CENTER * SIZE + CENTER;
    const m = mass[i] ?? 0;
    expect(m).toBeGreaterThan(0);
    expect(doc[i * 4 + 3]).toBeCloseTo(1 - Math.exp(-m * BAKE_MASS_TO_ALPHA), 5);
    // 색: 투입 색(0.2, 0.1, 0.6)·alpha(premultiplied)
    const a = doc[i * 4 + 3] ?? 0;
    expect(doc[i * 4]).toBeCloseTo(0.2 * a, 4);
    expect(doc[i * 4 + 1]).toBeCloseTo(0.1 * a, 4);
    expect(doc[i * 4 + 2]).toBeCloseTo(0.6 * a, 4);
    const t = wetTotals(state);
    expect(t.fixed).toBe(0);
    expect(t.hardFixed).toBe(0);
    const copy = new Float32Array(doc);
    bakeWet(state, doc, SIZE);
    expect(doc).toEqual(copy);
    // KM 혼색은 바탕색이 있을 때만 다르다
    const bg = new Float32Array(SIZE * SIZE * 4).fill(1);
    const bgKm = new Float32Array(bg);
    const s2 = disc(1);
    dryOut(s2, DEFAULT_WET_PARAMS);
    const s3 = disc(1);
    dryOut(s3, DEFAULT_WET_PARAMS);
    bakeWet(s2, bg, SIZE);
    bakeWet(s3, bgKm, SIZE, { km: true });
    expect(bgKm[i * 4 + 3]).toBeCloseTo(bg[i * 4 + 3] ?? 0, 6);
    expect(bgKm[i * 4 + 1]).not.toBe(bg[i * 4 + 1]);
  });

  it("비파괴 표시 합성(compositeWaterLayer)은 상태를 바꾸지 않고 bakeWet과 같은 문서를 만든다", () => {
    const state = disc(1);
    for (let i = 0; i < 20; i += 1) stepWet(state, DEFAULT_WET_PARAMS, FRAME_MS, null);
    const before = wetTotals(state);
    const shown = new Float32Array(SIZE * SIZE * 4);
    compositeWaterLayer(state, shown, SIZE, { km: true });
    expect(wetTotals(state)).toEqual(before);
    const baked = new Float32Array(SIZE * SIZE * 4);
    bakeWet(state, baked, SIZE, { km: true });
    expect(baked).toEqual(shown);
  });
});

describe("임파스토", () => {
  it("impastoLighting: 평탄하면 light.z/|light|, 빛을 향한 경사는 밝고 반대는 어둡다", () => {
    const w = 8;
    const flat = new Float32Array(w * w);
    const lit = impastoLighting(flat, w, [-0.5, -0.5, 1]);
    const expected = 1 / Math.hypot(0.5, 0.5, 1);
    for (let i = 0; i < lit.length; i += 1) expect(lit[i]).toBeCloseTo(expected, 6);
    // 왼쪽이 높은 경사(x가 커질수록 낮아짐): 법선 (−∂h/∂x, −∂h/∂y, 1) = (+0.4, 0, 1)은 +x 쪽을 향하므로
    // 오른쪽 위 광원(+x)에서는 밝고 왼쪽 광원(−x)에서는 어둡다.
    const slope = new Float32Array(w * w);
    for (let y = 0; y < w; y += 1) for (let x = 0; x < w; x += 1) slope[y * w + x] = (w - x) * 0.2;
    const litToward = impastoLighting(slope, w, [0.5, 0, 1], 2);
    expect(litToward[3 * w + 3]).toBeGreaterThan(1 / Math.hypot(0.5, 0, 1));
    const litAway = impastoLighting(slope, w, [-0.5, 0, 1], 2);
    expect(litAway[3 * w + 3]).toBeLessThan(1 / Math.hypot(0.5, 0, 1));
    // 출력은 [0,1]·f32
    for (const v of [...litToward, ...litAway]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(Math.fround(v));
    }
  });

  it("impastoSpecular: 평탄면은 impastoSpecularFlat와 같고, 반벡터를 향한 능선은 더 밝으며 [0,1]·f32", () => {
    const w = 8;
    const light: readonly [number, number, number] = [-0.5, -0.5, 1];
    const flatValue = impastoSpecularFlat(light);
    // 평탄면: H = normalize(L̂ + V), N = (0,0,1) → (N·H)^s
    const ll = Math.hypot(0.5, 0.5, 1);
    const hz = 1 / ll + 1;
    const expected = (hz / Math.hypot(-0.5 / ll, -0.5 / ll, hz)) ** IMPASTO_SHININESS;
    expect(flatValue).toBeCloseTo(expected, 6);
    expect(flatValue).toBeGreaterThan(0);
    expect(flatValue).toBeLessThan(1);
    const flat = impastoSpecular(new Float32Array(w * w), w, light);
    for (const v of flat) expect(v).toBeCloseTo(flatValue, 6);
    // 광원 쪽(−x, −y)으로 기운 면은 반벡터와 정렬돼 하이라이트가 평탄면보다 크다
    const slope = new Float32Array(w * w);
    for (let y = 0; y < w; y += 1) for (let x = 0; x < w; x += 1) slope[y * w + x] = (x + y) * 0.1;
    const toward = impastoSpecular(slope, w, light, 2);
    expect(toward[3 * w + 3]).toBeGreaterThan(flatValue);
    // 반대로 기운 면은 더 어둡다
    const away = new Float32Array(w * w);
    for (let y = 0; y < w; y += 1) for (let x = 0; x < w; x += 1) away[y * w + x] = (2 * w - x - y) * 0.1;
    const awayLit = impastoSpecular(away, w, light, 2);
    expect(awayLit[3 * w + 3]).toBeLessThan(flatValue);
    for (const v of [...toward, ...awayLit]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(Math.fround(v));
    }
  });

  it("pushHeightField: 타일 경계를 넘어 부피를 보존하며 진행 방향으로 이동한다", () => {
    const state = createWetState(SIZE, SIZE, TILES * TILES);
    const access = wetHeightAccess(state);
    // x = 15는 타일 0의 마지막 열, x = 16은 타일 1의 첫 열이다.
    access.set(15, 20, 1);
    const win = { x0: 10, y0: 18, x1: 20, y1: 22 };
    pushHeightField(access, SIZE, SIZE, win, 1, 0, () => 0.5);
    expect(access.get(15, 20)).toBeCloseTo(0.5, 6);
    expect(access.get(16, 20)).toBeCloseTo(0.5, 6);
    // 타일 1에 처음으로 쓰였으므로 타일이 할당됐다.
    expect(state.pool.slotOf(Math.floor(20 / TILE_SIZE) * TILES + 1)).not.toBeUndefined();
    // 한 번 더: 16의 절반이 17로 흐르고 15의 절반이 16으로 흐른다(총량 보존).
    pushHeightField(access, SIZE, SIZE, win, 1, 0, () => 0.5);
    expect(access.get(15, 20)).toBeCloseTo(0.25, 6);
    expect(access.get(16, 20)).toBeCloseTo(0.5, 6);
    expect(access.get(17, 20)).toBeCloseTo(0.25, 6);
    let sum = 0;
    for (let x = 0; x < SIZE; x += 1) sum += access.get(x, 20);
    expect(sum).toBeCloseTo(1, 6);
    // 역방향·세로 방향: 절댓값이 큰 축이 진행 축이다.
    const back = createWetState(SIZE, SIZE, TILES * TILES);
    const ba = wetHeightAccess(back);
    ba.set(16, 20, 1);
    pushHeightField(ba, SIZE, SIZE, win, -1, 0.2, () => 1);
    expect(ba.get(16, 20)).toBeCloseTo(0, 6);
    expect(ba.get(15, 20)).toBeCloseTo(1, 6);
    ba.set(40, 31, 1);
    pushHeightField(ba, SIZE, SIZE, { x0: 36, y0: 28, x1: 44, y1: 34 }, 0.1, 1, () => 1);
    expect(ba.get(40, 31)).toBeCloseTo(0, 6);
    expect(ba.get(40, 32)).toBeCloseTo(1, 6);
  });

  it("pushHeightField: 캔버스 밖으로는 보내지 않고(no-flux) 창 밖 픽셀은 밀리지 않는다", () => {
    const state = createWetState(SIZE, SIZE, TILES * TILES);
    const access = wetHeightAccess(state);
    access.set(SIZE - 1, 5, 1);
    pushHeightField(access, SIZE, SIZE, { x0: SIZE - 4, y0: 3, x1: SIZE - 1, y1: 7 }, 1, 0, () => 1);
    expect(access.get(SIZE - 1, 5)).toBeCloseTo(1, 6);
    access.set(50, 50, 1);
    pushHeightField(access, SIZE, SIZE, { x0: 0, y0: 0, x1: 10, y1: 10 }, 1, 0, () => 1);
    expect(access.get(50, 50)).toBe(1);
    expect(access.get(51, 50)).toBe(0);
  });

  it("높이 밀기를 반복해도 타일 경계(16 px 배수)에 물감이 쌓이지 않는다(격자 회귀)", () => {
    const state = createWetState(SIZE, SIZE, TILES * TILES);
    const access = wetHeightAccess(state);
    const rowY = 64;
    const win = { x0: 0, y0: rowY - 2, x1: SIZE - 1, y1: rowY + 2 };
    // 균일한 띠(h = 1)를 같은 방향으로 20번(평균 6 px 이동) 민다. 들어오는 양 = 나가는 양이므로 캔버스 양끝의
    // 고갈·퇴적 영역(≈12 px) 밖은 끝까지 1이어야 한다. 타일 국소 밀기는 경계 열이 ≈ 7까지 쌓였다.
    for (let x = 0; x < SIZE; x += 1) for (let y = rowY - 2; y <= rowY + 2; y += 1) access.set(x, y, 1);
    for (let n = 0; n < 20; n += 1) pushHeightField(access, SIZE, SIZE, win, 1, 0, () => 0.3);
    for (let x = 24; x < SIZE - 24; x += 1) expect(access.get(x, rowY), `x = ${x}`).toBeCloseTo(1, 5);
    // 캔버스 하류 끝(no-flux 벽)에 쌓이고 상류 끝은 비며 총량은 보존된다.
    expect(access.get(SIZE - 1, rowY)).toBeGreaterThan(1);
    expect(access.get(0, rowY)).toBeLessThan(1);
    let total = 0;
    for (let x = 0; x < SIZE; x += 1) total += access.get(x, rowY);
    expect(total).toBeCloseTo(SIZE, 3);
  });

  it("relaxHeight: 부피 보존·봉우리 감소, 점성 1이면 변화 없음", () => {
    const state = createWetState(SIZE, SIZE, 4);
    const tile = 5 * TILES + 5;
    const view = state.touch(tile);
    state.active.add(tile);
    view.height[8 * TILE_SIZE + 8] = 1;
    const snap = snapshotActive(state);
    relaxHeight(state, snap, { ...DEFAULT_WET_PARAMS, viscosity: 0 });
    let total = 0;
    for (let i = 0; i < TILE_PIXELS; i += 1) total += view.height[i] ?? 0;
    expect(total).toBeCloseTo(1, 5);
    expect(view.height[8 * TILE_SIZE + 8]).toBeCloseTo(1 - 4 * WET_KERNEL.heightRelaxScale, 5);
    // 점성 1이면 변화 없음
    const rigid = createWetState(SIZE, SIZE, 4);
    const rv = rigid.touch(tile);
    rigid.active.add(tile);
    rv.height[8 * TILE_SIZE + 8] = 1;
    relaxHeight(rigid, snapshotActive(rigid), { ...DEFAULT_WET_PARAMS, viscosity: 1 });
    expect(rv.height[8 * TILE_SIZE + 8]).toBe(1);
  });
});
