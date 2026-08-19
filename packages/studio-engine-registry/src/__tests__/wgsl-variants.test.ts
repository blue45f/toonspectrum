import { describe, expect, it } from "vitest";

import {
  STUDIO_GPU_FILTER_BINDINGS,
  STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS,
  STUDIO_GPU_FILTER_WORKGROUP_SIZE,
  packStudioGpuBrightnessContrastLut,
  packStudioGpuColorBalanceParams,
  packStudioGpuHslParams,
} from "../../../../src/domains/creator/render/studio-gpu-filter-kernels";
import { nativeHSL } from "../../../../src/domains/creator/render/studio-konva-native-filters";
import { applyColorBalance } from "../../../../src/domains/creator/studio-color-balance";
import { buildCurveChannelLuts, normalizeCurve } from "../../../../src/domains/creator/studio-curves";
import { buildChannelLevelsLuts } from "../../../../src/domains/creator/studio-levels";
import { EffectCompileError } from "../effect-compiler";
import {
  registerFilterProviderTestFixtures,
  registerFilterProviders,
} from "../filter-providers";
import { EngineCapabilityRegistry } from "../registry";
import {
  UnsupportedWgslOpError,
  WGSL_VARIANT_BINDINGS,
  WGSL_VARIANT_DISPATCH_ROW_THREADS,
  WGSL_VARIANT_WORKGROUP_SIZE,
  WgslVariantComposeError,
  composeWgslVariant,
  enumerateVariantsForGraph,
  evaluateVariantOnPixels,
  identityWgslLut3,
  packWgslVariantLut,
  packWgslVariantUniform,
  patchWgslVariantPixelCount,
  wgslOpFromEffectNode,
} from "../wgsl-variants";

import type { WgslFilterOpSpec } from "../wgsl-variants";
import type { EffectGraphIR, EffectNodeIR } from "@toonspectrum/studio-project-model";

/**
 * WGSL variant compiler contract (V12 lane 5 WESL 재개 조건 1단계).
 *
 * 정합성의 기준은 "앱의 정적 커널/CPU 원본"이다: 이 스위트는 정적 커널 모듈
 * (src/domains/creator/studio-gpu-filter-kernels.ts)과 CPU 원본(nativeHSL,
 * applyColorBalance, 레벨/커브 LUT 빌더)을 **직접 import** 해 대조하므로,
 * 어느 쪽이 바뀌어도 드리프트가 여기서 터진다(재발명 금지 계약).
 */

// 결정적 테스트 픽셀 — LCG(랜덤 시드 고정)로 만든 rgba 바이트.
function deterministicPixels(pixelCount: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  let state = 0x2f6e2b1;
  for (let i = 0; i < data.length; i += 1) {
    state = (Math.imul(state, 48271) + 11) >>> 0;
    data[i] = state & 0xff;
  }
  return data;
}

// 0..255 램프: r 은 램프, g/b 는 파생값, a 는 255·17·0 순환 — 256픽셀 전수.
function rampPixels(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    data[i * 4] = i;
    data[i * 4 + 1] = 255 - i;
    data[i * 4 + 2] = (i * 7) % 256;
    data[i * 4 + 3] = [255, 17, 0][i % 3]!;
  }
  return data;
}

function node(
  id: string,
  op: string,
  inputs: string[],
  params: Record<string, number> = {},
): EffectNodeIR {
  return { id, op, params, inputs, colorSpace: "linear" };
}

function filterRegistry(): EngineCapabilityRegistry {
  const registry = EngineCapabilityRegistry.forTestFixtures();
  registerFilterProviders(registry);
  registerFilterProviderTestFixtures(registry);
  return registry;
}

