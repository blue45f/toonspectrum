import { describe, expect, it } from "vitest";

import {
  runBackrunScene,
  runEdgeScene,
  runFilmDiffusionScene,
  runGranulationScene,
} from "../../engine/testing/wet-scenes";
import { DEFAULT_PAPER_SPEC } from "../../engine/texture/paper-grain";
import { wetMediumPreset } from "../../engine/wet/params";

import {
  anisotropyWithinTolerance,
  backrunBoundaryRatioOf,
  diffusionRadiusSlopeOf,
  edgeDarkeningRatioOfField,
  fiberAnisotropyRatioOf,
  fieldCovariance,
  frameOf,
  granulationContrastOfField,
  WET_TIME_TARGETS,
  withinRange,
} from "./family-metrics";

import type { FieldFrame } from "./family-metrics";

const N = 64;

/** 중심 (cx, cy) 비등방 가우시안(질량 1) 필드. */
function gaussian(sx: number, sy: number, cx = N / 2, cy = N / 2): Float32Array {
  const out = new Float32Array(N * N);
  let total = 0;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const v = Math.exp(-0.5 * (((x + 0.5 - cx) / sx) ** 2 + ((y + 0.5 - cy) / sy) ** 2));
      out[y * N + x] = v;
      total += v;
    }
  }
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) / total;
  return out;
}

function frame(timeMs: number, field: Float32Array): FieldFrame {
  return { width: N, height: N, timeMs, field };
}

describe("습식 시간축 지표: 임계값 표(설계 §4)", () => {
  it("임계값이 설계 수치 그대로이고(완화 금지) 구간 판정이 닫힌 구간이다", () => {
    expect(WET_TIME_TARGETS.edgeDarkeningRatio.watercolor).toEqual({ min: 1.3, max: 1.8 });
    expect(WET_TIME_TARGETS.edgeDarkeningRatio.sumi).toEqual({ min: 1.1, max: 1.4 });
    expect(WET_TIME_TARGETS.edgeDarkeningRatio.gouache).toEqual({ max: 1.1 });
    expect(WET_TIME_TARGETS.granulationContrast.granulating).toEqual({ min: 0.15, max: 0.35 });
    expect(WET_TIME_TARGETS.granulationContrast.nonGranulating).toEqual({ max: 0.05 });
    expect(WET_TIME_TARGETS.diffusionSlope).toEqual({ min: 0.45, max: 0.55 });
    expect(WET_TIME_TARGETS.anisotropyRelativeTolerance).toBe(0.1);
    expect(WET_TIME_TARGETS.backrunBoundaryRatio).toEqual({ min: 1.25 });

    expect(withinRange(1.3, { min: 1.3, max: 1.8 })).toBe(true);
    expect(withinRange(1.8, { min: 1.3, max: 1.8 })).toBe(true);
    expect(withinRange(1.81, { min: 1.3, max: 1.8 })).toBe(false);
    expect(withinRange(0.01, { max: 0.05 })).toBe(true);
    expect(withinRange(null, { max: 1 })).toBe(false);
    expect(withinRange(Number.NaN, { min: 0 })).toBe(false);
    expect(anisotropyWithinTolerance(0.66, 0.7)).toBe(true);
    expect(anisotropyWithinTolerance(0.62, 0.7)).toBe(false);
    expect(anisotropyWithinTolerance(0.01, 0)).toBe(true);
    expect(anisotropyWithinTolerance(null, 0.5)).toBe(false);
  });
});

