import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyGpuFilterChain,
  isStudioGpuFilterChainEligible,
  planStudioGpuFilterChain,
} from "./studio-gpu-filter-apply";
import {
  STUDIO_GPU_FILTER_KERNELS,
  packStudioGpuBrightnessContrastLut,
  packStudioGpuCurvesLut,
  packStudioGpuLevelsLut,
} from "./studio-gpu-filter-kernels";
import { disposeStudioGpuFilterRuntime } from "./studio-gpu-filter-runtime";
import { buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "./studio-konva-filters";

import type { StudioGpuFilterKernelId } from "./studio-gpu-filter-kernels";
import type { ImageFilterFields } from "./studio-konva-filter-fields";

const registry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(registry);

// buildImageFilters 가 돌려주는 필터 함수 → GPU 커널 id 매핑(지원 6함수만).
const SUPPORTED_FILTER_FN_TO_KERNEL = new Map<unknown, StudioGpuFilterKernelId>([
  [registry.Filters.Brighten, "brightness-contrast"],
  [registry.Filters.Contrast, "brightness-contrast"],
  [registry.Filters.HSL, "hsl"],
  [registry.Filters.Levels, "levels"],
  [registry.Filters.Curve, "curves"],
  [registry.Filters.ColorBalance, "color-balance"],
]);

/** CPU 체인에서 지원 필터만 추출해 (인접 중복 제거된) 커널 id 순서를 만든다. */
function cpuKernelOrder(el: ImageFilterFields): StudioGpuFilterKernelId[] {
  const { filters } = buildImageFilters(el, registry);
  const ids: StudioGpuFilterKernelId[] = [];
  for (const filter of filters) {
    const id = SUPPORTED_FILTER_FN_TO_KERNEL.get(filter);
    if (!id) continue;
    if (ids[ids.length - 1] !== id) ids.push(id);
  }
  return ids;
}

/**
 * plan 의 LUT 융합을 커널 id 수준에서 재현 — 인접한 LUT 커널 런(run)을 하나로 접는다.
 * 반환: [기대 스텝 id 순서, 스텝별 원본 run(융합 스텝만 길이>1)].
 */
function fusedKernelOrder(
  ids: readonly StudioGpuFilterKernelId[],
): [StudioGpuFilterKernelId[], StudioGpuFilterKernelId[][]] {
  const stepIds: StudioGpuFilterKernelId[] = [];
  const runs: StudioGpuFilterKernelId[][] = [];
  for (const id of ids) {
    const usesLut = STUDIO_GPU_FILTER_KERNELS[id].usesLut;
    const lastRun = runs[runs.length - 1];
    if (usesLut && lastRun && STUDIO_GPU_FILTER_KERNELS[stepIds[stepIds.length - 1]!].usesLut) {
      lastRun.push(id);
      stepIds[stepIds.length - 1] = "lut-fused";
      continue;
    }
    stepIds.push(id);
    runs.push([id]);
  }
  return [stepIds, runs];
}

/** CPU 체인이 지원 필터만으로 구성됐는지(비지원 필터가 끼면 GPU plan 은 null 이어야 한다). */
function cpuChainFullySupported(el: ImageFilterFields): boolean {
  const { filters } = buildImageFilters(el, registry);
  return filters.every((filter) => SUPPORTED_FILTER_FN_TO_KERNEL.has(filter));
}

function imageData(width = 4, height = 3) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 1) data[i] = (i * 37) % 256;
  return { data, width, height };
}

afterEach(() => {
  disposeStudioGpuFilterRuntime();
});

