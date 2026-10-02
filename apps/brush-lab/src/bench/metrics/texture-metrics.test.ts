import { describe, expect, it } from "vitest";

import { DEFAULT_PAPER_SPEC, generatePaper } from "../../engine/texture/paper-grain";
import { grayFieldImage, noiseImage, sineImage, solidImage } from "../testing/synthetic-images";

import {
  filterComparison,
  grainContrastPreservation,
  highFrequencyEnergyRatio,
  pressureGrainMonotonicity,
  resolutionConsistency,
  seamScore,
  spectrumWindow,
} from "./texture-metrics";

import type { PaperField } from "../../engine/texture/paper-grain";

describe("질감 지표", () => {
  it("고주파 에너지 비: 긴 주기 사인 격자는 낮고 짧은 주기(모아레 대역)는 높다", () => {
    const low = highFrequencyEnergyRatio(sineImage(64, 32));
    const high = highFrequencyEnergyRatio(sineImage(64, 2.5));
    expect(low).toBeLessThan(0.15);
    expect(high).toBeGreaterThan(0.8);
    expect(highFrequencyEnergyRatio(solidImage(64, 64))).toBe(0);
    const spec = spectrumWindow(sineImage(64, 8), 32);
    expect(spec.size).toBe(32);
  });

  it("그레인 대비 보존: 같은 이미지 1, 평탄화된 출력은 1 미만, 참조가 평탄하면 0/1", () => {
    const ref = noiseImage(64, 3);
    expect(grainContrastPreservation(ref, ref)).toBeCloseTo(1, 9);
    const flat = grayFieldImage(64, 64, () => 128);
    expect(grainContrastPreservation(ref, flat)).toBeLessThan(0.05);
    expect(grainContrastPreservation(flat, flat)).toBe(1);
    expect(grainContrastPreservation(flat, ref)).toBe(0);
  });

  it("압력 램프 단조성: 단조 증가 응답은 Spearman 1, 역응답은 −1", () => {
    const p = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(pressureGrainMonotonicity(p, [1, 2, 4, 8, 16])).toBeCloseTo(1, 12);
    expect(pressureGrainMonotonicity(p, [5, 4, 3, 2, 1])).toBeCloseTo(-1, 12);
  });

  it("타일 seam: 주기 종이 필드는 ≈ 0, 비주기 그라데이션 필드는 뚜렷이 크다", () => {
    const periodic = generatePaper(DEFAULT_PAPER_SPEC, 64);
    expect(seamScore(periodic)).toBeLessThan(0.05);
    const n = 32;
    const bump = new Float32Array(n * n);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) bump[y * n + x] = x / (n - 1);
    const synthetic: PaperField = { size: n, direction: new Float32Array(n * n), bump, absorb: new Float32Array(n * n) };
    expect(seamScore(synthetic)).toBeGreaterThan(0.5);
    expect(seamScore({ size: 1, direction: new Float32Array(1), bump: new Float32Array(1), absorb: new Float32Array(1) })).toBe(0);
  });

  it("샘플링 필터 비교는 4개 필터 키를 모두 돌려준다", () => {
    const img = sineImage(32, 4);
    const out = filterComparison({ nearest: img, bilinear: img, trilinear: img, anisotropic: img });
    expect(Object.keys(out).sort()).toEqual(["anisotropic", "bilinear", "nearest", "trilinear"]);
    expect(out.nearest).toBe(out.anisotropic);
  });

  it("해상도 일관성: 균일 이미지는 ΔE ≈ 0, 크기 불일치는 RangeError", () => {
    const lo = grayFieldImage(8, 8, () => 100);
    const hi = grayFieldImage(16, 16, () => 100);
    expect(resolutionConsistency(lo, hi)).toBeCloseTo(0, 3);
    expect(() => resolutionConsistency(lo, grayFieldImage(12, 12, () => 100))).toThrow(RangeError);
    const darker = grayFieldImage(16, 16, () => 40);
    expect(resolutionConsistency(lo, darker)).toBeGreaterThan(5);
  });
});
