import { describe, expect, it } from "vitest";

import { applyColorBalance } from "./studio-color-balance";
import { buildCurveChannelLuts, normalizeCurve } from "./studio-curves";
import {
  STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS,
  STUDIO_GPU_BRIGHTNESS_CONTRAST_UNIFORM_BYTES,
  STUDIO_GPU_COLOR_BALANCE_OFFSETS,
  STUDIO_GPU_COLOR_BALANCE_UNIFORM_BYTES,
  STUDIO_GPU_FILTER_BINDINGS,
  STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS,
  STUDIO_GPU_FILTER_KERNELS,
  STUDIO_GPU_FILTER_PIXEL_COUNT_OFFSET,
  STUDIO_GPU_FILTER_WORKGROUP_SIZE,
  STUDIO_GPU_HSL_OFFSETS,
  STUDIO_GPU_HSL_UNIFORM_BYTES,
  STUDIO_GPU_LUT3_ENTRY_COUNT,
  STUDIO_GPU_LUT3_UNIFORM_BYTES,
  packStudioGpuBrightnessContrastParams,
  packStudioGpuColorBalanceParams,
  packStudioGpuCurvesLut,
  packStudioGpuHslParams,
  packStudioGpuLevelsLut,
  packStudioGpuLut3Uniform,
  patchStudioGpuFilterPixelCount,
} from "./studio-gpu-filter-kernels";
import { applyImageFilters, buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "./studio-konva-filters";
import { buildChannelLevelsLuts } from "./studio-levels";

import type { StudioGpuFilterKernelId } from "./studio-gpu-filter-kernels";
import type { ImageFilterFields } from "./studio-konva-filter-fields";

const registry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(registry);

const KERNEL_IDS = Object.keys(STUDIO_GPU_FILTER_KERNELS) as StudioGpuFilterKernelId[];

function patternedImageData(width = 16, height = 12) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = (x * 41 + y * 13) % 256;
      data[index + 1] = (x * 19 + y * 59) % 256;
      data[index + 2] = (x * 73 + y * 7) % 256;
      data[index + 3] = (x + y) % 3 === 0 ? 255 : 100 + ((x * 5 + y) % 100);
    }
  }
  return { data, width, height };
}

function cpuFiltered(el: ImageFilterFields, img = patternedImageData()) {
  const clone = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  const { filters, attrs } = buildImageFilters(el, registry);
  applyImageFilters(clone, filters, attrs);
  return clone;
}

// WGSL round()·Uint8ClampedArray 대입과 동일한 round-half-to-even.
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function quantizeByte(value: number): number {
  return Math.min(255, Math.max(0, roundHalfEven(value)));
}

function maxChannelDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    max = Math.max(max, Math.abs(a[i]! - b[i]!));
  }
  return max;
}

