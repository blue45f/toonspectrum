import { describe, expect, it } from "vitest";

import { Pcg32 } from "../../engine/core/rng";
import { PRESET_CATALOG, presetById } from "../../engine/presets/catalog";
import { FAMILY_TARGETS, metricKeysForFamily } from "../../engine/presets/families";
import { BRUSH_FAMILIES } from "../../engine/presets/program-schema";
import { renderPresetThumbnail } from "../../engine/raster/reference-renderer";
import { buildFixture } from "../fixtures/stroke-fixtures";
import { alphaFieldImage, bandImage, noiseImage, solidImage } from "../testing/synthetic-images";

import {
  airbrushGaussianFitOf,
  computeFamilyMetrics,
  CPU_SYNTHETIC_FAMILY_KEYS,
  edgeDarkeningRatioOf,
  edgeTransitionWidthOf,
  eraserColorInvarianceOf,
  grainPressureMonotonicityOf,
  granulationContrastOf,
  halftoneDotRegularityOf,
  impastoReliefContrastOf,
  moireHighFrequencyRatioOf,
  overlapAccumulationErrorOf,
  reliefLightingConsistencyOf,
  seamScoreOf,
  smudgeMassConservationOf,
  strandSeparationOf,
  taperWidthErrorOf,
} from "./family-metrics";

import type { BrushFamily } from "../../engine/presets/program-schema";
import type { StrokeFixture } from "../fixtures/stroke-fixtures";

const SIZE = 64;
const LINE = buildFixture("line", { width: SIZE, height: SIZE });

/** 각 가족의 대표 프리셋(카탈로그 첫 항목). */
function presetFor(family: BrushFamily): string {
  const p = PRESET_CATALOG.find((x) => x.family === family);
  if (!p) throw new Error(`no preset for ${family}`);
  return p.id;
}

