import { describe, expect, it } from "vitest";

import {
  STUDIO_GRADIENT_MAP_PRESETS,
  applyGradientMapToRgba,
  buildGradientMapLut,
  buildLutFromHexStops,
  createCustomGradientModel,
  getGradientMapPreset,
  luminanceOf,
  rgbToHex,
  sortGradientStops,
  validateGradientStops,
} from "./studio-gradient-map";

describe("STUDIO_GRADIENT_MAP_PRESETS", () => {
  it("프리셋 5종이 있다", () => {
    expect(STUDIO_GRADIENT_MAP_PRESETS).toHaveLength(5);
  });

  it("id가 고유하고 한/영 라벨이 있다", () => {
    const ids = STUDIO_GRADIENT_MAP_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of STUDIO_GRADIENT_MAP_PRESETS) {
      expect(p.labelKo.length).toBeGreaterThan(0);
      expect(p.labelEn.length).toBeGreaterThan(0);
      expect(validateGradientStops(p.stops).ok).toBe(true);
    }
  });

  it("필수 프리셋(석양·심해·세피아·사이버펑크·모노크롬)이 있다", () => {
    for (const id of ["sunset", "deep-sea", "sepia", "cyberpunk", "monochrome"] as const) {
      expect(getGradientMapPreset(id)).toBeDefined();
    }
  });

  it("모노크롬은 흑→백", () => {
    const mono = getGradientMapPreset("monochrome");
    expect(mono?.stops[0].color).toEqual([0, 0, 0]);
    expect(mono?.stops[mono.stops.length - 1].color).toEqual([255, 255, 255]);
  });
});

describe("validateGradientStops", () => {
  it("정지점 2개 미만은 실패", () => {
    expect(validateGradientStops([{ position: 0, color: [0, 0, 0] }]).ok).toBe(false);
  });

  it("위치가 정렬되지 않으면 실패", () => {
    const r = validateGradientStops([
      { position: 0.8, color: [255, 0, 0] },
      { position: 0.2, color: [0, 0, 255] },
    ]);
    expect(r.ok).toBe(false);
  });

  it("위치 중복은 실패", () => {
    const r = validateGradientStops([
      { position: 0, color: [0, 0, 0] },
      { position: 0, color: [255, 255, 255] },
    ]);
    expect(r.ok).toBe(false);
  });

  it("색상 채널 범위 검사", () => {
    const r = validateGradientStops([
      { position: 0, color: [0, 0, 0] },
      { position: 1, color: [300, 0, 0] },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("buildGradientMapLut", () => {
  it("LUT 크기와 양 끝 색상", () => {
    const lut = buildGradientMapLut([
      { position: 0, color: [10, 20, 30] },
      { position: 1, color: [200, 210, 220] },
    ]);
    expect(lut.length).toBe(256 * 3);
    expect([lut[0], lut[1], lut[2]]).toEqual([10, 20, 30]);
    expect([lut[255 * 3], lut[255 * 3 + 1], lut[255 * 3 + 2]]).toEqual([200, 210, 220]);
  });

  it("중간값이 선형 보간된다", () => {
    const lut = buildGradientMapLut([
      { position: 0, color: [0, 0, 0] },
      { position: 1, color: [255, 255, 255] },
    ], 5);
    // 인덱스 2 = t 0.5 → 128 근처
    expect(lut[2 * 3]).toBeGreaterThanOrEqual(126);
    expect(lut[2 * 3]).toBeLessThanOrEqual(129);
  });
});

describe("applyGradientMapToRgba", () => {
  const monoLut = buildGradientMapLut([
    { position: 0, color: [0, 0, 0] },
    { position: 1, color: [255, 255, 255] },
  ]);

  it("검정 픽셀은 LUT 0번, 흰 픽셀은 마지막", () => {
    const input = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 200]);
    const out = applyGradientMapToRgba(input, monoLut);
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 0, 255]);
    expect([out[4], out[5], out[6]]).toEqual([255, 255, 255]);
    // 알파 유지
    expect(out[7]).toBe(200);
  });

  it("원본 버퍼를 변경하지 않는다", () => {
    const input = new Uint8ClampedArray([10, 20, 30, 255]);
    const copy = new Uint8ClampedArray(input);
    applyGradientMapToRgba(input, monoLut);
    expect(input).toEqual(copy);
  });

  it("색상 매핑: 빨강 명도 → 석양 그라데이션", () => {
    const sunset = getGradientMapPreset("sunset");
    const lut = buildGradientMapLut(sunset!.stops);
    // 순수 빨강의 명도 ≈ 0.299 → t≈0.3 구간의 주황 계열
    const input = new Uint8ClampedArray([255, 0, 0, 255]);
    const out = applyGradientMapToRgba(input, lut);
    expect(out[0]).toBeGreaterThan(out[2]); // R > B (주황 계열)
  });
});

describe("createCustomGradientModel", () => {
  const base = [
    { position: 0, color: [0, 0, 0] as const },
    { position: 1, color: [255, 255, 255] as const },
  ];

  it("정지점 추가·이동·색변경·삭제가 불변으로 동작한다", () => {
    const m0 = createCustomGradientModel(base);
    const m1 = m0.addStop({ position: 0.5, color: [128, 0, 0] });
    expect(m1.stops).toHaveLength(3);
    expect(m0.stops).toHaveLength(2); // 원본 불변

    const m2 = m1.moveStop(1, 0.7);
    expect(m2.stops[1].position).toBe(0.7);

    const m3 = m2.recolorStop(0, [10, 10, 10]);
    expect(m3.stops[0].color).toEqual([10, 10, 10]);

    const m4 = m3.removeStop(1);
    expect(m4.stops).toHaveLength(2);
  });

  it("추가된 정지점이 자동 정렬된다", () => {
    const m = createCustomGradientModel(base).addStop({
      position: 0.9,
      color: [200, 200, 200],
    });
    const positions = m.stops.map((s) => s.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("sortGradientStops", () => {
  it("위치 오름차순 정렬", () => {
    const sorted = sortGradientStops([
      { position: 1, color: [1, 1, 1] },
      { position: 0, color: [0, 0, 0] },
    ]);
    expect(sorted[0].position).toBe(0);
  });
});

describe("luminanceOf / rgbToHex / buildLutFromHexStops", () => {
  it("흰색 명도는 1, 검정은 0", () => {
    expect(luminanceOf(255, 255, 255)).toBeCloseTo(1, 5);
    expect(luminanceOf(0, 0, 0)).toBeCloseTo(0, 5);
  });

  it("rgbToHex", () => {
    expect(rgbToHex(255, 0, 16)).toBe("#ff0010");
  });

  it("hex 정지점으로 LUT 생성", () => {
    const lut = buildLutFromHexStops([
      { position: 0, hex: "#000000" },
      { position: 1, hex: "#ffffff" },
    ]);
    expect(lut.length).toBe(256 * 3);
    expect(lut[0]).toBe(0);
    expect(lut[255 * 3]).toBe(255);
  });
});
