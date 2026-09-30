import { describe, expect, it } from "vitest";

import {
  STUDIO_SCREENTONE_LIMITS,
  STUDIO_SCREENTONE_PRESETS,
  buildScreentoneTile,
  hexToRgb,
  measureScreentoneCoverage,
  validateScreentoneConfig,
  type ScreentoneConfig,
} from "./studio-screentone";

const valid: ScreentoneConfig = {
  pattern: "dot",
  density: 30,
  lines: 24,
  angleDeg: 45,
};

describe("STUDIO_SCREENTONE_PRESETS", () => {
  it("시작 프리셋 4종이 있다", () => {
    expect(STUDIO_SCREENTONE_PRESETS).toHaveLength(4);
  });

  it("모든 프리셋 설정이 유효하다", () => {
    for (const preset of STUDIO_SCREENTONE_PRESETS) {
      expect(validateScreentoneConfig(preset.config).ok).toBe(true);
      expect(preset.labelKo.length).toBeGreaterThan(0);
      expect(preset.labelEn.length).toBeGreaterThan(0);
    }
  });
});

describe("validateScreentoneConfig", () => {
  it("유효한 설정은 ok", () => {
    expect(validateScreentoneConfig(valid).ok).toBe(true);
  });

  it("농도 범위를 벗어나면 실패", () => {
    expect(validateScreentoneConfig({ ...valid, density: 5 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, density: 90 }).ok).toBe(false);
  });

  it("선 수는 정수 범위", () => {
    expect(validateScreentoneConfig({ ...valid, lines: 7 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, lines: 73 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, lines: 24.5 }).ok).toBe(false);
  });

  it("각도 범위", () => {
    expect(validateScreentoneConfig({ ...valid, angleDeg: -1 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, angleDeg: 181 }).ok).toBe(false);
    expect(validateScreentoneConfig({ ...valid, angleDeg: 180 }).ok).toBe(true);
  });

  it("한계값이 명세(10~80%)와 일치", () => {
    expect(STUDIO_SCREENTONE_LIMITS.minDensity).toBe(10);
    expect(STUDIO_SCREENTONE_LIMITS.maxDensity).toBe(80);
  });
});

describe("buildScreentoneTile", () => {
  it("도트 타일의 실제 커버리지가 설정 농도와 근사하다", () => {
    const tile = buildScreentoneTile(
      { pattern: "dot", density: 30, lines: 20, angleDeg: 0 },
      { size: 200 },
    );
    const coverage = measureScreentoneCoverage(tile);
    // 격자 양자화 오차 허용 ±6%p
    expect(Math.abs(coverage - 0.3)).toBeLessThan(0.06);
  });

  it("농도가 높을수록 커버리지가 크다", () => {
    const low = measureScreentoneCoverage(
      buildScreentoneTile({ ...valid, density: 20 }, { size: 120 }),
    );
    const high = measureScreentoneCoverage(
      buildScreentoneTile({ ...valid, density: 70 }, { size: 120 }),
    );
    expect(high).toBeGreaterThan(low);
  });

  it("선 패턴의 커버리지도 농도를 따른다", () => {
    const tile = buildScreentoneTile(
      { pattern: "line", density: 50, lines: 20, angleDeg: 0 },
      { size: 200 },
    );
    const coverage = measureScreentoneCoverage(tile);
    expect(Math.abs(coverage - 0.5)).toBeLessThan(0.06);
  });

  it("크로스 패턴이 생성되고 값이 0/1이다", () => {
    const tile = buildScreentoneTile(
      { pattern: "cross", density: 40, lines: 16, angleDeg: 45 },
      { size: 96 },
    );
    expect(tile.length).toBe(96 * 96);
    let invalid = 0;
    for (const v of tile) {
      if (v !== 0 && v !== 1) invalid += 1;
    }
    expect(invalid).toBe(0);
    const coverage = measureScreentoneCoverage(tile);
    expect(coverage).toBeGreaterThan(0.2);
    expect(coverage).toBeLessThan(0.7);
  });

  it("타일 크기가 클램프된다", () => {
    expect(buildScreentoneTile(valid, { size: 4 }).length).toBe(16 * 16);
    expect(buildScreentoneTile(valid, { size: 1000 }).length).toBe(512 * 512);
  });

  it("빈 타일의 커버리지는 0", () => {
    expect(measureScreentoneCoverage(new Float32Array(0))).toBe(0);
  });
});

describe("hexToRgb", () => {
  it("#rrggbb를 파싱한다", () => {
    expect(hexToRgb("#1a2b3c")).toEqual([26, 43, 60]);
  });

  it("잘못된 입력은 검정으로", () => {
    expect(hexToRgb("zzz")).toEqual([0, 0, 0]);
  });
});