describe("studio-gpu-filter-kernels: WGSL 구조", () => {
  it("모든 커널이 main 엔트리·workgroup_size·공용 바인딩 인덱스를 선언한다", () => {
    for (const id of KERNEL_IDS) {
      const kernel = STUDIO_GPU_FILTER_KERNELS[id];
      expect(kernel.id).toBe(id);
      expect(kernel.entryPoint).toBe("main");
      expect(kernel.wgsl).toContain(`@compute @workgroup_size(${STUDIO_GPU_FILTER_WORKGROUP_SIZE})`);
      expect(kernel.wgsl).toContain("fn main(");
      expect(kernel.wgsl).toContain(
        `@group(0) @binding(${STUDIO_GPU_FILTER_BINDINGS.src}) var<storage, read> src : array<u32>;`,
      );
      expect(kernel.wgsl).toContain(
        `@group(0) @binding(${STUDIO_GPU_FILTER_BINDINGS.dst}) var<storage, read_write> dst : array<u32>;`,
      );
      expect(kernel.wgsl).toContain(
        `@group(0) @binding(${STUDIO_GPU_FILTER_BINDINGS.params}) var<uniform> params : Params;`,
      );
      expect(kernel.wgsl).toContain("pixel_count : u32");
      // 2D 디스패치 선형화 — apply 의 dispatch 그리드와 같은 상수를 써야 한다.
      expect(kernel.wgsl).toContain(
        `gid.y * ${STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS}u + gid.x`,
      );
      expect(kernel.wgsl).toContain("if (i >= params.pixel_count) { return; }");
      // 중괄호 균형 — 잘린/오염된 소스 문자열을 조기에 잡는다.
      const opens = kernel.wgsl.split("{").length - 1;
      const closes = kernel.wgsl.split("}").length - 1;
      expect(opens).toBe(closes);
    }
  });

  it("LUT 커널만 binding(3) lut 스토리지를 선언한다", () => {
    for (const id of KERNEL_IDS) {
      const kernel = STUDIO_GPU_FILTER_KERNELS[id];
      const lutBinding = `@group(0) @binding(${STUDIO_GPU_FILTER_BINDINGS.lut}) var<storage, read> lut : array<u32>;`;
      if (kernel.usesLut) {
        expect(kernel.wgsl).toContain(lutBinding);
      } else {
        expect(kernel.wgsl).not.toContain(`@binding(${STUDIO_GPU_FILTER_BINDINGS.lut})`);
      }
    }
    expect(STUDIO_GPU_FILTER_KERNELS.levels.usesLut).toBe(true);
    expect(STUDIO_GPU_FILTER_KERNELS.curves.usesLut).toBe(true);
    expect(STUDIO_GPU_FILTER_KERNELS["brightness-contrast"].usesLut).toBe(false);
    expect(STUDIO_GPU_FILTER_KERNELS.hsl.usesLut).toBe(false);
    expect(STUDIO_GPU_FILTER_KERNELS["color-balance"].usesLut).toBe(false);
  });

  it("레벨/커브는 lut3 셰이더(파이프라인 캐시 키)를 공유하고 나머지는 고유하다", () => {
    expect(STUDIO_GPU_FILTER_KERNELS.levels.shaderId).toBe(STUDIO_GPU_FILTER_KERNELS.curves.shaderId);
    expect(STUDIO_GPU_FILTER_KERNELS.levels.wgsl).toBe(STUDIO_GPU_FILTER_KERNELS.curves.wgsl);
    const shaderIds = new Set(KERNEL_IDS.map((id) => STUDIO_GPU_FILTER_KERNELS[id].shaderId));
    expect(shaderIds.size).toBe(4);
  });

  it("컬러 밸런스 WGSL 이 CPU 와 동일한 GAIN·휘도 계수를 담는다", () => {
    const wgsl = STUDIO_GPU_FILTER_KERNELS["color-balance"].wgsl;
    expect(wgsl).toContain("1.275"); // studio-color-balance COLOR_BALANCE_GAIN
    expect(wgsl).toContain("0.299 * r + 0.587 * g + 0.114 * b");
  });

  it("디스패치 상수·uniform 크기가 서로 정합한다", () => {
    expect(STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS % STUDIO_GPU_FILTER_WORKGROUP_SIZE).toBe(0);
    expect(STUDIO_GPU_FILTER_KERNELS["brightness-contrast"].uniformByteLength)
      .toBe(STUDIO_GPU_BRIGHTNESS_CONTRAST_UNIFORM_BYTES);
    expect(STUDIO_GPU_FILTER_KERNELS.hsl.uniformByteLength).toBe(STUDIO_GPU_HSL_UNIFORM_BYTES);
    expect(STUDIO_GPU_FILTER_KERNELS.levels.uniformByteLength).toBe(STUDIO_GPU_LUT3_UNIFORM_BYTES);
    expect(STUDIO_GPU_FILTER_KERNELS.curves.uniformByteLength).toBe(STUDIO_GPU_LUT3_UNIFORM_BYTES);
    expect(STUDIO_GPU_FILTER_KERNELS["color-balance"].uniformByteLength)
      .toBe(STUDIO_GPU_COLOR_BALANCE_UNIFORM_BYTES);
  });
});