describe("studio-gpu-filter-apply: 체인 계획", () => {
  const FIVE_FIELD_CASES: readonly [string, ImageFilterFields][] = [
    ["밝기만", { brightness: 0.3 }],
    ["대비만", { contrast: -25 }],
    ["밝기+대비", { brightness: -0.2, contrast: 45 }],
    ["색조만", { hue: 130 }],
    ["채도만", { saturation: 0.5 }],
    ["레벨 마스터", { levelsBlack: 20, levelsWhite: 235, levelsGamma: 1.3 }],
    ["레벨 채널만", { levelsCh: { r: { gamma: 0.8 } } }],
    ["커브 마스터", { curve: [{ x: 0, y: 0 }, { x: 128, y: 160 }, { x: 255, y: 255 }] }],
    ["커브 채널만", { curveCh: { b: [{ x: 0, y: 30 }, { x: 255, y: 255 }] } }],
    ["컬러 밸런스", { colorBalance: { shadows: [20, 0, -10], midtones: [0, 0, 0], highlights: [0, 0, 0] } }],
    [
      "5종 전부",
      {
        brightness: 0.1,
        contrast: 20,
        saturation: 0.4,
        hue: -40,
        levelsBlack: 15,
        levelsCh: { g: { whitePoint: 240 } },
        curve: [{ x: 0, y: 0 }, { x: 64, y: 48 }, { x: 255, y: 255 }],
        curveCh: { r: [{ x: 0, y: 10 }, { x: 255, y: 245 }] },
        colorBalance: { shadows: [0, 0, 0], midtones: [0, 12, 0], highlights: [-8, 0, 8] },
      },
    ],
  ];

  it("스텝 순서가 buildImageFilters 의 지원-필드 적용 순서(인접 LUT 융합 포함)와 정확히 일치한다", () => {
    for (const [label, el] of FIVE_FIELD_CASES) {
      // 전제: 이 케이스들의 CPU 체인은 지원 필터만으로 구성된다.
      expect(cpuChainFullySupported(el), label).toBe(true);
      const plan = planStudioGpuFilterChain(el);
      expect(plan, label).not.toBeNull();
      const [expectedIds, expectedRuns] = fusedKernelOrder(cpuKernelOrder(el));
      expect(plan!.map((step) => step.kernelId), label).toEqual(expectedIds);
      for (const [index, step] of plan!.entries()) {
        // LUT 커널 스텝은 항상 768칸 LUT 를 동반한다.
        if (STUDIO_GPU_FILTER_KERNELS[step.kernelId].usesLut) {
          expect(step.lut, label).toBeInstanceOf(Uint32Array);
          expect(step.lut!.length, label).toBe(768);
        } else {
          expect(step.lut, label).toBeUndefined();
        }
        // 융합 스텝만 원본 커널 순서를 보존하는 fusedKernelIds 를 가진다.
        if (step.kernelId === "lut-fused") {
          expect(step.fusedKernelIds, label).toEqual(expectedRuns[index]);
          expect(expectedRuns[index]!.length, label).toBeGreaterThan(1);
        } else {
          expect(step.fusedKernelIds, label).toBeUndefined();
        }
      }
    }
  });

  it("인접 LUT 스텝 융합 — 합성 LUT 가 순차 LUT 조회와 비트 단위로 동일하다", () => {
    // 밝기대비→레벨→커브 전부 LUT: 단일 lut-fused 스텝으로 융합돼야 한다.
    const el: ImageFilterFields = {
      brightness: -0.2,
      contrast: 45,
      levelsBlack: 20,
      levelsWhite: 235,
      levelsGamma: 1.3,
      levelsCh: { r: { gamma: 0.8 } },
      curve: [{ x: 0, y: 0 }, { x: 64, y: 48 }, { x: 255, y: 255 }],
      curveCh: { g: [{ x: 0, y: 10 }, { x: 255, y: 245 }] },
    };
    const plan = planStudioGpuFilterChain(el);
    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(1);
    expect(plan![0]!.kernelId).toBe("lut-fused");
    expect(plan![0]!.fusedKernelIds).toEqual(["brightness-contrast", "levels", "curves"]);

    // 순차 실행 오라클: 개별 스테이지 LUT 를 순서대로 정수 조회.
    const bc = packStudioGpuBrightnessContrastLut({ brightness: el.brightness, contrast: el.contrast });
    const levels = packStudioGpuLevelsLut({
      master: { blackPoint: 20, whitePoint: 235, gamma: 1.3 },
      channels: el.levelsCh,
    });
    const curves = packStudioGpuCurvesLut({ master: el.curve, channels: el.curveCh });
    const fusedLut = plan![0]!.lut!;
    for (let channel = 0; channel < 3; channel += 1) {
      const base = channel * 256;
      for (let i = 0; i < 256; i += 1) {
        const sequential = curves[base + levels[base + bc[base + i]!]!]!;
        expect(fusedLut[base + i], `channel=${channel} v=${i}`).toBe(sequential);
      }
    }
  });

  it("수식 커널(HSL/컬러밸런스)이 사이에 끼면 그 경계 너머로는 융합하지 않는다", () => {
    // 밝기대비 | HSL | 레벨+커브 — 체인 순서 의미 보존을 위해 HSL 양쪽은 분리 유지.
    const acrossHsl = planStudioGpuFilterChain({
      brightness: 0.2,
      hue: 90,
      levelsBlack: 20,
      curve: [{ x: 0, y: 0 }, { x: 128, y: 150 }, { x: 255, y: 255 }],
    });
    expect(acrossHsl).not.toBeNull();
    expect(acrossHsl!.map((step) => step.kernelId)).toEqual(["brightness-contrast", "hsl", "lut-fused"]);
    expect(acrossHsl![2]!.fusedKernelIds).toEqual(["levels", "curves"]);

    // 컬러밸런스는 체인 끝(수식) — LUT 융합 스텝 뒤에 그대로 남는다.
    const withColorBalance = planStudioGpuFilterChain({
      brightness: 0.2,
      levelsBlack: 20,
      colorBalance: { shadows: [10, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] },
    });
    expect(withColorBalance).not.toBeNull();
    expect(withColorBalance!.map((step) => step.kernelId)).toEqual(["lut-fused", "color-balance"]);
    expect(withColorBalance![0]!.fusedKernelIds).toEqual(["brightness-contrast", "levels"]);
  });

  it("활성 보정이 없으면 null — 항등 값(0/항등 곡선/항등 레벨)도 비활성으로 본다", () => {
    expect(planStudioGpuFilterChain({})).toBeNull();
    expect(planStudioGpuFilterChain({ brightness: 0, contrast: 0 })).toBeNull();
    expect(planStudioGpuFilterChain({ levelsBlack: 0, levelsWhite: 255, levelsGamma: 1 })).toBeNull();
    expect(planStudioGpuFilterChain({ curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] })).toBeNull();
    expect(planStudioGpuFilterChain({
      colorBalance: { shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] },
    })).toBeNull();
  });

  it("지원 외 보정이 하나라도 활성이면 전체 CPU 폴백(null) — 부분 GPU 실행 금지", () => {
    expect(planStudioGpuFilterChain({ brightness: 0.2, sepia: true })).toBeNull();
    expect(planStudioGpuFilterChain({ brightness: 0.2, blur: 3 })).toBeNull();
    expect(planStudioGpuFilterChain({ contrast: 20, temperature: 15 })).toBeNull();
    expect(planStudioGpuFilterChain({ hue: 90, grayscale: true })).toBeNull();
    expect(planStudioGpuFilterChain({ curve: [{ x: 0, y: 10 }, { x: 255, y: 255 }], sharpen: 0.5 })).toBeNull();
    expect(planStudioGpuFilterChain({
      colorBalance: { shadows: [10, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] },
      vignetteFx: { darkness: 0.4, size: 0.5, roundness: 0.5, feather: 0.5 },
    })).toBeNull();
    expect(planStudioGpuFilterChain({
      brightness: 0.2,
      smartFilterOperations: [{ id: "a", engine: "invert", enabled: true, params: {} }],
    })).toBeNull();
  });

  it("isStudioGpuFilterChainEligible 은 plan 유무와 일치한다", () => {
    expect(isStudioGpuFilterChainEligible({ brightness: 0.2 })).toBe(true);
    expect(isStudioGpuFilterChainEligible({})).toBe(false);
    expect(isStudioGpuFilterChainEligible({ brightness: 0.2, lineart: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 폴백 경로 — GPU 미지원/실패는 예외 없이 null 로 강등돼야 한다.
// ---------------------------------------------------------------------------

interface FakeGpuHarness {
  readonly gpu: GPU;
  readonly requestAdapter: ReturnType<typeof vi.fn>;
  readonly dispatchCalls: [number, number][];
  popErrorScopeResults: (object | null)[];
}

function createFakeGpu(overrides?: { createBufferThrows?: boolean }): FakeGpuHarness {
  const dispatchCalls: [number, number][] = [];
  const harness: { popErrorScopeResults: (object | null)[] } = { popErrorScopeResults: [null, null] };
  const device = {
    createShaderModule: vi.fn(() => ({})),
    createComputePipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
    createBindGroup: vi.fn(() => ({})),
    createBuffer: vi.fn((descriptor: { size: number }) => {
      if (overrides?.createBufferThrows) throw new Error("out of memory");
      return {
        size: descriptor.size,
        destroy: vi.fn(),
        mapAsync: vi.fn(async () => undefined),
        getMappedRange: vi.fn(() => new ArrayBuffer(descriptor.size)),
        unmap: vi.fn(),
      };
    }),
    createCommandEncoder: vi.fn(() => ({
      beginComputePass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn((x: number, y: number) => {
          dispatchCalls.push([x, y]);
        }),
        end: vi.fn(),
      })),
      copyBufferToBuffer: vi.fn(),
      finish: vi.fn(() => ({})),
    })),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
    destroy: vi.fn(),
    lost: new Promise<GPUDeviceLostInfo>(() => undefined),
    limits: {
      maxStorageBufferBindingSize: 128 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
      maxComputeWorkgroupsPerDimension: 65_535,
    },
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(async () => harness.popErrorScopeResults.shift() ?? null),
  };
  const requestAdapter = vi.fn(async () => ({ requestDevice: async () => device }));
  return {
    gpu: { requestAdapter } as unknown as GPU,
    requestAdapter,
    dispatchCalls,
    get popErrorScopeResults() {
      return harness.popErrorScopeResults;
    },
    set popErrorScopeResults(next: (object | null)[]) {
      harness.popErrorScopeResults = next;
    },
  };
}

describe("studio-gpu-filter-apply: 폴백 경로", () => {
  it("node 환경(WebGPU 없음)에서는 유효한 체인도 null → 호출부 CPU 폴백", async () => {
    expect(await applyGpuFilterChain(imageData(), { brightness: 0.2 })).toBeNull();
  });

  it("지원 외 보정 활성이면 디바이스 획득 시도조차 하지 않는다", async () => {
    const harness = createFakeGpu();
    const result = await applyGpuFilterChain(
      imageData(),
      { brightness: 0.2, sepia: true },
      { gpu: harness.gpu },
    );
    expect(result).toBeNull();
    expect(harness.requestAdapter).not.toHaveBeenCalled();
  });

  it("손상된 imageData(치수·바이트 불일치)는 null", async () => {
    const harness = createFakeGpu();
    const broken = { data: new Uint8ClampedArray(8), width: 4, height: 3 };
    expect(await applyGpuFilterChain(broken, { brightness: 0.2 }, { gpu: harness.gpu })).toBeNull();
    expect(harness.requestAdapter).not.toHaveBeenCalled();
  });

  it("버퍼 생성이 던지면 예외를 삼키고 null", async () => {
    const harness = createFakeGpu({ createBufferThrows: true });
    expect(await applyGpuFilterChain(imageData(), { brightness: 0.2 }, { gpu: harness.gpu })).toBeNull();
  });

  it("검증 오류(error scope)가 잡히면 '무필터 픽셀'을 성공으로 돌려주지 않고 null", async () => {
    const harness = createFakeGpu();
    harness.popErrorScopeResults = [{ message: "validation failed" }, null];
    expect(await applyGpuFilterChain(imageData(), { brightness: 0.2 }, { gpu: harness.gpu })).toBeNull();
  });

  it("정상 경로 — 스텝 수만큼 디스패치하고 치수 보존 버퍼를 돌려준다", async () => {
    const harness = createFakeGpu();
    const img = imageData(5, 4);
    const el: ImageFilterFields = {
      brightness: 0.2,
      colorBalance: { shadows: [10, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0] },
    };
    const plan = planStudioGpuFilterChain(el);
    expect(plan).not.toBeNull();

    const result = await applyGpuFilterChain(img, el, { gpu: harness.gpu });
    expect(result).not.toBeNull();
    expect(result!.width).toBe(5);
    expect(result!.height).toBe(4);
    expect(result!.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result!.data.length).toBe(5 * 4 * 4);
    // 입력 버퍼는 변형하지 않는다(새 버퍼 반환).
    expect(result!.data).not.toBe(img.data);
    expect(harness.dispatchCalls.length).toBe(plan!.length);
    // 2D 디스패치 그리드: x=16384/64=256, y=ceil(20/16384)=1.
    for (const [x, y] of harness.dispatchCalls) {
      expect(x).toBe(256);
      expect(y).toBe(1);
    }
  });
});
