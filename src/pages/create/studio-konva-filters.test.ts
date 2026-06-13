import { describe, expect, it } from "vitest";
import {
  buildImageFilters,
  hasActiveImageFilters,
  imageFilterCacheKey,
  registerStudioKonvaFilters,
  type ImageFilterFields,
  type KonvaLike,
} from "./studio-konva-filters";
import type { StudioImageDataLike } from "./studio-filters";

// 내장 필터 스텁을 가진 가짜 konva — node 없이 순수 검증.
function fakeKonva(): KonvaLike {
  return {
    Filters: {
      Blur() {},
      Brighten() {},
      Contrast() {},
      Grayscale() {},
      Sepia() {},
      HSL() {},
      Pixelate() {},
      Invert() {},
    },
  };
}

// 단색 채운 가짜 ImageData(width*height 픽셀).
function solidImage(width: number, height: number, r: number, g: number, b: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

const CUSTOM = [
  "Screentone",
  "Lineart",
  "Chromatic",
  "Posterize",
  "Noise",
  "Temperature",
  "Sharpen",
  "InkThreshold",
  "Duotone",
] as const;

describe("registerStudioKonvaFilters", () => {
  it("커스텀 필터 9종을 함수로 등록한다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    for (const name of CUSTOM) {
      expect(typeof konva.Filters[name]).toBe("function");
    }
  });

  it("멱등 — 두 번 호출해도 함수로 유지되고 throw 없음", () => {
    const konva = fakeKonva();
    expect(() => {
      registerStudioKonvaFilters(konva);
      registerStudioKonvaFilters(konva);
    }).not.toThrow();
    for (const name of CUSTOM) {
      expect(typeof konva.Filters[name]).toBe("function");
    }
  });

  it("내장 Blur 참조를 덮어쓰지 않는다", () => {
    const konva = fakeKonva();
    const originalBlur = konva.Filters.Blur;
    registerStudioKonvaFilters(konva);
    expect(konva.Filters.Blur).toBe(originalBlur);
  });

  it("Temperature 래퍼가 attrs로 호출되면 ImageData를 실제로 변형한다(따뜻하게: r↑ b↓)", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const img = solidImage(1, 1, 128, 128, 128);
    konva.Filters.Temperature!.call({ attrs: { temperature: 100 } }, img);
    expect(img.data[0]!).toBeGreaterThan(128); // red 증가
    expect(img.data[2]!).toBeLessThan(128); // blue 감소
  });
});

