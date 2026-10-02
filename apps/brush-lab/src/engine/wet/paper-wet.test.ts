import { describe, expect, it } from "vitest";

import { TILE_SIZE } from "../raster/tile-binning";
import { uniformFiberPaper } from "../testing/wet-scenes";
import { generatePaper, DEFAULT_PAPER_SPEC } from "../texture/paper-grain";

import { detCos, detSin } from "./det-math";
import {
  buildTilePaper,
  FIBER_ANGLE_POWER,
  fiberConductanceRatio,
  fiberLinkBlocking,
  PAD_SIZE,
  paperCacheKey,
} from "./paper-wet";
import { DEFAULT_WET_PARAMS, WET_PHYSICS, wetMediumPreset } from "./params";

import type { WetPaperSource } from "./paper-wet";

const SPEC = { ...DEFAULT_PAPER_SPEC, roughness: 0.6 };

/** 섬유가 격자 축에 정렬(θ)된 균일 종이에서 8링크 확산의 D_yy/D_xx(면 가중 2/3, 대각 1/6). */
function diffusivityRatio(ratio: number): number {
  // g(φ) = g⊥ + (g∥ − g⊥)·|cos φ|^p: 면 E/W φ = 0, N/S φ = 90°, 대각 φ = 45°(cos² = 1/2).
  const delta = 0.5 ** (FIBER_ANGLE_POWER / 2);
  const gPar = ratio;
  const gPerp = 1;
  const gDiag = gPerp + (gPar - gPerp) * delta;
  const dxx = (4 / 3) * gPar + (4 / 6) * gDiag;
  const dyy = (4 / 3) * gPerp + (4 / 6) * gDiag;
  return dyy / dxx;
}

describe("det-math(결정적 sin/cos)", () => {
  it("Math.sin/cos와 1e-6 이내로 일치하고 큰 인자도 범위를 접는다", () => {
    for (let k = -40; k <= 40; k += 1) {
      const x = k * 0.37;
      expect(Math.abs(detSin(x) - Math.sin(x))).toBeLessThan(1e-6);
      expect(Math.abs(detCos(x) - Math.cos(x))).toBeLessThan(1e-6);
    }
    expect(Math.abs(detSin(1234.5) - Math.sin(1234.5))).toBeLessThan(1e-6);
  });
});

describe("섬유 링크 차단 모델", () => {
  it("전도율 비: aniso 0이면 1, 단조 증가, 닫힌 형식이 8링크 확산 이방비 (1 − aniso)²를 정확히 만든다", () => {
    expect(fiberConductanceRatio(0)).toBe(1);
    let prev = 1;
    for (const a of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
      const r = fiberConductanceRatio(a);
      expect(r).toBeGreaterThan(prev);
      prev = r;
      expect(diffusivityRatio(r)).toBeCloseTo((1 - a) ** 2, 9);
    }
    // 이산화 한계: aniso ≈ 0.757을 넘으면 비가 상한으로 포화한다.
    expect(fiberConductanceRatio(0.9)).toBe(fiberConductanceRatio(1));
  });

  it("방향 평균 k0 보존(κ∥ + κ⊥ = 2·k0), 섬유 방향이 더 열려 있고 등방이면 κ = k0", () => {
    for (const [k0, a] of [
      [0.35, 0.3],
      [0.55, 0.7],
      [0.4, 0.2],
    ] as const) {
      const b = fiberLinkBlocking(k0, a);
      expect(b.parallel).toBeLessThan(b.perpendicular);
      expect(b.parallel + b.perpendicular).toBeCloseTo(2 * k0, 9);
      expect(b.perpendicular).toBeLessThanOrEqual(WET_PHYSICS.kappaMax);
    }
    const iso = fiberLinkBlocking(0.4, 0);
    expect(iso.parallel).toBeCloseTo(0.4, 12);
    expect(iso.perpendicular).toBeCloseTo(0.4, 12);
  });
});