describe("습식 시간축 지표: 순수 함수(합성 필드)", () => {
  it("frameOf는 복사 없이 필드를 묶고, fieldCovariance가 가우시안 모멘트를 복원한다", () => {
    const f = gaussian(4, 2, 30, 20);
    const fr = frameOf({ width: N, height: N, timeMs: 5, pigment: f, suspended: f, deposited: f, rewettable: f, water: f }, "pigment");
    expect(fr.field).toBe(f);
    expect(fr.timeMs).toBe(5);
    const c = fieldCovariance(fr);
    expect(c?.cx).toBeCloseTo(30, 2);
    expect(c?.cy).toBeCloseTo(20, 2);
    expect(Math.sqrt(c?.sxx ?? 0)).toBeCloseTo(4, 1);
    expect(Math.sqrt(c?.syy ?? 0)).toBeCloseTo(2, 1);
    expect(fieldCovariance(frame(0, new Float32Array(N * N)))).toBeNull();
  });

  it("확산 반경–시간 기울기: σ² = σ₀² + 2Dt인 순수 확산은 0.5, 선형 성장(R ∝ t)은 1, 정지는 null", () => {
    const sigma0 = 1.5;
    const diffusing = [0, 10, 20, 40, 80, 160].map((t) => frame(t, gaussian(Math.sqrt(sigma0 ** 2 + 0.02 * t), Math.sqrt(sigma0 ** 2 + 0.02 * t))));
    expect(diffusionRadiusSlopeOf(diffusing) ?? 0).toBeCloseTo(0.5, 1);
    // 초기 방울 크기와 무관: σ₀가 달라도 기울기는 같다.
    const bigStart = [0, 10, 20, 40, 80, 160].map((t) => frame(t, gaussian(Math.sqrt(4 ** 2 + 0.02 * t), Math.sqrt(4 ** 2 + 0.02 * t))));
    expect(diffusionRadiusSlopeOf(bigStart) ?? 0).toBeCloseTo(0.5, 1);
    // 초과 반경이 시간에 비례(R_ex ∝ t)하면 기울기 1: σ² = σ₀² + (0.05 t)².
    const ballistic = [0, 4, 8, 16, 32].map((t) => frame(t, gaussian(Math.sqrt(sigma0 ** 2 + (0.05 * t) ** 2), Math.sqrt(sigma0 ** 2 + (0.05 * t) ** 2))));
    expect(diffusionRadiusSlopeOf(ballistic) ?? 0).toBeCloseTo(1, 1);
    const still = [0, 10, 20, 30].map((t) => frame(t, gaussian(2, 2)));
    expect(diffusionRadiusSlopeOf(still)).toBeNull();
    expect(diffusionRadiusSlopeOf([])).toBeNull();
  });

  it("섬유 이방비: 가로·세로 확산 계수 비 Dy/Dx가 (1 − A)²이면 A를 복원하고, 회전해도 같다", () => {
    const base = frame(0, gaussian(1.5, 1.5));
    for (const a of [0, 0.3, 0.7]) {
      const dx = 0.03;
      const dy = dx * (1 - a) ** 2;
      const later = frame(100, gaussian(Math.sqrt(1.5 ** 2 + dx * 100), Math.sqrt(1.5 ** 2 + dy * 100)));
      expect(fiberAnisotropyRatioOf(base, later) ?? -1).toBeCloseTo(a, 1);
      // 축을 바꿔도(세로로 길게) 주축 비라 같은 값.
      const rotated = frame(100, gaussian(Math.sqrt(1.5 ** 2 + dy * 100), Math.sqrt(1.5 ** 2 + dx * 100)));
      expect(fiberAnisotropyRatioOf(base, rotated) ?? -1).toBeCloseTo(a, 1);
    }
    expect(fiberAnisotropyRatioOf(base, base)).toBeNull();
  });

  it("에지 다크닝 비: 균일 원판 ≈ 1(안티앨리어싱 링 ≤ 1), 가장자리가 1.5배 짙은 원판은 ≈ 1.5", () => {
    const w = N;
    const disc = (rim: number): Float32Array => {
      const f = new Float32Array(w * w);
      for (let y = 0; y < w; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const r = Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2);
          if (r > 20) continue;
          f[y * w + x] = r > 18 ? rim : 1;
        }
      }
      return f;
    };
    expect(edgeDarkeningRatioOfField(disc(1), w, w) ?? 0).toBeCloseTo(1, 1);
    expect(edgeDarkeningRatioOfField(disc(1.5), w, w) ?? 0).toBeGreaterThan(1.35);
    expect(edgeDarkeningRatioOfField(disc(1.5), w, w) ?? 0).toBeLessThan(1.6);
    expect(edgeDarkeningRatioOfField(new Float32Array(w * w), w, w)).toBeNull();
  });

  it("그래뉼레이션 대비: 고주파 얼룩의 std/mean만 재고 완만한 기울기는 무시한다", () => {
    const w = 96;
    const make = (noise: number, gradient: number): Float32Array => {
      const f = new Float32Array(w * w);
      let seed = 12345;
      for (let y = 0; y < w; y += 1) {
        for (let x = 0; x < w; x += 1) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const rnd = seed / 4294967296 - 0.5;
          f[y * w + x] = 1 + gradient * (x / w - 0.5) + noise * rnd;
        }
      }
      return f;
    };
    // 균일: 0, 완만한 기울기만: 거의 0, 얼룩 ±0.3(균등 분포 std ≈ 0.087): ≈ 0.087.
    expect(granulationContrastOfField(make(0, 0), w, w) ?? 1).toBeLessThan(1e-6);
    expect(granulationContrastOfField(make(0, 0.6), w, w) ?? 1).toBeLessThan(0.02);
    const textured = granulationContrastOfField(make(0.3, 0), w, w) ?? 0;
    expect(textured).toBeGreaterThan(0.07);
    expect(textured).toBeLessThan(0.1);
    expect(granulationContrastOfField(new Float32Array(w * w), w, w)).toBeNull();
  });

  it("백런 경계 비: 반경 10 근처 2 px 링이 안쪽보다 2배 짙으면 3구간 이동평균 한계로 1.5–2이고 링이 없으면 ≈ 1, 탐색 반경 상한이 바깥 링을 제외한다", () => {
    const f = new Float32Array(N * N);
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const r = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2);
        f[y * N + x] = r >= 9.5 && r < 11.5 ? 2 : r < 9.5 ? 1 : r >= 24 && r < 26 ? 3 : 0.8;
      }
    }
    const ring = backrunBoundaryRatioOf(f, N, N, N / 2, N / 2, 3, 16) ?? 0;
    expect(ring).toBeGreaterThan(1.5);
    expect(ring).toBeLessThan(2);
    const flat = new Float32Array(N * N).fill(1);
    expect(backrunBoundaryRatioOf(flat, N, N, N / 2, N / 2, 3, 16) ?? 0).toBeCloseTo(1, 5);
    // 상한 없이 찾으면 바깥(r ≈ 25)의 더 짙은 링을 집는다.
    expect(backrunBoundaryRatioOf(f, N, N, N / 2, N / 2, 3) ?? 0).toBeGreaterThan(ring + 0.2);
    expect(backrunBoundaryRatioOf(new Float32Array(N * N), N, N, N / 2, N / 2)).toBeNull();
  });
});

