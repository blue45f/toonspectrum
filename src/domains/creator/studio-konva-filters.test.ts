import { describe, expect, it, vi } from "vitest";

import { IMAGE_FILTER_PRESETS, type StudioImageDataLike } from "./studio-filters";
import {
  hasActiveImageFilters as hasLightweightActiveImageFilters,
  imageFilterCacheKey,
} from "./studio-konva-filter-fields";
import {
  applyImageFilters,
  buildImageFilters,
  hasActiveImageFilters,
  registerStudioKonvaFilters,
  type ImageFilterFields,
  type KonvaLike,
} from "./studio-konva-filters";

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
  "InkWash",
  "ExposureAdjustment",
  "UnsharpMask",
  "Morphology",
  "PixelOffset",
  "Convolution",
  "Clouds",
] as const;

describe("registerStudioKonvaFilters", () => {
  it("커스텀 필터를 함수로 등록한다", () => {
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

  it("0/무효 스타일 attrs는 no-op이고 Lineart는 기존 alpha를 보존한다", () => {
    const konva: KonvaLike = { Filters: {} };
    registerStudioKonvaFilters(konva);
    const source = solidImage(4, 4, 64, 128, 192);
    source.data[3] = 37;
    const before = Array.from(source.data);
    const F = konva.Filters as Record<string, (imageData: StudioImageDataLike) => void>;

    F.Chromatic!.call({ attrs: { chromatic: 0 } }, source);
    F.Posterize!.call({ attrs: { posterize: 0 } }, source);
    F.Noise!.call({ attrs: { noise: Number.NaN } }, source);
    expect(Array.from(source.data)).toEqual(before);

    F.Lineart!.call({ attrs: {} }, source);
    expect(source.data[3]).toBe(37);
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

  it("NaN/Infinity/음수 강도는 비활성이고 유한한 거대값은 UI 안전 범위로 제한한다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const malformed = {
      blur: Number.NaN,
      brightness: Number.POSITIVE_INFINITY,
      chromatic: -5,
      posterize: -1,
      noise: Number.NEGATIVE_INFINITY,
      duotoneShadow: "invalid",
      duotoneHighlight: "#fff",
    } as ImageFilterFields;
    expect(hasActiveImageFilters(malformed)).toBe(false);
    expect(buildImageFilters(malformed, konva)).toMatchObject({ filters: [], attrs: {} });

    expect(buildImageFilters({ blur: 1e12 }, konva).attrs.blurRadius).toBe(30);
    expect(buildImageFilters({ brightness: -1e12 }, konva).attrs.brightness).toBe(-0.8);
    expect(buildImageFilters({ contrast: 1e12 }, konva).attrs.contrast).toBe(80);
    expect(buildImageFilters({ posterize: 1 }, konva).attrs.posterize).toBe(2);
    expect(buildImageFilters({ pixelate: 1e12 }, konva).attrs.pixelSize).toBe(40);
  });

  it("수묵 재질은 활성값만 필터와 전용 attrs로 직렬화한다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters(
      {
        inkWash: {
          strength: 82,
          spread: 4,
          edgeBleed: 55,
          granulation: 36,
          paper: 64,
          inkColor: "#264c70",
          seed: 112,
        },
      },
      konva,
    );
    expect(filters).toContain(konva.Filters.InkWash);
    expect(attrs).toMatchObject({
      inkWashStrength: 82,
      inkWashSpread: 4,
      inkWashEdgeBleed: 55,
      inkWashGranulation: 36,
      inkWashPaper: 64,
      inkWashColor: "#264c70",
      inkWashSeed: 112,
    });
  });

  it("수묵 재질의 세기 0은 캐시를 켜지 않는 항등값이다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    expect(hasActiveImageFilters({ inkWash: { strength: 0 } as ImageFilterFields["inkWash"] })).toBe(false);
    expect(buildImageFilters({ inkWash: { strength: 0 } as ImageFilterFields["inkWash"] }, konva).filters).toEqual([]);
  });

  it("신규 고급 필터를 정규화한 attrs와 결정적 실행 순서로 빌드한다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const { filters, attrs } = buildImageFilters({
      pixelOffset: { x: 4, y: -2, edge: "wrap" },
      morphology: { mode: "erode", radius: 2 },
      unsharpMask: { amount: 1.2, radius: 3, threshold: 10 },
      convolution: { kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0], divisor: 1, bias: 0 },
      exposureAdjustment: { exposure: 1, gamma: 0.8, offset: 0.05 },
      clouds: { amount: 0.4, scale: 80, seed: 42, mode: "screen" },
    }, konva);
    expect(attrs).toMatchObject({
      pixelOffsetX: 4,
      pixelOffsetY: -2,
      pixelOffsetEdge: "wrap",
      morphMode: "erode",
      morphRadius: 2,
      unsharpAmount: 1.2,
      unsharpRadius: 3,
      unsharpThreshold: 10,
      convKernel: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      convDivisor: 1,
      convBias: 0,
      exposureEv: 1,
      exposureGamma: 0.8,
      exposureOffset: 0.05,
      cloudAmount: 0.4,
      cloudScale: 80,
      cloudSeed: 42,
      cloudMode: "screen",
    });
    expect(attrs).not.toHaveProperty("offsetX");
    expect(attrs).not.toHaveProperty("offsetY");
    expect(filters.indexOf(konva.Filters.PixelOffset as never))
      .toBeLessThan(filters.indexOf(konva.Filters.Morphology as never));
    expect(filters.indexOf(konva.Filters.ExposureAdjustment as never))
      .toBeLessThan(filters.indexOf(konva.Filters.Clouds as never));
  });

  it("신규 항등 객체는 필터 모듈과 캐시를 활성화하지 않는다", () => {
    const konva = fakeKonva();
    registerStudioKonvaFilters(konva);
    const identity: ImageFilterFields = {
      exposureAdjustment: { exposure: 0, gamma: 1, offset: 0 },
      unsharpMask: { amount: 0, radius: 2, threshold: 0 },
      morphology: { mode: "dilate", radius: 0 },
      pixelOffset: { x: 0, y: 0, edge: "wrap" },
      convolution: { kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0], divisor: 1, bias: 0 },
      clouds: { amount: 0, scale: 96, seed: 42, mode: "overlay" },
    };
    expect(hasActiveImageFilters(identity)).toBe(false);
    expect(hasLightweightActiveImageFilters(identity)).toBe(false);
    expect(buildImageFilters(identity, konva).filters).toEqual([]);
  });

  it("runs smart-filter entries in stored order and retains duplicate engines with private attrs", () => {
    const konva: KonvaLike = { Filters: {} };
    registerStudioKonvaFilters(konva);
    const program = (
      smartFilters: NonNullable<ImageFilterFields["smartFilters"]>,
    ): ImageFilterFields => ({ smartFilters });
    const brightnessThenInvert: ImageFilterFields = program({
      version: 1,
      entries: [
        { id: "bright-a", engine: "brightness-contrast", enabled: true, params: { brightness: 0.1 } },
        { id: "bright-b", engine: "brightness-contrast", enabled: true, params: { brightness: 0.1 } },
        { id: "invert", engine: "invert", enabled: true, params: {} },
      ],
    });
    const invertThenBrightness: ImageFilterFields = program({
      version: 1,
      entries: [
        { id: "invert", engine: "invert", enabled: true, params: {} },
        { id: "bright-a", engine: "brightness-contrast", enabled: true, params: { brightness: 0.1 } },
        { id: "bright-b", engine: "brightness-contrast", enabled: true, params: { brightness: 0.1 } },
      ],
    });
    const first = solidImage(1, 1, 60, 60, 60);
    const second = solidImage(1, 1, 60, 60, 60);
    const firstBuild = buildImageFilters(brightnessThenInvert, konva);
    const secondBuild = buildImageFilters(invertThenBrightness, konva);

    expect(firstBuild.filters).toHaveLength(3);
    expect(firstBuild.attrs).toEqual({});
    applyImageFilters(first, firstBuild.filters, firstBuild.attrs);
    applyImageFilters(second, secondBuild.filters, secondBuild.attrs);

    expect(first.data[0]).toBe(143);
    expect(second.data[0]).toBe(246);
  });

  it("uses a stable scalar-noise seed without consulting Math.random", () => {
    const konva: KonvaLike = { Filters: {} };
    registerStudioKonvaFilters(konva);
    const first = solidImage(8, 1, 128, 128, 128);
    const second = solidImage(8, 1, 128, 128, 128);
    const different = solidImage(8, 1, 128, 128, 128);
    const random = vi.spyOn(Math, "random");
    try {
      const seeded = buildImageFilters({ noise: 30, noiseSeed: 42 }, konva);
      applyImageFilters(first, seeded.filters, seeded.attrs);
      applyImageFilters(second, seeded.filters, seeded.attrs);
      const otherSeed = buildImageFilters({ noise: 30, noiseSeed: 43 }, konva);
      applyImageFilters(different, otherSeed.filters, otherSeed.attrs);

      expect(Array.from(first.data)).toEqual(Array.from(second.data));
      expect(Array.from(first.data)).not.toEqual(Array.from(different.data));
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

describe("IMAGE_FILTER_PRESETS pixel integration", () => {
  it("원본 외 모든 프리셋이 실제 RGB를 바꾸고 일정 alpha를 보존한다", () => {
    const konva: KonvaLike = { Filters: {} };
    registerStudioKonvaFilters(konva);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.75);
    try {
      for (const preset of IMAGE_FILTER_PRESETS) {
        const img = solidImage(7, 7, 0, 0, 0);
        for (let i = 0; i < img.data.length; i += 4) {
          const pixel = i / 4;
          img.data[i] = (pixel * 37 + 19) % 256;
          img.data[i + 1] = (pixel * 71 + 53) % 256;
          img.data[i + 2] = (pixel * 109 + 97) % 256;
          img.data[i + 3] = 173;
        }
        const beforeRgb = Array.from(img.data).filter((_, index) => index % 4 !== 3);
        const { filters, attrs } = buildImageFilters(preset.patch, konva);
        applyImageFilters(img, filters, attrs);
        const afterRgb = Array.from(img.data).filter((_, index) => index % 4 !== 3);

        if (preset.id === "original") expect(afterRgb, preset.id).toEqual(beforeRgb);
        else expect(afterRgb, preset.id).not.toEqual(beforeRgb);
        expect(Array.from(img.data).filter((_, index) => index % 4 === 3), preset.id)
          .toEqual(Array.from({ length: 49 }, () => 173));
      }
    } finally {
      random.mockRestore();
    }
  });
});

describe("hasActiveImageFilters", () => {
  it("활성 보정이 있으면 true", () => {
    expect(hasActiveImageFilters({ blur: 3 })).toBe(true);
    expect(hasActiveImageFilters({ grayscale: true })).toBe(true);
    expect(hasActiveImageFilters({ hue: -90 })).toBe(true);
    expect(hasActiveImageFilters({ duotoneShadow: "#000", duotoneHighlight: "#fff" })).toBe(true);
    expect(hasActiveImageFilters({
      smartFilters: {
        version: 1,
        entries: [{ id: "invert", engine: "invert", enabled: true, params: {} }],
      },
    })).toBe(true);
  });

  it("보정 없음 또는 0/false면 false", () => {
    expect(hasActiveImageFilters({})).toBe(false);
    expect(hasActiveImageFilters({ blur: 0, brightness: 0, chromatic: 0, noise: 0 })).toBe(false);
    expect(hasActiveImageFilters({ grayscale: false, sepia: false, invert: false })).toBe(false);
    // 듀오톤은 한쪽만 있으면 비활성.
    expect(hasActiveImageFilters({ duotoneShadow: "#000" })).toBe(false);
  });

  it("가벼운 초기 청크 판정도 strength 0 수묵 객체로 필터 모듈을 불러오지 않는다", () => {
    const none = { strength: 0, spread: 3, edgeBleed: 48, granulation: 38, paper: 46, inkColor: "#20282c", seed: 41 };
    expect(hasLightweightActiveImageFilters({ inkWash: none })).toBe(false);
    expect(hasLightweightActiveImageFilters({ inkWash: { ...none, strength: 1 } })).toBe(true);
    expect(hasLightweightActiveImageFilters({ inkWash: {} as ImageFilterFields["inkWash"] })).toBe(false);
  });

  it("가벼운 초기 청크 판정은 비유한·음수 강도로 필터 엔진을 불필요하게 불러오지 않는다", () => {
    expect(hasLightweightActiveImageFilters({
      blur: Number.NaN,
      brightness: Number.POSITIVE_INFINITY,
      contrast: Number.NEGATIVE_INFINITY,
      chromatic: -3,
      posterize: -1,
      noise: -20,
      pixelate: -4,
      sharpen: -0.5,
      inkThreshold: -1,
      levelsGamma: Number.NaN,
    })).toBe(false);
    expect(hasLightweightActiveImageFilters({ hue: -90 })).toBe(true);
    expect(hasLightweightActiveImageFilters({ brightness: -0.25 })).toBe(true);
  });
});

describe("imageFilterCacheKey", () => {
  it("같은 입력은 안정적이고, 필드가 바뀌면 키도 바뀐다", () => {
    const base: ImageFilterFields = { blur: 2, brightness: 0.1 };
    expect(imageFilterCacheKey(base)).toBe(imageFilterCacheKey({ blur: 2, brightness: 0.1 }));
    expect(imageFilterCacheKey(base)).not.toBe(imageFilterCacheKey({ blur: 3, brightness: 0.1 }));
    expect(imageFilterCacheKey(base)).not.toBe(imageFilterCacheKey({ blur: 2, brightness: 0.1, grayscale: true }));
    expect(imageFilterCacheKey(base)).not.toBe(imageFilterCacheKey({
      ...base,
      exposureAdjustment: { exposure: 1, gamma: 1, offset: 0 },
    }));
    const firstOrder: ImageFilterFields = {
      smartFilters: {
        version: 1,
        entries: [
          { id: "a", engine: "invert", enabled: true, params: {} },
          { id: "b", engine: "blur", enabled: true, params: { radius: 2 } },
        ],
      },
    };
    const secondOrder: ImageFilterFields = {
      smartFilters: {
        version: 1,
        entries: [...firstOrder.smartFilters!.entries].reverse(),
      },
    };
    expect(imageFilterCacheKey(firstOrder)).not.toBe(imageFilterCacheKey(secondOrder));
  });

  it("빈 객체와 명시적 undefined는 동일한 키", () => {
    expect(imageFilterCacheKey({})).toBe(imageFilterCacheKey({ blur: undefined, hue: undefined }));
  });
});