describe("타일 종이 파생 필드", () => {
  it("종이 없음: 요철·흡수율 0.5, 모든 링크 κ = k0(등방)", () => {
    const src: WetPaperSource = { field: null, spec: SPEC };
    const tp = buildTilePaper(src, DEFAULT_WET_PARAMS, 0, 0);
    expect(new Set(tp.h)).toEqual(new Set([0.5]));
    for (const k of tp.kappa) expect(new Set(k)).toEqual(new Set([Math.fround(DEFAULT_WET_PARAMS.fiberBlocking)]));
    expect(tp.h.length).toBe(PAD_SIZE * PAD_SIZE);
    expect(tp.kbar.length).toBe(TILE_SIZE * TILE_SIZE);
  });

  it("같은 입력이면 비트 동일, 모든 값이 범위 안(κ ∈ [0, κmax], h·흡수율 ∈ [0, 1])", () => {
    const params = wetMediumPreset("sumi");
    const src: WetPaperSource = { field: generatePaper(SPEC), spec: SPEC };
    const a = buildTilePaper(src, params, 3, 2);
    const b = buildTilePaper(src, params, 3, 2);
    expect(Array.from(a.kappa[0])).toEqual(Array.from(b.kappa[0]));
    expect(Array.from(a.capBase)).toEqual(Array.from(b.capBase));
    for (const k of a.kappa) {
      for (const v of k) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(Math.fround(WET_PHYSICS.kappaMax));
      }
    }
    for (const v of a.h) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("전역 셀 좌표의 함수라 타일 경계 헤일로가 이웃 타일의 안쪽 셀과 같다(이음새 없음)", () => {
    const params = wetMediumPreset("sumi");
    const src: WetPaperSource = { field: generatePaper(SPEC), spec: SPEC };
    const left = buildTilePaper(src, params, 1, 1);
    const right = buildTilePaper(src, params, 2, 1);
    for (let y = 0; y < PAD_SIZE; y += 1) {
      // 왼쪽 타일의 오른쪽 헤일로 열(px = 17) = 오른쪽 타일의 첫 안쪽 열(px = 1), 반대도 마찬가지.
      const l = y * PAD_SIZE + (PAD_SIZE - 1);
      const r = y * PAD_SIZE + 1;
      expect(left.h[l]).toBe(right.h[r]);
      expect(left.absorb[l]).toBe(right.absorb[r]);
      for (let c = 0; c < 4; c += 1) expect(left.kappa[c]?.[l]).toBe(right.kappa[c]?.[r]);
      const l2 = y * PAD_SIZE + (PAD_SIZE - 2);
      const r2 = y * PAD_SIZE + 0;
      expect(left.kappa[0]?.[l2]).toBe(right.kappa[0]?.[r2]);
    }
  });

  it("섬유 방향 정렬: θ = 0이면 E 링크(섬유 방향)가 S 링크(가로)보다 열려 있고 θ = π/2이면 반대, 대각은 가로에 가깝다", () => {
    const params = wetMediumPreset("sumi", { fiberRoughness: 0 });
    const mid = (PAD_SIZE * PAD_SIZE) >> 1;
    for (const [theta, openClass, closedClass] of [
      [0, 0, 1],
      [Math.PI / 2, 1, 0],
    ] as const) {
      const src: WetPaperSource = { field: uniformFiberPaper(theta), spec: SPEC };
      const tp = buildTilePaper(src, params, 0, 0);
      const open = tp.kappa[openClass]?.[mid] ?? 1;
      const closed = tp.kappa[closedClass]?.[mid] ?? 0;
      const diag = tp.kappa[2]?.[mid] ?? 0;
      expect(open).toBeLessThan(closed);
      // cos⁶ 프로파일: 45°에서는 가로 방향에 가까운 차단(섬유 방향 성분이 1/8만 남는다).
      expect(diag).toBeGreaterThan((open + closed) / 2);
    }
  });

  it("거칠기 0이면 균일 종이에서 κ가 공간적으로 일정하고, 거칠기 > 0이면 섬유 줄무늬로 변한다", () => {
    const flat = buildTilePaper({ field: uniformFiberPaper(0), spec: SPEC }, wetMediumPreset("sumi", { fiberRoughness: 0 }), 0, 0);
    expect(new Set(flat.kappa[0]).size).toBe(1);
    const rough = buildTilePaper({ field: uniformFiberPaper(0), spec: SPEC }, wetMediumPreset("sumi", { fiberRoughness: 0.8 }), 0, 0);
    expect(new Set(rough.kappa[0]).size).toBeGreaterThan(20);
  });

  it("캐시 키는 종이 필드·스펙·섬유 파라미터가 같으면 같고 하나라도 다르면 다르다", () => {
    const field = generatePaper(SPEC);
    const base = paperCacheKey({ field, spec: SPEC }, DEFAULT_WET_PARAMS);
    expect(paperCacheKey({ field, spec: SPEC }, { ...DEFAULT_WET_PARAMS })).toBe(base);
    expect(paperCacheKey({ field, spec: { ...SPEC, seed: 8 } }, DEFAULT_WET_PARAMS)).not.toBe(base);
    expect(paperCacheKey({ field, spec: SPEC }, { ...DEFAULT_WET_PARAMS, fiberAnisotropy: 0.9 })).not.toBe(base);
    expect(paperCacheKey({ field: null, spec: SPEC }, DEFAULT_WET_PARAMS)).not.toBe(base);
  });
});