describe("studio-gpu-filter-kernels: 파라미터 패커", () => {
  it("pixelCount 자리표시자는 0 이고 patch 가 LE u32 로 덮어쓴다", () => {
    const uniforms = [
      packStudioGpuBrightnessContrastParams({ brightness: 0.3 }),
      packStudioGpuHslParams({ saturation: 0.5 }),
      packStudioGpuLut3Uniform(),
      packStudioGpuColorBalanceParams({ shadows: [10, 0, 0] }),
    ];
    for (const uniform of uniforms) {
      const view = new DataView(uniform);
      expect(view.getUint32(STUDIO_GPU_FILTER_PIXEL_COUNT_OFFSET, true)).toBe(0);
      patchStudioGpuFilterPixelCount(uniform, 12_345);
      expect(view.getUint32(STUDIO_GPU_FILTER_PIXEL_COUNT_OFFSET, true)).toBe(12_345);
    }
  });

  it("밝기/대비 — buildImageFilters 의 클램프와 Konva 수식(f64→f32)을 그대로 담는다", () => {
    const view = new DataView(packStudioGpuBrightnessContrastParams({ brightness: 0.3, contrast: 40 }));
    expect(view.getUint32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.applyBrightness, true)).toBe(1);
    expect(view.getUint32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.applyContrast, true)).toBe(1);
    // 타이 가드가 미세 조정할 수 있으므로 오프셋은 근사(±2^-12)로, 수식 파라미터는 정확히 검증.
    expect(view.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.brightnessOffset, true))
      .toBeCloseTo(0.3 * 255, 3);
    expect(view.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.contrastAdjust, true))
      .toBe(Math.fround(Math.pow((40 + 100) / 100, 2)));

    // 범위 밖 값은 buildImageFilters 와 동일하게 -0.8..0.8 / -80..80 으로 클램프.
    const clamped = new DataView(packStudioGpuBrightnessContrastParams({ brightness: 5, contrast: -200 }));
    expect(clamped.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.brightnessOffset, true))
      .toBeCloseTo(0.8 * 255, 3);
    expect(clamped.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.contrastAdjust, true))
      .toBe(Math.fround(Math.pow((-80 + 100) / 100, 2)));

    // 비활성(0/NaN/누락) 스테이지는 CPU 체인에서 해당 필터가 빠진 것과 동일하게 플래그 0.
    const contrastOnly = new DataView(packStudioGpuBrightnessContrastParams({ brightness: Number.NaN, contrast: 30 }));
    expect(contrastOnly.getUint32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.applyBrightness, true)).toBe(0);
    expect(contrastOnly.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.brightnessOffset, true)).toBe(0);
    expect(contrastOnly.getUint32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.applyContrast, true)).toBe(1);
  });

  it("밝기 오프셋 타이 가드 — 전 브라이트니스 스윕에서 f32 덧셈이 CPU 와 비트 동일", () => {
    // 0.1*255=25.4999… 같은 값이 f32 에서 정확히 x.5 로 올라가면 모든 픽셀이 half-even
    // 타이에 걸려 CPU 와 전면 ±1 발산한다 — 가드된 오프셋은 -0.8..0.8 전 구간(0.01 간격)
    // × 전 바이트에서 CPU Uint8ClampedArray 결과와 정확히 일치해야 한다.
    for (let step = -80; step <= 80; step += 1) {
      if (step === 0) continue;
      const brightness = step / 100;
      const exact = brightness * 255;
      const view = new DataView(packStudioGpuBrightnessContrastParams({ brightness }));
      const packed = view.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.brightnessOffset, true);
      const cpu = new Uint8ClampedArray(1);
      for (let value = 0; value < 256; value += 1) {
        cpu[0] = value + exact; // CPU nativeBrighten + Uint8ClampedArray 대입 semantics.
        const gpuSum = Math.fround(value + packed); // WGSL f32 add.
        expect(quantizeByte(gpuSum), `brightness=${brightness} v=${value}`).toBe(cpu[0]);
      }
    }
  });

  it("HSL — nativeHSL 행렬 계수를 f64 로 계산해 행 vec4(w=luminance)로 싣는다", () => {
    const saturation = 0.5;
    const hue = -30; // buildImageFilters 는 0..359 로 래핑한다 → 330.
    const view = new DataView(packStudioGpuHslParams({ saturation, hue }));

    const s = Math.pow(2, saturation);
    const h = Math.abs((((hue % 360) + 360) % 360) + 360) % 360;
    const vsu = s * Math.cos((h * Math.PI) / 180);
    const vsw = s * Math.sin((h * Math.PI) / 180);
    const expected = {
      rowR: [0.299 + 0.701 * vsu + 0.167 * vsw, 0.587 - 0.587 * vsu + 0.33 * vsw, 0.114 - 0.114 * vsu - 0.497 * vsw],
      rowG: [0.299 - 0.299 * vsu - 0.328 * vsw, 0.587 + 0.413 * vsu + 0.035 * vsw, 0.114 - 0.114 * vsu + 0.293 * vsw],
      rowB: [0.299 - 0.3 * vsu + 1.25 * vsw, 0.587 - 0.586 * vsu - 1.05 * vsw, 0.114 + 0.886 * vsu - 0.2 * vsw],
    } as const;
    for (const [row, offset] of [
      ["rowR", STUDIO_GPU_HSL_OFFSETS.rowR],
      ["rowG", STUDIO_GPU_HSL_OFFSETS.rowG],
      ["rowB", STUDIO_GPU_HSL_OFFSETS.rowB],
    ] as const) {
      for (let column = 0; column < 3; column += 1) {
        expect(view.getFloat32(offset + column * 4, true)).toBe(Math.fround(expected[row][column]!));
      }
      expect(view.getFloat32(offset + 12, true)).toBe(0); // luminance 는 항상 0(buildImageFilters).
    }
  });

  it("레벨 LUT — CPU buildChannelLevelsLuts 바이트와 비트 단위로 동일하다", () => {
    const master = { blackPoint: 20, whitePoint: 235, gamma: 1.3, outBlack: 10, outWhite: 245 };
    const channels = { r: { gamma: 0.8 }, b: { blackPoint: 30 } };
    const packed = packStudioGpuLevelsLut({ master, channels });
    const cpu = buildChannelLevelsLuts(master, channels);
    expect(packed.length).toBe(STUDIO_GPU_LUT3_ENTRY_COUNT);
    for (let i = 0; i < 256; i += 1) {
      expect(packed[i]).toBe(cpu.r[i]);
      expect(packed[256 + i]).toBe(cpu.g[i]);
      expect(packed[512 + i]).toBe(cpu.b[i]);
    }
  });

  it("커브 LUT — CPU buildCurveChannelLuts 바이트와 비트 단위로 동일하다", () => {
    const master = [
      { x: 0, y: 0 },
      { x: 64, y: 48 },
      { x: 192, y: 208 },
      { x: 255, y: 255 },
    ];
    const channels = { r: [{ x: 0, y: 20 }, { x: 255, y: 235 }] };
    const packed = packStudioGpuCurvesLut({ master, channels });
    const cpu = buildCurveChannelLuts(normalizeCurve(master), channels);
    expect(packed.length).toBe(STUDIO_GPU_LUT3_ENTRY_COUNT);
    for (let i = 0; i < 256; i += 1) {
      expect(packed[i]).toBe(cpu.r[i]);
      expect(packed[256 + i]).toBe(cpu.g[i]);
      expect(packed[512 + i]).toBe(cpu.b[i]);
    }
  });

  it("컬러 밸런스 — normalize(클램프 -100..100) 후 세 영역을 vec4 로 싣는다", () => {
    const view = new DataView(packStudioGpuColorBalanceParams({
      shadows: [15, -300, 5],
      highlights: [999, 10, -20],
    }));
    const zones = [
      [STUDIO_GPU_COLOR_BALANCE_OFFSETS.shadows, [15, -100, 5]],
      [STUDIO_GPU_COLOR_BALANCE_OFFSETS.midtones, [0, 0, 0]],
      [STUDIO_GPU_COLOR_BALANCE_OFFSETS.highlights, [100, 10, -20]],
    ] as const;
    for (const [offset, expected] of zones) {
      for (let channel = 0; channel < 3; channel += 1) {
        expect(view.getFloat32(offset + channel * 4, true)).toBe(Math.fround(expected[channel]!));
      }
      expect(view.getFloat32(offset + 12, true)).toBe(0);
    }
  });
});

