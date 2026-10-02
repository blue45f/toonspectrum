import { describe, expect, it } from "vitest";

import { fnv1a64 } from "../core/hash";

import { buildMipChain } from "./mip-chain";
import { DEFAULT_PAPER_SPEC, generatePaper, periodicFbm, periodicValueNoise, samplePaper } from "./paper-grain";
import { SAMPLING_FILTERS, lodFor, sampleMask } from "./sampling";
import { generateTip } from "./tip-generators";

import type { PaperField, PaperSpec } from "./paper-grain";
import type { SamplingFilter } from "./sampling";

function hashField(field: PaperField): string {
  const bytes = new Uint8Array(field.bump.buffer, field.bump.byteOffset, field.bump.byteLength);
  return fnv1a64(bytes);
}

function std(values: Float32Array): number {
  let mean = 0;
  for (let i = 0; i < values.length; i += 1) mean += values[i] ?? 0;
  mean /= values.length;
  let v = 0;
  for (let i = 0; i < values.length; i += 1) v += ((values[i] ?? 0) - mean) ** 2;
  return Math.sqrt(v / values.length);
}

describe("절차적 종이", () => {
  const spec: PaperSpec = { ...DEFAULT_PAPER_SPEC, seed: 11 };

  it("주기 노이즈는 u = 1에서 u = 0과 정확히 같다(seamScore ≤ 1e-6)", () => {
    let worst = 0;
    for (let i = 0; i < 64; i += 1) {
      const v = i / 64;
      worst = Math.max(worst, Math.abs(periodicFbm(1, v, 8, 5, 11) - periodicFbm(0, v, 8, 5, 11)));
      worst = Math.max(worst, Math.abs(periodicFbm(v, 1, 8, 5, 11) - periodicFbm(v, 0, 8, 5, 11)));
      worst = Math.max(worst, Math.abs(periodicValueNoise(8 + v * 8, 3.3, 8, 11) - periodicValueNoise(v * 8, 3.3, 8, 11)));
    }
    expect(worst).toBeLessThanOrEqual(1e-6);
  });

  it("타일러블: samplePaper(x + size·scale) === samplePaper(x), 이음새 차분이 내부 차분과 같은 크기", () => {
    const field = generatePaper(spec, 128);
    for (const filter of ["nearest", "bilinear"] as const) {
      const s = { ...spec, filter };
      for (let i = 0; i < 20; i += 1) {
        const x = i * 6.37;
        const y = i * 3.11;
        const a = samplePaper(field, x, y, s);
        const b = samplePaper(field, x + 128, y + 256, s);
        // nearest는 정수 격자라 비트 동일, bilinear은 분수 계산의 부동소수 반올림만 다를 수 있다
        if (filter === "nearest") {
          expect(b.bump).toBe(a.bump);
          expect(b.absorb).toBe(a.absorb);
        } else {
          expect(b.bump).toBeCloseTo(a.bump, 9);
          expect(b.absorb).toBeCloseTo(a.absorb, 9);
        }
        expect(b.dir).toBe(a.dir);
      }
    }
    // 이음새(열 127 ↔ 열 0)와 내부(열 63 ↔ 64)의 평균 |Δbump| 비가 0.5..2 안
    let seam = 0;
    let interior = 0;
    for (let y = 0; y < 128; y += 1) {
      seam += Math.abs((field.bump[y * 128 + 127] ?? 0) - (field.bump[y * 128] ?? 0));
      interior += Math.abs((field.bump[y * 128 + 63] ?? 0) - (field.bump[y * 128 + 64] ?? 0));
    }
    const ratio = seam / interior;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it("결정적: 같은 spec·size → 같은 바이트, seed가 바뀌면 상이", () => {
    expect(hashField(generatePaper(spec, 64))).toBe(hashField(generatePaper(spec, 64)));
    expect(hashField(generatePaper({ ...spec, seed: 12 }, 64))).not.toBe(hashField(generatePaper(spec, 64)));
  });

  it("값 범위: bump/absorb ∈ [0,1], direction ∈ [0, 2π], f32", () => {
    const field = generatePaper(spec, 64);
    for (let i = 0; i < field.bump.length; i += 1) {
      const b = field.bump[i] ?? -1;
      const a = field.absorb[i] ?? -1;
      const d = field.direction[i] ?? -1;
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(Math.PI * 2);
      expect(b).toBe(Math.fround(b));
    }
  });

  it("압력 의존 그레인 응답(1 − grain·(1 − bump), grain = 1 − p·pressureInfluence)이 압력에 단조 증가", () => {
    const field = generatePaper(spec, 64);
    let prev = -1;
    for (let k = 0; k <= 10; k += 1) {
      const p = k / 10;
      const grain = 1 - p * spec.pressureInfluence;
      let sum = 0;
      for (let i = 0; i < field.bump.length; i += 1) sum += 1 - grain * (1 - (field.bump[i] ?? 0));
      const mean = sum / field.bump.length;
      expect(mean).toBeGreaterThan(prev);
      prev = mean;
    }
    expect(prev).toBeLessThanOrEqual(1);
  });

  it("roughness가 클수록 bump 분산이 크고 absorbency가 클수록 absorb 평균이 크다", () => {
    const smooth = generatePaper({ ...spec, roughness: 0.1 }, 64);
    const rough = generatePaper({ ...spec, roughness: 0.9 }, 64);
    expect(std(rough.bump)).toBeGreaterThan(std(smooth.bump) * 1.5);
    const dry = generatePaper({ ...spec, absorbency: 0.1 }, 64);
    const wet = generatePaper({ ...spec, absorbency: 0.9 }, 64);
    const mean = (v: Float32Array): number => Array.from(v).reduce((a, b) => a + b, 0) / v.length;
    expect(mean(wet.absorb)).toBeGreaterThan(mean(dry.absorb));
  });

  it("scale·rotation: scale 2는 문서 2 px당 텍셀 1개, 회전은 방향 채널에 더해진다", () => {
    const field = generatePaper(spec, 64);
    const s1 = { ...spec, filter: "nearest" as const };
    const s2 = { ...spec, filter: "nearest" as const, scale: 2 };
    expect(samplePaper(field, 20, 20, s2).bump).toBe(samplePaper(field, 10, 10, s1).bump);
    const rot = { ...s1, rotationRad: Math.PI / 2 };
    // (x, y) → (−y, x) 회전: 문서 (10, 0)은 텍셀 (0, 10)을 본다
    expect(samplePaper(field, 10, 0, rot).bump).toBeCloseTo(samplePaper(field, 0, 10, s1).bump, 6);
    expect(samplePaper(field, 10, 0, rot).dir).toBeCloseTo(samplePaper(field, 0, 10, s1).dir + Math.PI / 2, 6);
  });
});

describe("팁 마스크 샘플링 필터", () => {
  /** 2.46× 축소(lod 1.3)에서 u 방향 인접 샘플 차분 에너지(고주파 잔류). */
  function hfEnergy(filter: SamplingFilter, lod: number): number {
    const chain = buildMipChain(generateTip("noise", 64, 3, { hardness: 0.8, aspect: 1, density: 0.6 }));
    let e = 0;
    let n = 0;
    const steps = 96;
    for (let j = 0; j < steps; j += 1) {
      const v = (j + 0.5) / steps;
      let prev: number | null = null;
      for (let i = 0; i < steps; i += 1) {
        const u = (i + 0.5) / steps;
        const s = sampleMask(chain, u, v, lod, filter, { dirU: 1, dirV: 0, ratio: 2 });
        if (prev !== null) {
          e += (s - prev) * (s - prev);
          n += 1;
        }
        prev = s;
      }
    }
    return e / n;
  }

  it("축소 시 고주파 에너지: nearest > bilinear > trilinear > anisotropic", () => {
    const lod = 1.3;
    const nearest = hfEnergy("nearest", lod);
    const bilinear = hfEnergy("bilinear", lod);
    const trilinear = hfEnergy("trilinear", lod);
    const aniso = hfEnergy("anisotropic", lod);
    expect(nearest).toBeGreaterThan(bilinear);
    expect(bilinear).toBeGreaterThan(trilinear);
    expect(trilinear).toBeGreaterThan(aniso);
    expect(SAMPLING_FILTERS).toEqual(["nearest", "bilinear", "trilinear", "anisotropic"]);
  });

  it("lodFor: 확대는 0, 2× 축소는 1, 4× 축소는 2", () => {
    expect(lodFor(2)).toBe(0);
    expect(lodFor(1)).toBe(0);
    expect(lodFor(0.5)).toBeCloseTo(1, 10);
    expect(lodFor(0.25)).toBeCloseTo(2, 10);
    expect(lodFor(0)).toBe(0);
  });

  it("sampleMask: 범위 밖 0, 중심 ≈ 레벨 0 값, 마지막 레벨은 평균", () => {
    const chain = buildMipChain(generateTip("round", 64, 1, { hardness: 1, aspect: 1 }));
    expect(sampleMask(chain, -0.1, 0.5, 0, "bilinear")).toBe(0);
    expect(sampleMask(chain, 0.5, 1.0, 0, "bilinear")).toBe(0);
    expect(sampleMask(chain, 0.5, 0.5, 0, "nearest")).toBe(1);
    expect(sampleMask(chain, 0.5, 0.5, 0, "bilinear")).toBeCloseTo(1, 6);
    const top = chain[chain.length - 1];
    expect(sampleMask(chain, 0.5, 0.5, 6, "nearest")).toBe(top?.data[0]);
    // trilinear은 두 레벨 사이 선형 보간
    const l1 = sampleMask(chain, 0.3, 0.3, 1, "bilinear");
    const l2 = sampleMask(chain, 0.3, 0.3, 2, "bilinear");
    expect(sampleMask(chain, 0.3, 0.3, 1.5, "trilinear")).toBeCloseTo((l1 + l2) / 2, 6);
  });
});