describe("습식 시간축 지표: 엔진 장면(설계 §4 임계)", () => {
  const FRAMES = [0, 20, 40, 80, 160];

  it("에지 다크닝 비: 수채 1.3–1.8, 수묵 1.1–1.4, 구아슈 ≤ 1.1", () => {
    const ratio = (medium: "watercolor" | "sumi" | "gouache"): number | null => {
      const s = runEdgeScene(wetMediumPreset(medium));
      return edgeDarkeningRatioOfField(s.deposited, s.width, s.height);
    };
    expect(withinRange(ratio("watercolor"), WET_TIME_TARGETS.edgeDarkeningRatio.watercolor), "watercolor").toBe(true);
    expect(withinRange(ratio("sumi"), WET_TIME_TARGETS.edgeDarkeningRatio.sumi), "sumi").toBe(true);
    expect(withinRange(ratio("gouache"), WET_TIME_TARGETS.edgeDarkeningRatio.gouache), "gouache").toBe(true);
  }, 30_000);

  it("그래뉼레이션 대비: 그래뉼레이션 안료 0.15–0.35, 비그래뉼레이션 ≤ 0.05(종이 요철 0.6)", () => {
    const spec = { ...DEFAULT_PAPER_SPEC, roughness: 0.6 };
    const contrast = (granulation: number): number | null => {
      const s = runGranulationScene(wetMediumPreset("watercolor", { granulation }), spec);
      return granulationContrastOfField(s.deposited, s.width, s.height);
    };
    expect(withinRange(contrast(0.5), WET_TIME_TARGETS.granulationContrast.granulating)).toBe(true);
    expect(withinRange(contrast(0), WET_TIME_TARGETS.granulationContrast.nonGranulating)).toBe(true);
    // 구아슈(비그래뉼레이션 프리셋)도 ≤ 0.05.
    const gouache = runGranulationScene(wetMediumPreset("gouache"), spec);
    expect(withinRange(granulationContrastOfField(gouache.deposited, gouache.width, gouache.height), WET_TIME_TARGETS.granulationContrast.nonGranulating)).toBe(true);
  }, 40_000);

  it("확산 반경–시간 log-log 기울기 0.45–0.55, 섬유 이방비 = fiberAnisotropy ±10 %(수채 0.3·수묵 0.7, 격자 정렬 섬유)", () => {
    for (const [medium, aniso] of [
      ["watercolor", 0.3],
      ["sumi", 0.7],
    ] as const) {
      for (const angle of [0, Math.PI / 2]) {
        const params = wetMediumPreset(medium);
        expect(params.fiberAnisotropy).toBe(aniso);
        const frames = runFilmDiffusionScene(params, FRAMES, { fiberAngleRad: angle }).map((s) => frameOf(s, "pigment"));
        const slope = diffusionRadiusSlopeOf(frames);
        expect(withinRange(slope, WET_TIME_TARGETS.diffusionSlope), `${medium} θ=${angle} 기울기 ${slope}`).toBe(true);
        const first = frames[0];
        const last = frames[frames.length - 1];
        if (!first || !last) throw new Error("프레임 없음");
        const measured = fiberAnisotropyRatioOf(first, last);
        expect(anisotropyWithinTolerance(measured, aniso), `${medium} θ=${angle} 이방비 ${measured}`).toBe(true);
      }
    }
    // 거칠기 0이면 닫힌 형식대로 정확히 aniso(1 % 이내).
    const exact = wetMediumPreset("sumi", { fiberRoughness: 0 });
    const frames = runFilmDiffusionScene(exact, FRAMES, { fiberAngleRad: 0 }).map((s) => frameOf(s, "pigment"));
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (!first || !last) throw new Error("프레임 없음");
    expect(fiberAnisotropyRatioOf(first, last) ?? 0).toBeCloseTo(0.7, 2);
  }, 60_000);

  it("백런 경계 비 ≥ 1.25(수채 재습윤), 수묵·구아슈는 아교·경화로 고정되어 새 전선 링이 거의 생기지 않는다", () => {
    const ratio = (medium: "watercolor" | "sumi" | "gouache"): number | null => {
      const r = runBackrunScene(wetMediumPreset(medium));
      return backrunBoundaryRatioOf(r.rewetted.deposited, r.rewetted.width, r.rewetted.height, r.centerX, r.centerY, 3, 16);
    };
    expect(withinRange(ratio("watercolor"), WET_TIME_TARGETS.backrunBoundaryRatio)).toBe(true);
    expect(withinRange(ratio("sumi"), WET_TIME_TARGETS.backrunBoundaryRatio)).toBe(false);
    expect(withinRange(ratio("gouache"), WET_TIME_TARGETS.backrunBoundaryRatio)).toBe(false);
  }, 40_000);
});
