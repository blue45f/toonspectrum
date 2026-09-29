import { describe, expect, it } from "vitest";

import {
  convertStudioLtImage,
  normalizeStudioLtConvertOptions,
  STUDIO_LT_CONVERT_DEFAULT_OPTIONS,
  STUDIO_LT_CONVERT_MAX_PIXELS,
  StudioLtConvertError,
  type StudioLtConvertOptions,
} from "./studio-lt-convert";
import { createStudioLtConvertLayerPayloads } from "./studio-lt-convert-layer";

// node 환경에는 ImageData가 없으므로 최소 스텁을 제공한다.
if (typeof globalThis.ImageData === "undefined") {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = TestImageData as unknown as typeof ImageData;
}

const DEFAULT_OPTIONS: StudioLtConvertOptions = {
  toneDensity: 4,
  lineThickness: 2,
  lineThreshold: 0.1,
};

function makeImageData(
  width: number,
  height: number,
  fill: (x: number, y: number) => readonly [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return new ImageData(data, width, height);
}

function countLinePixels(lineLayer: ImageData): number {
  let count = 0;
  for (let index = 3; index < lineLayer.data.length; index += 4) {
    if ((lineLayer.data[index] ?? 0) > 0) count += 1;
  }
  return count;
}

function distinctToneValues(toneLayer: ImageData): number[] {
  const values = new Set<number>();
  for (let index = 0; index < toneLayer.data.length; index += 4) {
    values.add(toneLayer.data[index] ?? -1);
  }
  return [...values].sort((a, b) => a - b);
}

describe("normalizeStudioLtConvertOptions", () => {
  it("범위 밖 값은 clamp하고 정수는 반올림한다", () => {
    const normalized = normalizeStudioLtConvertOptions({
      toneDensity: 99,
      lineThickness: 0,
      lineThreshold: 2,
    });
    expect(normalized.toneDensity).toBe(8);
    expect(normalized.lineThickness).toBe(1);
    expect(normalized.lineThreshold).toBe(1);
  });

  it("NaN 값은 기본값으로 대체한다", () => {
    const normalized = normalizeStudioLtConvertOptions({
      toneDensity: Number.NaN,
      lineThickness: Number.NaN,
      lineThreshold: Number.NaN,
    });
    expect(normalized.toneDensity).toBe(
      STUDIO_LT_CONVERT_DEFAULT_OPTIONS.toneDensity,
    );
    expect(normalized.lineThickness).toBe(
      STUDIO_LT_CONVERT_DEFAULT_OPTIONS.lineThickness,
    );
    expect(normalized.lineThreshold).toBe(
      STUDIO_LT_CONVERT_DEFAULT_OPTIONS.lineThreshold,
    );
    expect(normalized.screentone).toBe(false);
  });

  it("옵션이 없으면 invalid-input 오류를 던진다", () => {
    expect(() =>
      normalizeStudioLtConvertOptions(
        null as unknown as StudioLtConvertOptions,
      ),
    ).toThrowError(StudioLtConvertError);
  });
});

describe("convertStudioLtImage 선화", () => {
  const diagonal = (size: number) =>
    makeImageData(size, size, (x, y) =>
      x === y ? [255, 255, 255, 255] : [0, 0, 0, 255],
    );

  it("대각선에서 선을 검출하고, 선에서 먼 픽셀은 투명으로 둔다", () => {
    const { lineLayer } = convertStudioLtImage(diagonal(16), DEFAULT_OPTIONS);
    expect(lineLayer.width).toBe(16);
    expect(lineLayer.height).toBe(16);
    const lineCount = countLinePixels(lineLayer);
    expect(lineCount).toBeGreaterThan(8);
    // 선 픽셀은 검은색 불투명, 나머지는 완전 투명이다.
    for (let index = 0; index < lineLayer.data.length; index += 4) {
      const alpha = lineLayer.data[index + 3] ?? -1;
      if (alpha > 0) {
        expect(alpha).toBe(255);
        expect(lineLayer.data[index]).toBe(0);
        expect(lineLayer.data[index + 1]).toBe(0);
        expect(lineLayer.data[index + 2]).toBe(0);
      } else {
        expect(alpha).toBe(0);
      }
    }
    // 대각선에서 가장 먼 모서리(0,15)는 선이 아니다.
    expect(lineLayer.data[(15 * 16 + 0) * 4 + 3]).toBe(0);
  });

  it("선 굵기를 키우면 선 픽셀이 늘어난다", () => {
    const thin = countLinePixels(
      convertStudioLtImage(diagonal(24), { ...DEFAULT_OPTIONS, lineThickness: 1 })
        .lineLayer,
    );
    const thick = countLinePixels(
      convertStudioLtImage(diagonal(24), { ...DEFAULT_OPTIONS, lineThickness: 5 })
        .lineLayer,
    );
    expect(thin).toBeGreaterThan(0);
    expect(thick).toBeGreaterThan(thin);
  });

  it("임계값 1에서는 평탄한 이미지에서 선이 없고, 0에서는 전부 선이 된다", () => {
    const flat = makeImageData(8, 8, () => [128, 128, 128, 255]);
    const none = countLinePixels(
      convertStudioLtImage(flat, { ...DEFAULT_OPTIONS, lineThreshold: 1 })
        .lineLayer,
    );
    expect(none).toBe(0);
    const all = countLinePixels(
      convertStudioLtImage(flat, { ...DEFAULT_OPTIONS, lineThreshold: 0 })
        .lineLayer,
    );
    expect(all).toBe(64);
  });
});

describe("convertStudioLtImage 톤", () => {
  it("그라디언트를 toneDensity 단계로 양자화한다", () => {
    const gradient = makeImageData(8, 8, (x) => {
      const value = Math.round((x / 7) * 255);
      return [value, value, value, 255];
    });
    const { toneLayer } = convertStudioLtImage(gradient, {
      ...DEFAULT_OPTIONS,
      toneDensity: 4,
    });
    expect(distinctToneValues(toneLayer)).toEqual([0, 85, 170, 255]);
    // 톤 레이어(일반)는 불투명 회색조다.
    for (let index = 0; index < toneLayer.data.length; index += 4) {
      const r = toneLayer.data[index] ?? -1;
      expect(toneLayer.data[index + 1]).toBe(r);
      expect(toneLayer.data[index + 2]).toBe(r);
      expect(toneLayer.data[index + 3]).toBe(255);
    }
  });

  it("toneDensity 2·8 경계에서도 단계 수가 맞는다", () => {
    const gradient = makeImageData(16, 4, (x) => {
      const value = Math.round((x / 15) * 255);
      return [value, value, value, 255];
    });
    const two = convertStudioLtImage(gradient, {
      ...DEFAULT_OPTIONS,
      toneDensity: 2,
    }).toneLayer;
    expect(distinctToneValues(two)).toEqual([0, 255]);
    const eight = convertStudioLtImage(gradient, {
      ...DEFAULT_OPTIONS,
      toneDensity: 8,
    }).toneLayer;
    expect(distinctToneValues(eight)).toHaveLength(8);
  });

  it("screentone을 켜면 도트(검정+투명 배경)로 출력된다", () => {
    const half = makeImageData(8, 8, (x) =>
      x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const { toneLayer } = convertStudioLtImage(half, {
      ...DEFAULT_OPTIONS,
      toneDensity: 2,
      screentone: true,
    });
    const alphas = new Set<number>();
    for (let index = 3; index < toneLayer.data.length; index += 4) {
      alphas.add(toneLayer.data[index] ?? -1);
    }
    // 알파는 0(투명) 또는 255(도트) 둘 중 하나다.
    expect([...alphas].sort()).toEqual([0, 255]);
    // 어두운 절반은 전부 도트, 밝은 절반은 전부 투명이다.
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const alpha = toneLayer.data[(y * 8 + x) * 4 + 3] ?? -1;
        expect(alpha).toBe(x < 4 ? 255 : 0);
      }
    }
  });
});

