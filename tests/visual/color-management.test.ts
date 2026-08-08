import { loadCanvasKitNode } from "@toonspectrum/studio-engine-skia/node";
import { beforeAll, describe, expect, it } from "vitest";

import {
  CIEDE2000_SHARMA_2005_VECTORS,
  buildGridColors,
  ciede2000,
  encodedToLab,
  gridToRgbaBytes,
  laneRasterDirectP3,
  laneReadPixels,
  referenceDisplayP3ToSrgb,
  referenceSrgbToDisplayP3,
  studioSrgbToDisplayP3,
} from "../benchmarks/harness/color-lab";

import type { Vec3 } from "../benchmarks/harness/color-lab";
import type { CanvasKit } from "canvaskit-wasm";

/**
 * V12 게이트 매트릭스 Color 행 — 색관리 빠른 회귀 게이트 (ADR-0011 레인 14).
 *
 * 기준(참조 구현·측정 레인)은 tests/benchmarks/harness/color-lab.ts 가 소유하고, 이 테스트는
 * 그 실측(tests/benchmarks/results/color-lab.json, 2026-08-08 / Apple M2 Max / node v24.16)이
 * 정의한 상한만 고정한다:
 *
 *   - CIEDE2000 자체 검증: Sharma/Wu/Dalal 2005 공식 벡터 34쌍, 허용 1e-4
 *     (실측 maxAbsError = 4.9499e-5).
 *   - 참조 f64 왕복(sRGB→P3→sRGB): deltaE00 max < 1e-6 (실측 6.91068e-14).
 *   - 스튜디오 합성 변환 vs 참조: 실측 max 9.4369e-14 — 2배는 1.9e-13 이지만 JS 엔진 간
 *     pow 마지막 ulp 편차 여유로 1e-9 로 핀(행렬/전달 함수 오타 회귀는 1e-3 이상으로 튄다).
 *   - canvaskit 변환(실측 가능 확정 레인): max deltaE00 상한 = 실측의 2배.
 *       readPixels dst DISPLAY_P3 RGBA_F32   실측 max 0.0266918 → 게이트 0.0533836
 *       readPixels dst DISPLAY_P3 RGBA_8888  실측 max 0.509218  → 게이트 1.018436
 *         (8비트 양자화 바닥 실측 0.509218 과 동일 — 양자화 지배 레인)
 *       MakeRasterDirectSurface DISPLAY_P3   실측 max 0.509218  → 게이트 1.018436
 */

// tests/benchmarks/results/color-lab.json 실측이 정의한 상한 (위 주석의 수치 인용).
const REFERENCE_ROUNDTRIP_MAX_DELTAE00 = 1e-6;
const STUDIO_VS_REFERENCE_MAX_DELTAE00 = 1e-9;
const CANVASKIT_F32_MAX_DELTAE00 = 0.0533836; // 2 × 0.0266918
const CANVASKIT_8888_MAX_DELTAE00 = 1.018436; // 2 × 0.509218

describe("color management lab regression gates", () => {
  it("CIEDE2000 은 Sharma 2005 공식 테스트 벡터 34쌍과 1e-4 이내로 일치한다", () => {
    expect(CIEDE2000_SHARMA_2005_VECTORS.length).toBeGreaterThanOrEqual(5);
    for (const vector of CIEDE2000_SHARMA_2005_VECTORS) {
      const computed = ciede2000(vector.lab1, vector.lab2);
      expect(Math.abs(computed - vector.expected)).toBeLessThanOrEqual(1e-4);
    }
  });

  it("참조 f64 sRGB→P3→sRGB 왕복 deltaE00 이 1e-6 미만이다 (729색 그리드)", () => {
    const grid = buildGridColors();
    let max = 0;
    for (const color of grid) {
      const roundtrip = referenceDisplayP3ToSrgb(referenceSrgbToDisplayP3(color));
      const delta = ciede2000(encodedToLab(color, "srgb"), encodedToLab(roundtrip, "srgb"));
      if (delta > max) max = delta;
    }
    expect(max).toBeLessThan(REFERENCE_ROUNDTRIP_MAX_DELTAE00);
  });

  it("스튜디오 합성 변환(studio-highbit-transfer + studio-highbit-colorspace)이 참조와 일치한다", () => {
    const grid = buildGridColors();
    let max = 0;
    for (const color of grid) {
      const reference = referenceSrgbToDisplayP3(color);
      const studio = studioSrgbToDisplayP3(color);
      const delta = ciede2000(
        encodedToLab(reference, "display-p3"),
        encodedToLab(studio, "display-p3"),
      );
      if (delta > max) max = delta;
    }
    expect(max).toBeLessThan(STUDIO_VS_REFERENCE_MAX_DELTAE00);
  });

  describe("canvaskit sRGB→Display-P3 변환 (실측 확정 레인)", () => {
    let ck: CanvasKit;
    let grid: Vec3[];
    let referenceP3: Vec3[];
    let sourceBytes: Uint8Array;

    beforeAll(async () => {
      ck = await loadCanvasKitNode();
      grid = buildGridColors();
      referenceP3 = grid.map(referenceSrgbToDisplayP3);
      sourceBytes = gridToRgbaBytes(grid);
    });

    it("readPixels(dst DISPLAY_P3, RGBA_F32) 레인이 지원되고 실측 2배 상한 안이다", () => {
      const lane = laneReadPixels(ck, sourceBytes, grid, referenceP3, "rgbaF32");
      expect(lane.supported).toBe(true);
      expect(lane.vsReference).not.toBeNull();
      expect(lane.vsReference!.max).toBeLessThan(CANVASKIT_F32_MAX_DELTAE00);
    });

    it("readPixels(dst DISPLAY_P3, RGBA_8888) 레인이 지원되고 실측 2배 상한 안이다", () => {
      const lane = laneReadPixels(ck, sourceBytes, grid, referenceP3, "rgba8888");
      expect(lane.supported).toBe(true);
      expect(lane.vsReference).not.toBeNull();
      expect(lane.vsReference!.max).toBeLessThan(CANVASKIT_8888_MAX_DELTAE00);
    });

    it("MakeRasterDirectSurface(DISPLAY_P3) P3 서피스 레인이 지원되고 실측 2배 상한 안이다", () => {
      const lane = laneRasterDirectP3(ck, sourceBytes, grid, referenceP3);
      expect(lane.supported).toBe(true);
      expect(lane.vsReference).not.toBeNull();
      expect(lane.vsReference!.max).toBeLessThan(CANVASKIT_8888_MAX_DELTAE00);
    });
  });
});
