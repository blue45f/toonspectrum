import { describe, expect, it } from "vitest";
import { resolveStudioVrmDisplayDpr } from "./studio-vrm-render-policy";

describe("VRM 표시용 픽셀 예산", () => {
  it("모바일의 높은 DPR을 제한하고 기기 확대 비율을 강제로 올리지 않는다", () => {
    expect(resolveStudioVrmDisplayDpr({ width: 390, height: 600, devicePixelRatio: 3, coarse: true })).toBe(1.5);
    expect(resolveStudioVrmDisplayDpr({ width: 390, height: 600, devicePixelRatio: 0.8, coarse: true })).toBe(0.8);
  });
  it.each([true, false])("큰 작업면에서도 프로필의 실제 픽셀 상한을 지킨다: %s", (coarse) => {
    const width = 7680, height = 4320;
    const dpr = resolveStudioVrmDisplayDpr({ width, height, devicePixelRatio: 3, coarse });
    expect(dpr).toBeGreaterThan(0);
    expect(width * height * dpr * dpr).toBeLessThanOrEqual((coarse ? 1_500_000 : 4_000_000) + 0.001);
  });
  it("데스크톱은 필요할 때만 2배 표시를 사용한다", () => {
    expect(resolveStudioVrmDisplayDpr({ width: 800, height: 600, devicePixelRatio: 3, coarse: false })).toBe(2);
  });
  it.each([0, -1, NaN, Infinity])("측정 전 유효하지 않은 크기는 기본 표시를 사용한다: %s", (width) => {
    expect(resolveStudioVrmDisplayDpr({ width, height: 600, devicePixelRatio: 2, coarse: true })).toBe(1);
  });
  it("low 등급은 픽셀 예산과 DPR 상한을 낮춘다", () => {
    // 데스크톱 큰 화면: standard는 예산 4M·상한 2, low는 예산 0.9M·상한 1.25.
    expect(resolveStudioVrmDisplayDpr({ width: 800, height: 600, devicePixelRatio: 3, coarse: false, tier: "low" })).toBe(1.25);
    expect(resolveStudioVrmDisplayDpr({ width: 390, height: 600, devicePixelRatio: 3, coarse: true, tier: "low" })).toBe(1);
    const width = 1920, height = 1080;
    const dpr = resolveStudioVrmDisplayDpr({ width, height, devicePixelRatio: 2, coarse: false, tier: "low" });
    expect(width * height * dpr * dpr).toBeLessThanOrEqual(900_000 + 0.001);
  });
  it("등급을 생략하면 기존 standard 예산과 같다", () => {
    expect(resolveStudioVrmDisplayDpr({ width: 800, height: 600, devicePixelRatio: 3, coarse: false, tier: "standard" })).toBe(2);
  });
});
