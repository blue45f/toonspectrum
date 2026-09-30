import { describe, expect, it } from "vitest";

import {
  STUDIO_NATURAL_MEDIA_PRESETS,
  getNaturalMediaPreset,
  getNaturalMediaPresetsByCraft,
  validateHatchSettings,
  validateNaturalMediaSessionConfig,
  validateNaturalMediaStrokeStyle,
} from "./studio-natural-media-brushes";

describe("STUDIO_NATURAL_MEDIA_PRESETS", () => {
  it("10종의 내추럴 미디어 프리셋이 있다", () => {
    expect(STUDIO_NATURAL_MEDIA_PRESETS).toHaveLength(10);
  });

  it("모든 프리셋 id가 고유하다", () => {
    const ids = STUDIO_NATURAL_MEDIA_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 프리셋에 한/영 라벨과 설명이 있다", () => {
    for (const preset of STUDIO_NATURAL_MEDIA_PRESETS) {
      expect(preset.labelKo.length).toBeGreaterThan(0);
      expect(preset.labelEn.length).toBeGreaterThan(0);
      expect(preset.descriptionKo.length).toBeGreaterThan(0);
      expect(preset.brushName.length).toBeGreaterThan(0);
      expect(preset.defaultWeight).toBeGreaterThan(0);
      expect(preset.crafts.length).toBeGreaterThan(0);
    }
  });

  it("p5.brush 내장 브러시 이름과 매핑된다", () => {
    const brushNames = new Set([
      "2B",
      "HB",
      "2H",
      "cpencil",
      "pen",
      "rotring",
      "spray",
      "marker",
      "marker2",
      "charcoal",
      "hatch_brush",
    ]);
    for (const preset of STUDIO_NATURAL_MEDIA_PRESETS) {
      expect(brushNames.has(preset.brushName)).toBe(true);
    }
  });
});

describe("getNaturalMediaPreset", () => {
  it("id로 프리셋을 찾는다", () => {
    const preset = getNaturalMediaPreset("charcoal");
    expect(preset?.labelKo).toBe("목탄");
    expect(preset?.brushName).toBe("charcoal");
  });

  it("없는 id는 undefined를 반환한다", () => {
    // @ts-expect-error 존재하지 않는 id 테스트
    expect(getNaturalMediaPreset("nonexistent")).toBeUndefined();
  });
});

describe("getNaturalMediaPresetsByCraft", () => {
  it("선화용 프리셋을 찾는다", () => {
    const presets = getNaturalMediaPresetsByCraft("lineart");
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((p) => p.crafts.includes("lineart"))).toBe(true);
  });

  it("채색용 프리셋에는 마커가 포함된다", () => {
    const presets = getNaturalMediaPresetsByCraft("coloring");
    const ids = presets.map((p) => p.id);
    expect(ids).toContain("marker");
  });
});

describe("validateNaturalMediaSessionConfig", () => {
  it("유효한 설정은 null을 반환한다", () => {
    expect(
      validateNaturalMediaSessionConfig({ canvasWidth: 1024, canvasHeight: 768 }),
    ).toBeNull();
  });

  it("0 이하 크기는 invalid-config", () => {
    expect(
      validateNaturalMediaSessionConfig({ canvasWidth: 0, canvasHeight: 768 }),
    ).toBe("invalid-config");
  });

  it("8192 초과 크기는 invalid-config", () => {
    expect(
      validateNaturalMediaSessionConfig({ canvasWidth: 9000, canvasHeight: 768 }),
    ).toBe("invalid-config");
  });

  it("NaN 크기는 invalid-config", () => {
    expect(
      validateNaturalMediaSessionConfig({
        canvasWidth: Number.NaN,
        canvasHeight: 768,
      }),
    ).toBe("invalid-config");
  });
});

describe("validateNaturalMediaStrokeStyle", () => {
  it("유효한 스타일은 true", () => {
    expect(
      validateNaturalMediaStrokeStyle({ color: [0.2, 0.4, 0.8], weight: 5 }),
    ).toBe(true);
  });

  it("범위 밖 색상은 false", () => {
    expect(
      validateNaturalMediaStrokeStyle({ color: [1.5, 0, 0], weight: 5 }),
    ).toBe(false);
  });

  it("범위 밖 굵기는 false", () => {
    expect(
      validateNaturalMediaStrokeStyle({ color: [0, 0, 0], weight: 0.1 }),
    ).toBe(false);
    expect(
      validateNaturalMediaStrokeStyle({ color: [0, 0, 0], weight: 200 }),
    ).toBe(false);
  });
});

describe("validateHatchSettings", () => {
  it("유효한 해칭 설정은 true", () => {
    expect(validateHatchSettings(10, 45)).toBe(true);
  });

  it("범위 밖 간격은 false", () => {
    expect(validateHatchSettings(1, 45)).toBe(false);
    expect(validateHatchSettings(101, 45)).toBe(false);
  });

  it("범위 밖 각도는 false", () => {
    expect(validateHatchSettings(10, -1)).toBe(false);
    expect(validateHatchSettings(10, 181)).toBe(false);
  });
});