describe("매체 가족 지표(합성 입력)", () => {
  it("불투명도 누적 오차: dry-stamp round/flat만 측정하고 이론값과 거의 같다", () => {
    const marker = overlapAccumulationErrorOf(presetById("marker-alcohol"));
    expect(marker).not.toBeNull();
    expect(marker ?? 1).toBeLessThan(0.01);
    expect(overlapAccumulationErrorOf(presetById("airbrush"))).toBeNull();
    expect(overlapAccumulationErrorOf(presetById("pencil-hb"))).toBeNull();
  });

  it("에지 다크닝 비: 어두운 외곽 링은 > 1, 균일 원판은 ≈ 1, 잉크 없으면 null", () => {
    const ring = alphaFieldImage(SIZE, SIZE, (x, y) => {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
      return d <= 20 ? (d > 17 ? 1 : 0.4) : 0;
    });
    expect(edgeDarkeningRatioOf(ring) ?? 0).toBeGreaterThan(1.5);
    const flat = alphaFieldImage(SIZE, SIZE, (x, y) => (Math.hypot(x + 0.5 - 32, y + 0.5 - 32) <= 20 ? 0.6 : 0));
    expect(edgeDarkeningRatioOf(flat) ?? 0).toBeCloseTo(1, 6);
    expect(edgeDarkeningRatioOf(solidImage(SIZE, SIZE))).toBeNull();
  });

  it("그래뉼레이션 대비: 균일 0, 잡음은 > 0", () => {
    const flat = alphaFieldImage(SIZE, SIZE, (x, y) => (Math.hypot(x + 0.5 - 32, y + 0.5 - 32) <= 20 ? 0.6 : 0));
    expect(granulationContrastOf(flat)).toBeCloseTo(0, 6);
    const noisy = noiseImage(SIZE, 5, 60);
    expect(granulationContrastOf(noisy) ?? 0).toBeGreaterThan(0.1);
  });

  it("에어브러시 가우시안 적합: 가우시안 단면 R² ≥ 0.97, 사각 단면은 낮다", () => {
    const program = presetById("airbrush");
    const gauss = alphaFieldImage(SIZE, SIZE, (_x, y) => Math.exp(-((y + 0.5 - 32) ** 2) / (2 * 4 * 4)));
    expect(airbrushGaussianFitOf(gauss, LINE, program) ?? 0).toBeGreaterThan(0.97);
    const box = bandImage(SIZE, SIZE, 24, 40);
    expect(airbrushGaussianFitOf(box, LINE, program) ?? 1).toBeLessThan(0.9);
    expect(airbrushGaussianFitOf(solidImage(SIZE, SIZE), LINE, program)).toBeNull();
  });

  it("망점 규칙성·모아레: 주기 격자는 규칙성 ≥ 0.9, 잡음은 낮다", () => {
    const grid = alphaFieldImage(SIZE, SIZE, (x, y) => ((x % 6 < 3) !== (y % 6 < 3) ? 1 : 0.2));
    expect(halftoneDotRegularityOf(grid) ?? 0).toBeGreaterThanOrEqual(0.9);
    const rng = new Pcg32(11, 0x77);
    const noiseField = Float32Array.from({ length: SIZE * SIZE }, () => rng.nextF32() * 0.8 + 0.1);
    const noisy = alphaFieldImage(SIZE, SIZE, (x, y) => noiseField[y * SIZE + x] ?? 0.5);
    expect(halftoneDotRegularityOf(noisy) ?? 1).toBeLessThan(0.5);
    expect(moireHighFrequencyRatioOf(grid)).toBeGreaterThanOrEqual(0);
    expect(halftoneDotRegularityOf(solidImage(SIZE, SIZE))).toBeNull();
  });

  it("가닥 분리도: 꽉 찬 띠 0, 드문 점은 높다", () => {
    const program = presetById("spray-splatter");
    const full = bandImage(SIZE, SIZE, 0, SIZE);
    expect(strandSeparationOf(full, LINE, program)).toBeCloseTo(0, 9);
    const sparse = alphaFieldImage(SIZE, SIZE, (x, y) => (x % 8 === 0 && y % 8 === 0 ? 1 : 0));
    expect(strandSeparationOf(sparse, LINE, program) ?? 0).toBeGreaterThan(0.8);
  });

  it("릴리프 조명 일관성: 능선 높이맵은 1에 가깝고 평탄하면 null", () => {
    const n = 32;
    const ridge = new Float32Array(n * n);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) ridge[y * n + x] = 0.5 + 0.5 * Math.sin((2 * Math.PI * x) / 8) * Math.sin((2 * Math.PI * y) / 8);
    expect(reliefLightingConsistencyOf(ridge, n) ?? 0).toBeGreaterThan(0.9);
    expect(reliefLightingConsistencyOf(new Float32Array(n * n), n)).toBeNull();
  });

  it("임파스토 릴리프 대비(p95−p5): 두꺼운 능선 ≥ 0.25, 얇은 글레이즈 ≤ 0.05, 높이 없으면 null", () => {
    const n = 32;
    const make = (amp: number): Float32Array => {
      const h = new Float32Array(n * n);
      for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) h[y * n + x] = amp * (1 + Math.sin((2 * Math.PI * x) / 8) * Math.sin((2 * Math.PI * y) / 8)) + 1e-3;
      return h;
    };
    expect(impastoReliefContrastOf(make(0.5), n) ?? 0).toBeGreaterThanOrEqual(0.25);
    expect(impastoReliefContrastOf(make(0.01), n) ?? 1).toBeLessThanOrEqual(0.05);
    expect(impastoReliefContrastOf(new Float32Array(n * n), n)).toBeNull();
    const thick = impastoReliefContrastOf(make(0.5), n) ?? 0;
    expect(thick).toBeGreaterThan(impastoReliefContrastOf(make(0.1), n) ?? 1);
  });

  it("타일 seam(프리셋 종이)·eraser 색 불변·smudge 질량 보존·그레인 단조성", () => {
    expect(seamScoreOf(presetById("texture-canvas-stamp"))).toBeLessThan(0.05);
    const zig = buildFixture("zigzag", { width: SIZE, height: SIZE });
    expect(eraserColorInvarianceOf(presetById("eraser-soft"), zig)).toBe(0);
    expect(smudgeMassConservationOf(presetById("smudge-blend"), zig) ?? 1).toBeLessThan(0.05);
    expect(grainPressureMonotonicityOf(solidImage(SIZE, SIZE), LINE, presetById("pencil-hb"))).toBeNull();
    const ramp = buildFixture("slow-pressure-ramp", { width: SIZE, height: SIZE });
    const widening = alphaFieldImage(SIZE, SIZE, (x, y) => (Math.abs(y + 0.5 - 32) < 1 + (x / SIZE) * 6 ? 1 : 0));
    const mono = grainPressureMonotonicityOf(widening, ramp, presetById("pencil-hb"));
    expect(mono).not.toBeNull();
    expect(mono ?? 0).toBeGreaterThan(0.9);
  });

  it("테이퍼 폭 오차: 엔진 규약(smoothstep) 테이퍼와 같은 띠는 오차가 작고 테이퍼 없는 프리셋은 null", () => {
    const program = presetById("ink-g-pen");
    const path = LINE.intendedPath ?? [];
    const x0 = path[0]?.[0] ?? 0;
    const x1 = path[1]?.[0] ?? SIZE;
    const total = x1 - x0;
    const smooth = (t: number): number => {
      const u = Math.max(0, Math.min(1, t));
      return u * u * (3 - 2 * u);
    };
    const wMax = 6;
    const tapered = alphaFieldImage(SIZE, SIZE, (x, y) => {
      const s = x + 0.5 - x0;
      if (s < 0 || s > total) return 0;
      const scale = Math.min(smooth(s / program.edge.taperStartPx), smooth((total - s) / program.edge.taperEndPx));
      return Math.abs(y + 0.5 - 32) < (wMax * scale) / 2 ? 1 : 0;
    });
    const err = taperWidthErrorOf(tapered, LINE, program);
    expect(err).not.toBeNull();
    expect(err ?? 1).toBeLessThan(0.12);
    expect(taperWidthErrorOf(tapered, LINE, presetById("marker-alcohol"))).toBeNull();
    expect(edgeTransitionWidthOf(tapered, LINE) ?? 9).toBeLessThanOrEqual(1);
  });

  it("computeFamilyMetrics는 모든 가족에서 FAMILY_TARGETS 키만 돌려주고 썸네일 렌더에서 유한 또는 null이다", () => {
    const fixture: StrokeFixture = buildFixture("zigzag", { width: 48, height: 48 });
    for (const family of BRUSH_FAMILIES) {
      const program = presetById(presetFor(family));
      const rendered = renderPresetThumbnail(program, fixture.samples, 48, 1);
      const metrics = computeFamilyMetrics(family, { out: rendered.image, fixture, program, receipt: rendered.receipt });
      const keys = Object.keys(metrics).sort();
      expect(keys).toEqual([...metricKeysForFamily(family)].sort());
      for (const key of keys) {
        const v = metrics[key as keyof typeof metrics];
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      expect(FAMILY_TARGETS[family].metrics.length).toBeGreaterThan(0);
    }
    expect(CPU_SYNTHETIC_FAMILY_KEYS).toContain("overlapAccumulationError");
    expect(CPU_SYNTHETIC_FAMILY_KEYS).toContain("impastoReliefContrast");
    // 20개 가족을 CPU 참조로 렌더하므로(습식 가족이 무겁다) 앱 로컬 기본 5 s로는 부하 시 부족하다.
  }, 60_000);
});