describe("studio-gpu-filter-kernels: WGSL 수식 에뮬레이션 vs CPU 필터", () => {
  it("밝기→대비 — 스테이지 사이 양자화를 포함해 CPU 체인과 ±1 이내", () => {
    const el: ImageFilterFields = { brightness: -0.2, contrast: 45 };
    const img = patternedImageData();
    const cpu = cpuFiltered(el, img);

    const view = new DataView(packStudioGpuBrightnessContrastParams(el));
    const offset = view.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.brightnessOffset, true);
    const adjust = view.getFloat32(STUDIO_GPU_BRIGHTNESS_CONTRAST_OFFSETS.contrastAdjust, true);
    const emulated = new Uint8ClampedArray(img.data);
    for (let i = 0; i < emulated.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value: number = emulated[i + channel]!;
        value = quantizeByte(value + offset); // WGSL 스테이지 경계 양자화.
        value = Math.min(255, Math.max(0, ((value / 255 - 0.5) * adjust + 0.5) * 255));
        emulated[i + channel] = quantizeByte(value);
      }
    }
    expect(maxChannelDelta(cpu.data, emulated)).toBeLessThanOrEqual(1);
    // 알파는 절대 변하지 않는다.
    for (let i = 3; i < emulated.length; i += 4) {
      expect(emulated[i]).toBe(img.data[i]);
    }
  });

  it("HSL — 행렬 dot + 양자화가 CPU nativeHSL 과 ±1 이내", () => {
    const el: ImageFilterFields = { saturation: 0.5, hue: 130 };
    const img = patternedImageData();
    const cpu = cpuFiltered(el, img);

    const view = new DataView(packStudioGpuHslParams(el));
    const row = (base: number) => [
      view.getFloat32(base, true),
      view.getFloat32(base + 4, true),
      view.getFloat32(base + 8, true),
      view.getFloat32(base + 12, true),
    ] as const;
    const rowR = row(STUDIO_GPU_HSL_OFFSETS.rowR);
    const rowG = row(STUDIO_GPU_HSL_OFFSETS.rowG);
    const rowB = row(STUDIO_GPU_HSL_OFFSETS.rowB);
    const emulated = new Uint8ClampedArray(img.data);
    for (let i = 0; i < emulated.length; i += 4) {
      const r = emulated[i]!;
      const g = emulated[i + 1]!;
      const b = emulated[i + 2]!;
      emulated[i] = quantizeByte(rowR[0] * r + rowR[1] * g + rowR[2] * b + rowR[3]);
      emulated[i + 1] = quantizeByte(rowG[0] * r + rowG[1] * g + rowG[2] * b + rowG[3]);
      emulated[i + 2] = quantizeByte(rowB[0] * r + rowB[1] * g + rowB[2] * b + rowB[3]);
    }
    expect(maxChannelDelta(cpu.data, emulated)).toBeLessThanOrEqual(1);
  });

  it("컬러 밸런스 — 톤 가중 쉬프트 + 양자화가 CPU applyColorBalance 와 ±1 이내", () => {
    const cb = { shadows: [20, 0, -10], midtones: [0, 15, 0], highlights: [-25, 0, 30] } as const;
    const img = patternedImageData();
    const cpu = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
    applyColorBalance(cpu, {
      shadows: [...cb.shadows],
      midtones: [...cb.midtones],
      highlights: [...cb.highlights],
    });

    const view = new DataView(packStudioGpuColorBalanceParams({
      shadows: [...cb.shadows],
      midtones: [...cb.midtones],
      highlights: [...cb.highlights],
    }));
    const zone = (base: number) => [
      view.getFloat32(base, true),
      view.getFloat32(base + 4, true),
      view.getFloat32(base + 8, true),
    ] as const;
    const shadows = zone(STUDIO_GPU_COLOR_BALANCE_OFFSETS.shadows);
    const midtones = zone(STUDIO_GPU_COLOR_BALANCE_OFFSETS.midtones);
    const highlights = zone(STUDIO_GPU_COLOR_BALANCE_OFFSETS.highlights);
    const emulated = new Uint8ClampedArray(img.data);
    for (let i = 0; i < emulated.length; i += 4) {
      const r = emulated[i]!;
      const g = emulated[i + 1]!;
      const b = emulated[i + 2]!;
      const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const sw = (1 - t) * (1 - t);
      const hw = t * t;
      const mid = 2 * t - 1;
      const mw = Math.max(0, 1 - mid * mid);
      emulated[i] = quantizeByte(r + (sw * shadows[0] + mw * midtones[0] + hw * highlights[0]) * 1.275);
      emulated[i + 1] = quantizeByte(g + (sw * shadows[1] + mw * midtones[1] + hw * highlights[1]) * 1.275);
      emulated[i + 2] = quantizeByte(b + (sw * shadows[2] + mw * midtones[2] + hw * highlights[2]) * 1.275);
    }
    expect(maxChannelDelta(cpu.data, emulated)).toBeLessThanOrEqual(1);
  });

  it("레벨/커브 LUT 조회(data[i]=lut[data[i]])는 CPU 체인과 비트 단위로 동일하다", () => {
    const img = patternedImageData();

    const levelsEl: ImageFilterFields = {
      levelsBlack: 20,
      levelsWhite: 235,
      levelsGamma: 1.3,
      levelsCh: { r: { gamma: 0.8 } },
    };
    const levelsCpu = cpuFiltered(levelsEl, img);
    const levelsLut = packStudioGpuLevelsLut({
      master: { blackPoint: 20, whitePoint: 235, gamma: 1.3 },
      channels: levelsEl.levelsCh,
    });
    const levelsEmulated = new Uint8ClampedArray(img.data);
    for (let i = 0; i < levelsEmulated.length; i += 4) {
      levelsEmulated[i] = levelsLut[levelsEmulated[i]!]!;
      levelsEmulated[i + 1] = levelsLut[256 + levelsEmulated[i + 1]!]!;
      levelsEmulated[i + 2] = levelsLut[512 + levelsEmulated[i + 2]!]!;
    }
    expect(maxChannelDelta(levelsCpu.data, levelsEmulated)).toBe(0);

    const curveEl: ImageFilterFields = {
      curve: [
        { x: 0, y: 0 },
        { x: 64, y: 48 },
        { x: 192, y: 208 },
        { x: 255, y: 255 },
      ],
      curveCh: { g: [{ x: 0, y: 10 }, { x: 255, y: 245 }] },
    };
    const curveCpu = cpuFiltered(curveEl, img);
    const curveLut = packStudioGpuCurvesLut({ master: curveEl.curve, channels: curveEl.curveCh });
    const curveEmulated = new Uint8ClampedArray(img.data);
    for (let i = 0; i < curveEmulated.length; i += 4) {
      curveEmulated[i] = curveLut[curveEmulated[i]!]!;
      curveEmulated[i + 1] = curveLut[256 + curveEmulated[i + 1]!]!;
      curveEmulated[i + 2] = curveLut[512 + curveEmulated[i + 2]!]!;
    }
    expect(maxChannelDelta(curveCpu.data, curveEmulated)).toBe(0);
  });
});