describe("convertStudioLtImage 경계 조건", () => {
  it("1x1 이미지에서도 동작한다", () => {
    const single = makeImageData(1, 1, () => [200, 100, 50, 255]);
    const { lineLayer, toneLayer } = convertStudioLtImage(single, DEFAULT_OPTIONS);
    expect(lineLayer.width).toBe(1);
    expect(lineLayer.height).toBe(1);
    expect(toneLayer.width).toBe(1);
    expect(toneLayer.height).toBe(1);
    expect(toneLayer.data[3]).toBe(255);
  });

  it("빈 이미지는 invalid-input 오류를 던진다", () => {
    expect(() =>
      convertStudioLtImage(
        { width: 0, height: 10, data: [] },
        DEFAULT_OPTIONS,
      ),
    ).toThrowError(StudioLtConvertError);
    try {
      convertStudioLtImage({ width: 0, height: 10, data: [] }, DEFAULT_OPTIONS);
    } catch (error) {
      expect((error as StudioLtConvertError).code).toBe("invalid-input");
    }
  });

  it("NaN 픽셀은 0(검정)으로 취급하고 오류를 던지지 않는다", () => {
    const source = {
      width: 2,
      height: 2,
      data: [
        Number.NaN, 0, 0, 255,
        0, Number.NaN, 0, 255,
        0, 0, Number.NaN, 255,
        10, 20, 30, 255,
      ],
    };
    const { lineLayer, toneLayer } = convertStudioLtImage(source, DEFAULT_OPTIONS);
    expect(lineLayer.width).toBe(2);
    expect(toneLayer.width).toBe(2);
    for (const value of toneLayer.data) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("예산 초과 이미지는 budget-exceeded 오류를 던진다", () => {
    const side = Math.ceil(Math.sqrt(STUDIO_LT_CONVERT_MAX_PIXELS + 1));
    try {
      convertStudioLtImage(
        { width: side, height: side, data: [] },
        DEFAULT_OPTIONS,
      );
      expect.unreachable("예산 초과 오류가 발생해야 한다");
    } catch (error) {
      expect(error).toBeInstanceOf(StudioLtConvertError);
      expect((error as StudioLtConvertError).code).toBe("budget-exceeded");
    }
  });
});

describe("createStudioLtConvertLayerPayloads", () => {
  it("선화·톤 순서의 페이로드를 만들고 기본 이름을 붙인다", () => {
    const source = makeImageData(4, 4, (x, y) =>
      x === y ? [255, 255, 255, 255] : [0, 0, 0, 255],
    );
    const result = convertStudioLtImage(source, DEFAULT_OPTIONS);
    const [line, tone] = createStudioLtConvertLayerPayloads(result);
    expect(line.kind).toBe("lt-convert-line");
    expect(tone.kind).toBe("lt-convert-tone");
    expect(line.name).toBe("LT 선화");
    expect(tone.name).toBe("LT 톤");
    expect(line.imageData).toBe(result.lineLayer);
    expect(tone.imageData).toBe(result.toneLayer);
    expect(line.width).toBe(4);
    expect(tone.height).toBe(4);
  });

  it("사용자 지정 이름을 사용한다", () => {
    const source = makeImageData(2, 2, () => [255, 255, 255, 255]);
    const result = convertStudioLtImage(source, DEFAULT_OPTIONS);
    const [line, tone] = createStudioLtConvertLayerPayloads(result, {
      lineName: "캐릭터 선화",
      toneName: "캐릭터 톤",
    });
    expect(line.name).toBe("캐릭터 선화");
    expect(tone.name).toBe("캐릭터 톤");
  });
});