const FULL_CHAIN: WgslFilterOpSpec[] = [
  { op: "brightness-contrast", brightness: 0.2, contrast: 15 },
  { op: "hsl", hue: 30, saturation: 0.4, luminance: 0.05 },
  { op: "levels", lut: buildChannelLevelsLuts({ blackPoint: 12, whitePoint: 240, gamma: 1.2 }, null) },
  { op: "curves", lut: buildCurveChannelLuts(normalizeCurve([{ x: 0, y: 20 }, { x: 128, y: 140 }, { x: 255, y: 235 }]), null) },
  { op: "color-balance", shadows: [15, 0, -5], midtones: [0, 8, 0], highlights: [20, 8, -10] },
];

describe("composeWgslVariant — 결정성과 variantKey 구조 계약", () => {
  it("같은 ops 는 항상 같은 소스·키·레이아웃을 낳는다", () => {
    const a = composeWgslVariant(FULL_CHAIN);
    const b = composeWgslVariant(FULL_CHAIN.map((spec) => ({ ...spec })));
    expect(a.wgsl).toBe(b.wgsl);
    expect(a.variantKey).toBe(b.variantKey);
    expect(a.uniformByteLength).toBe(b.uniformByteLength);
    expect(a.lutEntryCount).toBe(b.lutEntryCount);
    expect(a.structure).toBe(b.structure);
  });

  it("구조가 같고 값만 다르면 키와 소스가 동일하다(값은 uniform/LUT 로)", () => {
    const a = composeWgslVariant([
      { op: "brightness-contrast", brightness: 0.2, contrast: 15 },
      { op: "hsl", hue: 30 },
    ]);
    const b = composeWgslVariant([
      { op: "brightness-contrast", brightness: -0.6, contrast: -40 },
      { op: "hsl", hue: 210 },
    ]);
    expect(a.variantKey).toBe(b.variantKey);
    expect(a.wgsl).toBe(b.wgsl);
  });

  it("파라미터 구조가 다르면 키가 달라진다", () => {
    const brightnessOnly = composeWgslVariant([
      { op: "brightness-contrast", brightness: 0.2 },
    ]);
    const both = composeWgslVariant([
      { op: "brightness-contrast", brightness: 0.2, contrast: 10 },
    ]);
    expect(brightnessOnly.variantKey).not.toBe(both.variantKey);
  });

  it("연산 순서가 키에 반영되고 소스의 스테이지 순서도 보존된다", () => {
    const hslFirst = composeWgslVariant([
      { op: "hsl", hue: 30 },
      { op: "color-balance", shadows: [10, 0, 0] },
    ]);
    const cbFirst = composeWgslVariant([
      { op: "color-balance", shadows: [10, 0, 0] },
      { op: "hsl", hue: 30 },
    ]);
    expect(hslFirst.variantKey).not.toBe(cbFirst.variantKey);
    const hslIndex = hslFirst.wgsl.indexOf("// stage 0: hsl");
    const cbIndex = hslFirst.wgsl.indexOf("// stage 1: color-balance");
    expect(hslIndex).toBeGreaterThanOrEqual(0);
    expect(cbIndex).toBeGreaterThan(hslIndex);
    expect(cbFirst.wgsl).toContain("// stage 0: color-balance");
    expect(cbFirst.wgsl).toContain("// stage 1: hsl");
  });

  it("levels 와 curves 는 같은 LUT 스테이지라도 키가 구분된다", () => {
    const lut = identityWgslLut3();
    const levels = composeWgslVariant([{ op: "levels", lut }]);
    const curves = composeWgslVariant([{ op: "curves", lut }]);
    expect(levels.variantKey).not.toBe(curves.variantKey);
  });

  it("미지원 op 는 UnsupportedWgslOpError + 지원 목록으로 명시 실패한다", () => {
    const bogus = { op: "gaussian-blur", radius: 4 } as unknown as WgslFilterOpSpec;
    let caught: unknown;
    try {
      composeWgslVariant([bogus]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnsupportedWgslOpError);
    const error = caught as UnsupportedWgslOpError;
    expect(error.op).toBe("gaussian-blur");
    expect(error.supportedOps).toContain("brightness-contrast");
    expect(error.message).toContain("color-balance");
  });

  it("빈 체인·불량 LUT 는 조용히 넘어가지 않고 compose 에러다", () => {
    expect(() => composeWgslVariant([])).toThrow(WgslVariantComposeError);
    const shortLut = { r: new Uint8ClampedArray(255), g: new Uint8ClampedArray(256), b: new Uint8ClampedArray(256) };
    expect(() => composeWgslVariant([{ op: "levels", lut: shortLut }])).toThrow(
      /channel "r" LUT must have exactly 256 entries/,
    );
  });

  it("emits the complete V12 shader manifest with a calculable memory budget", () => {
    const variant = composeWgslVariant(FULL_CHAIN);
    expect(variant.manifest).toMatchObject({
      inputFormats: ["rgba8-packed-u32-storage"],
      outputFormats: ["rgba8-packed-u32-storage"],
      bindGroups: {
        group: 0,
        bindings: WGSL_VARIANT_BINDINGS,
        lutBindingPresent: true,
      },
      workgroupSize: {
        x: WGSL_VARIANT_WORKGROUP_SIZE,
        y: 1,
        z: 1,
        dispatchRowThreads: WGSL_VARIANT_DISPATCH_ROW_THREADS,
      },
      storageWrites: {
        targets: ["dst"],
        policy: "single-bounded-write-per-invocation",
        guard: "global-index < pixel-count",
      },
      bounds: { input: "full-frame", output: "full-frame", haloPx: 0 },
      determinism: {
        class: "deterministic",
        timeIndependent: true,
        stageBoundaryQuantization: "round-half-even-rgba8",
      },
      timeDependency: "none",
      variants: {
        preview: variant.variantKey,
        final: variant.variantKey,
        pixelEquivalent: true,
      },
      licenseProvenance: {
        spdx: "LicenseRef-ToonSpectrum-Proprietary",
        source: "ToonStudio deterministic WGSL variant composer",
        generatedFrom: "EffectGraphIR color-operation subsequence",
      },
    });
    expect(variant.manifest.memoryEstimate).toEqual({
      fixedBytes:
        variant.uniformByteLength +
        variant.lutEntryCount * Uint32Array.BYTES_PER_ELEMENT,
      bytesPerPixel: 8,
      formula: "uniform + lut + src-rgba8 + dst-rgba8",
    });
    expect(Object.isFrozen(variant.manifest)).toBe(true);
  });
});

describe("정적 커널 규약 패리티 — studio-gpu-filter-kernels 와 직접 대조", () => {
  it("워크그룹·디스패치 행·바인딩 인덱스가 정적 커널 상수와 일치한다", () => {
    expect(WGSL_VARIANT_WORKGROUP_SIZE).toBe(STUDIO_GPU_FILTER_WORKGROUP_SIZE);
    expect(WGSL_VARIANT_DISPATCH_ROW_THREADS).toBe(STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS);
    expect(WGSL_VARIANT_BINDINGS).toEqual(STUDIO_GPU_FILTER_BINDINGS);
    const variant = composeWgslVariant(FULL_CHAIN);
    expect(variant.wgsl).toContain(`@workgroup_size(${STUDIO_GPU_FILTER_WORKGROUP_SIZE})`);
    expect(variant.wgsl).toContain(
      `gid.y * ${STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS}u + gid.x`,
    );
  });

  it("바인딩 선언이 정적 커널과 동일하고 lut 바인딩은 LUT 스테이지가 있을 때만 나온다", () => {
    const withLut = composeWgslVariant([{ op: "levels", lut: identityWgslLut3() }]);
    expect(withLut.wgsl).toContain("@group(0) @binding(0) var<storage, read> src : array<u32>;");
    expect(withLut.wgsl).toContain("@group(0) @binding(1) var<storage, read_write> dst : array<u32>;");
    expect(withLut.wgsl).toContain("@group(0) @binding(2) var<uniform> params : Params;");
    expect(withLut.wgsl).toContain("@group(0) @binding(3) var<storage, read> lut : array<u32>;");
    expect(withLut.usesLut).toBe(true);

    const noLut = composeWgslVariant([{ op: "hsl", hue: 45 }]);
    expect(noLut.wgsl).not.toContain("@binding(3)");
    expect(noLut.usesLut).toBe(false);
    expect(noLut.lutEntryCount).toBe(0);
  });

  it("HSL uniform 블록이 정적 커널 패커(packStudioGpuHslParams)와 바이트 동일하다", () => {
    const params = { saturation: 0.4, hue: 210, luminance: 0.05 };
    const variant = composeWgslVariant([{ op: "hsl", ...params }]);
    expect(variant.stages[0]?.uniformOffset).toBe(16);
    const mine = new Uint8Array(packWgslVariantUniform([{ op: "hsl", ...params }]));
    const theirs = new Uint8Array(packStudioGpuHslParams(params));
    // 헤더(픽셀 수 자리표시자) 이후 48바이트 vec4 3행이 동일해야 한다.
    expect([...mine.slice(16, 64)]).toEqual([...theirs.slice(16, 64)]);
  });

  it("컬러 밸런스 uniform 블록이 packStudioGpuColorBalanceParams 와 바이트 동일하다", () => {
    const balance = {
      shadows: [15, 0, -5] as const,
      midtones: [0, 8, 0] as const,
      highlights: [200, 8, -10] as const, // 200 → 100 클램프까지 동일해야 한다.
    };
    const mine = new Uint8Array(
      packWgslVariantUniform([{ op: "color-balance", ...balance }]),
    );
    const theirs = new Uint8Array(
      packStudioGpuColorBalanceParams({
        shadows: [...balance.shadows],
        midtones: [...balance.midtones],
        highlights: [...balance.highlights],
      }),
    );
    expect([...mine.slice(16, 64)]).toEqual([...theirs.slice(16, 64)]);
  });

  it("밝기/대비 LUT 가 packStudioGpuBrightnessContrastLut 와 비트 동일하다", () => {
    const cases = [
      { brightness: 0.2, contrast: 15 },
      { brightness: -0.6 },
      { contrast: -40 },
    ];
    for (const params of cases) {
      const mine = packWgslVariantLut([{ op: "brightness-contrast", ...params }]);
      const theirs = packStudioGpuBrightnessContrastLut(params);
      expect(mine).not.toBeNull();
      expect([...mine!]).toEqual([...theirs]);
    }
  });

  it("pixelCount 패치가 정적 커널 규약(offset 0, u32 LE)을 따른다", () => {
    const uniform = packWgslVariantUniform([{ op: "hsl", hue: 30 }]);
    patchWgslVariantPixelCount(uniform, 4096);
    expect(new DataView(uniform).getUint32(0, true)).toBe(4096);
  });
});

describe("CPU 참조 구현 — 앱 CPU 원본과 픽셀 단위 대조", () => {
  it("hsl 참조가 nativeHSL(konva verbatim)과 비트 동일하다", () => {
    const pixels = deterministicPixels(512);
    const mine = evaluateVariantOnPixels(
      [{ op: "hsl", saturation: 0.4, hue: 210, luminance: 0.05 }],
      pixels,
    );
    const img = { data: new Uint8ClampedArray(pixels), width: 512, height: 1 };
    nativeHSL.call({ attrs: { saturation: 0.4, hue: 210, luminance: 0.05 } }, img);
    expect([...mine]).toEqual([...img.data]);
  });

  it("컬러 밸런스 참조가 applyColorBalance 와 비트 동일하다", () => {
    const pixels = deterministicPixels(512);
    const balance = {
      shadows: [15, 0, -5] as [number, number, number],
      midtones: [0, 8, 0] as [number, number, number],
      highlights: [20, 8, -10] as [number, number, number],
    };
    const mine = evaluateVariantOnPixels([{ op: "color-balance", ...balance }], pixels);
    const img = { data: new Uint8ClampedArray(pixels), width: 512, height: 1 };
    applyColorBalance(img, { ...balance });
    expect([...mine]).toEqual([...img.data]);
  });

  it("밝기+대비 융합 결과가 순차 적용과 256픽셀 램프 전수에서 비트 동일하다", () => {
    const ramp = rampPixels();
    const fused = evaluateVariantOnPixels(
      [{ op: "brightness-contrast", brightness: 0.2, contrast: 15 }],
      ramp,
    );
    const sequential = evaluateVariantOnPixels(
      [{ op: "brightness-contrast", contrast: 15 }],
      evaluateVariantOnPixels([{ op: "brightness-contrast", brightness: 0.2 }], ramp),
    );
    expect([...fused]).toEqual([...sequential]);
    // 융합 LUT 도 같은 사상이어야 GPU 경로가 순차 디스패치와 등가다.
    const lut = packWgslVariantLut([
      { op: "brightness-contrast", brightness: 0.2, contrast: 15 },
    ])!;
    for (let i = 0; i < 256; i += 1) {
      expect(lut[i]).toBe(fused[i * 4]);
    }
  });

  it("다단 융합 체인이 단일 스테이지 순차 적용과 비트 동일하다", () => {
    const pixels = deterministicPixels(1024);
    const fused = evaluateVariantOnPixels(FULL_CHAIN, pixels);
    let sequential: Uint8ClampedArray = new Uint8ClampedArray(pixels);
    for (const spec of FULL_CHAIN) {
      sequential = evaluateVariantOnPixels([spec], sequential);
    }
    expect([...fused]).toEqual([...sequential]);
  });

  it("레벨/커브 스테이지는 앱 LUT 빌더 산출을 그대로 조회하고 알파를 보존한다", () => {
    const pixels = rampPixels();
    const luts = buildChannelLevelsLuts({ blackPoint: 12, whitePoint: 240, gamma: 1.2 }, null);
    const out = evaluateVariantOnPixels([{ op: "levels", lut: luts }], pixels);
    for (let i = 0; i < 256; i += 1) {
      expect(out[i * 4]).toBe(luts.r[pixels[i * 4]!]);
      expect(out[i * 4 + 1]).toBe(luts.g[pixels[i * 4 + 1]!]);
      expect(out[i * 4 + 2]).toBe(luts.b[pixels[i * 4 + 2]!]);
      expect(out[i * 4 + 3]).toBe(pixels[i * 4 + 3]);
    }
  });
});

describe("enumerateVariantsForGraph — effect-compiler 접속", () => {
  it("연속 색보정 체인은 하나의 융합 variant 서브체인이 된다", () => {
    const graph: EffectGraphIR = {
      nodes: [
        node("lv", "core.levels", ["source"]),
        node("hue", "core.hsl", ["lv"], { hue: 30 }),
        node("cv", "core.curve", ["hue"]),
        node("cb", "core.color-balance", ["cv"], { shadowsR: 15 }),
      ],
      output: "cb",
    };
    const result = enumerateVariantsForGraph(graph, filterRegistry());
    expect(result.variants).toHaveLength(1);
    expect(result.subchains).toHaveLength(1);
    expect(result.subchains[0]?.nodeIds).toEqual(["lv", "hue", "cv", "cb"]);
    expect(result.subchains[0]?.providerIds).toEqual(["canvaskit-imagefilter"]);
    expect(result.skippedNodeIds).toEqual([]);
    expect(result.variants[0]?.stages.map((stage) => stage.op)).toEqual([
      "levels",
      "hsl",
      "curves",
      "color-balance",
    ]);
  });

  it("융합 미지원 op 는 run 을 끊고 skippedNodeIds 로 명시된다", () => {
    const graph: EffectGraphIR = {
      nodes: [
        node("lv", "core.levels", ["source"]),
        node("blur", "core.gaussian-blur", ["lv"], { radius: 4 }),
        node("hue", "core.hsl", ["blur"], { hue: 30 }),
      ],
      output: "hue",
    };
    const result = enumerateVariantsForGraph(graph, filterRegistry());
    expect(result.skippedNodeIds).toEqual(["blur"]);
    expect(result.subchains.map((chain) => [...chain.nodeIds])).toEqual([["lv"], ["hue"]]);
    expect(result.variants).toHaveLength(2);
  });

  it("같은 구조의 서브체인은 variantKey 로 dedup 된다", () => {
    const graph: EffectGraphIR = {
      nodes: [
        node("lv1", "core.levels", ["source"]),
        node("blur", "core.gaussian-blur", ["lv1"], { radius: 4 }),
        node("lv2", "core.levels", ["blur"]),
      ],
      output: "lv2",
    };
    const result = enumerateVariantsForGraph(graph, filterRegistry());
    expect(result.subchains).toHaveLength(2);
    expect(result.variants).toHaveLength(1);
    expect(result.subchains[0]?.variantKey).toBe(result.subchains[1]?.variantKey);
  });

  it("프로바이더 그룹 경계는 run 을 끊지 않는다(copy 전이 제거 근거)", () => {
    const registry = EngineCapabilityRegistry.forTestFixtures();
    const base = {
      kind: "filter" as const,
      version: "test",
      license: "MIT",
      attribution: "test",
      maturity: "production-baseline" as const,
      runtime: "wasm" as const,
      limitations: [],
      previewQuality: "production" as const,
      finalQuality: "production" as const,
      determinism: "bit-exact" as const,
      memoryEstimateMb: 1,
      fallbackProviderId: null,
      knownIssues: [],
    };
    registry.registerTestFixture({
      ...base,
      id: "levels-only",
      displayName: "levels only",
      capabilities: ["filter.op.levels", "filter.phase.final"],
    });
    registry.registerTestFixture({
      ...base,
      id: "hsl-only",
      displayName: "hsl only",
      capabilities: ["filter.op.hsl", "filter.phase.final"],
    });
    const graph: EffectGraphIR = {
      nodes: [
        node("lv", "core.levels", ["source"]),
        node("hue", "core.hsl", ["lv"], { hue: 30 }),
      ],
      output: "hue",
    };
    const result = enumerateVariantsForGraph(graph, registry);
    expect(result.subchains).toHaveLength(1);
    expect(result.subchains[0]?.nodeIds).toEqual(["lv", "hue"]);
    expect(result.subchains[0]?.providerIds).toEqual(["levels-only", "hsl-only"]);
    expect(result.variants).toHaveLength(1);
  });

  it("구조 불량 그래프는 EffectCompileError 로 그대로 전파된다", () => {
    const graph: EffectGraphIR = {
      nodes: [
        node("a", "core.levels", ["b"]),
        node("b", "core.levels", ["a"]),
      ],
      output: "a",
    };
    expect(() => enumerateVariantsForGraph(graph, filterRegistry())).toThrow(
      EffectCompileError,
    );
  });

  it("wgslOpFromEffectNode 는 평면 파라미터를 스펙 구조로 올리고 미지원은 null", () => {
    const cb = wgslOpFromEffectNode(
      node("cb", "core.color-balance", ["source"], {
        shadowsR: 15,
        shadowsB: -5,
        highlightsG: 8,
      }),
    );
    expect(cb).toEqual({
      op: "color-balance",
      shadows: [15, 0, -5],
      highlights: [0, 8, 0],
    });
    const bright = wgslOpFromEffectNode(
      node("br", "core.brightness", ["source"], { brightness: 0.3 }),
    );
    expect(bright).toEqual({ op: "brightness-contrast", brightness: 0.3 });
    expect(wgslOpFromEffectNode(node("x", "core.gaussian-blur", ["source"]))).toBeNull();
  });
});