describe("buildImageFilters", () => {
  it("보정 없음 → 빈 filters + 빈 attrs", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters({}, konva);
    expect(filters).toEqual([]);
    expect(attrs).toEqual({});
  });

  it("blur만 → [Blur] + { blurRadius }", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters({ blur: 5 }, konva);
    expect(filters).toEqual([konva.Filters.Blur]);
    expect(attrs).toEqual({ blurRadius: 5 });
  });

  it("saturation만 → [HSL] + { saturation, hue:0, luminance:0 }", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters({ saturation: 0.5 }, konva);
    expect(filters).toEqual([konva.Filters.HSL]);
    expect(attrs).toEqual({ saturation: 0.5, hue: 0, luminance: 0 });
  });

  it("hue -90 → attrs.hue === 270 (0..359로 정규화)", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { attrs } = buildImageFilters({ hue: -90 }, konva);
    expect(attrs.hue).toBe(270);
    expect(attrs.saturation).toBe(0);
  });

  it("hue 420 → attrs.hue === 60", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { attrs } = buildImageFilters({ hue: 420 }, konva);
    expect(attrs.hue).toBe(60);
  });

  it("듀오톤은 shadow만 있으면 포함되지 않는다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters({ duotoneShadow: "#101040" }, konva);
    expect(filters).not.toContain(konva.Filters.Duotone);
    expect(attrs.duotoneShadow).toBeUndefined();
  });

  it("듀오톤은 shadow+highlight 둘 다 있으면 포함된다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters(
      { duotoneShadow: "#101040", duotoneHighlight: "#ff8fb3" },
      konva,
    );
    expect(filters).toContain(konva.Filters.Duotone);
    expect(attrs.duotoneShadow).toBe("#101040");
    expect(attrs.duotoneHighlight).toBe("#ff8fb3");
  });

  it("pixelate → pixelSize는 max(1, round)", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    expect(buildImageFilters({ pixelate: 3.6 }, konva).attrs.pixelSize).toBe(4);
    expect(buildImageFilters({ pixelate: 0.2 }, konva).attrs.pixelSize).toBe(1);
  });

  it("풀 콤보 — 멤버십과 순서(색조정 → 스타일라이즈)가 올바르다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const el: ImageFilterFields = {
      brightness: 0.2,
      contrast: 10,
      saturation: 0.3,
      hue: 30,
      temperature: 20,
      sharpen: 0.5,
      grayscale: true,
      sepia: true,
      invert: true,
      inkThreshold: 0.5,
      duotoneShadow: "#101040",
      duotoneHighlight: "#ff8fb3",
      screentone: true,
      lineart: true,
      chromatic: 4,
      posterize: 4,
      noise: 20,
      pixelate: 8,
      blur: 2,
    };
    const { filters } = buildImageFilters(el, konva);
    const F = konva.Filters;

    // 활성 보정 전부 포함.
    const expectedMembers = [
      F.Brighten,
      F.Contrast,
      F.Blur,
      F.HSL,
      F.Temperature,
      F.Sharpen,
      F.Grayscale,
      F.Sepia,
      F.Invert,
      F.InkThreshold,
      F.Duotone,
      F.Screentone,
      F.Lineart,
      F.Chromatic,
      F.Posterize,
      F.Noise,
      F.Pixelate,
    ];
    for (const fn of expectedMembers) {
      expect(filters).toContain(fn);
    }

    // 모든 색/톤 보정이 모든 스타일라이즈보다 앞.
    const colorTone = [F.Brighten, F.Contrast, F.Blur, F.HSL, F.Temperature, F.Sharpen, F.Grayscale, F.Sepia, F.Invert];
    const stylize = [F.InkThreshold, F.Duotone, F.Screentone, F.Lineart, F.Chromatic, F.Posterize, F.Noise, F.Pixelate];
    const maxColorIdx = Math.max(...colorTone.map((fn) => filters.indexOf(fn as (i: StudioImageDataLike) => void)));
    const minStyleIdx = Math.min(...stylize.map((fn) => filters.indexOf(fn as (i: StudioImageDataLike) => void)));
    expect(maxColorIdx).toBeLessThan(minStyleIdx);
  });

  it("0 값 숫자 필드는 비활성으로 취급한다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters({ blur: 0, brightness: 0, chromatic: 0 }, konva);
    expect(filters).toEqual([]);
    expect(attrs).toEqual({});
  });
});

describe("hasActiveImageFilters", () => {
  it("활성 보정이 있으면 true", () => {
    expect(hasActiveImageFilters({ blur: 3 })).toBe(true);
    expect(hasActiveImageFilters({ grayscale: true })).toBe(true);
    expect(hasActiveImageFilters({ hue: -90 })).toBe(true);
    expect(hasActiveImageFilters({ duotoneShadow: "#000", duotoneHighlight: "#fff" })).toBe(true);
  });

  it("보정 없음 또는 0/false면 false", () => {
    expect(hasActiveImageFilters({})).toBe(false);
    expect(hasActiveImageFilters({ blur: 0, brightness: 0, chromatic: 0, noise: 0 })).toBe(false);
    expect(hasActiveImageFilters({ grayscale: false, sepia: false, invert: false })).toBe(false);
    // 듀오톤은 한쪽만 있으면 비활성.
    expect(hasActiveImageFilters({ duotoneShadow: "#000" })).toBe(false);
  });
});

describe("imageFilterCacheKey", () => {
  it("같은 입력은 안정적이고, 필드가 바뀌면 키도 바뀐다", () => {
    const base: ImageFilterFields = { blur: 2, brightness: 0.1 };
    expect(imageFilterCacheKey(base)).toBe(imageFilterCacheKey({ blur: 2, brightness: 0.1 }));
    expect(imageFilterCacheKey(base)).not.toBe(imageFilterCacheKey({ blur: 3, brightness: 0.1 }));
    expect(imageFilterCacheKey(base)).not.toBe(imageFilterCacheKey({ blur: 2, brightness: 0.1, grayscale: true }));
  });

  it("빈 객체와 명시적 undefined는 동일한 키", () => {
    expect(imageFilterCacheKey({})).toBe(imageFilterCacheKey({ blur: undefined, hue: undefined }));
  });
});
