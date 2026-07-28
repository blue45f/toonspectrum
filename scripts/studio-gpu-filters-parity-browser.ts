/**
 * Browser entry for the CPU/GPU image-filter parity harness. Loaded as a bare module script by
 * verify-studio-gpu-filters.mts's synthetic document; never imported by the application itself.
 *
 * For each case a deterministic RGBA test image runs through both:
 *  - the real CPU oracle StudioKonvaImageNode ultimately executes (buildImageFilters +
 *    applyImageFilters on a registerStudioKonvaFilters registry), and
 *  - the WebGPU compute chain (applyGpuFilterChain) in a real Chromium WebGPU context,
 * then the raw byte buffers are diffed per channel. The Node orchestrator gates:
 *  - lutOnly plans (brightness/contrast, levels, curves, and their fused combinations are all
 *    exact CPU-built byte LUTs routed through the integer-lookup lut3 kernel): delta === 0
 *  - integer spatial kernels (morphology and the integral edge convolution case): delta === 0
 *  - formula kernels (HSL, color balance, Gaussian): maxChannelDelta <= 1 (f32 vs f64
 *    rounding-boundary tolerance)
 *  - mixed chains: a +-1 f32 tie seed from a formula kernel can be amplified by downstream
 *    LUT slopes — gate is observed+1
 * and maxAlphaDelta === 0 everywhere (all kernels must preserve alpha exactly).
 *
 * Settles window.__studioGpuFiltersParityResult to a success payload, an "unsupported" marker
 * (headless WebGPU unavailable), or a structured error.
 */
import type { ImageFilterFields } from "@/src/domains/creator/studio-konva-filter-fields";

import { applyGpuFilterChain, planStudioGpuFilterChain } from "@/src/domains/creator/studio-gpu-filter-apply";
import { supportsStudioGpuFilters } from "@/src/domains/creator/studio-gpu-filter-runtime";
import {
  applyImageFilters,
  buildImageFilters,
  registerStudioKonvaFilters,
  type KonvaLike,
} from "@/src/domains/creator/studio-konva-filters";

// Odd dimensions exercise row tails and 2D dispatch indexing rather than only aligned extents.
const WIDTH = 193;
const HEIGHT = 127;

interface FilterParityCaseResult {
  readonly id: string;
  readonly stepCount: number;
  /** GPU compute dispatch count (after adjacent-LUT fusion) — drives the Node gate tier. */
  readonly kernelCount: number;
  /** true when every plan step is an exact CPU-built LUT — the Node gate requires delta 0. */
  readonly lutOnly: boolean;
  readonly maxChannelDelta: number;
  readonly maxAlphaDelta: number;
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly meanAbsoluteDelta: number;
}

type FilterParityResult =
  | {
      readonly status: "ok";
      readonly width: number;
      readonly height: number;
      readonly cases: readonly FilterParityCaseResult[];
    }
  | { readonly status: "unsupported"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

declare global {
  interface Window {
    __studioGpuFiltersParityResult?: FilterParityResult;
  }
}

const registry: KonvaLike = { Filters: {} };
registerStudioKonvaFilters(registry);

/** Deterministic gradients + interference patterns + varied alpha (incl. fully opaque rows). */
function buildTestImage(): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 4;
      data[index] = (x * 255 / (WIDTH - 1)) | 0;
      data[index + 1] = (y * 255 / (HEIGHT - 1)) | 0;
      data[index + 2] = (x * 41 + y * 13) % 256;
      data[index + 3] = (x + y) % 17 === 0
        ? 0
        : y % 4 === 0
          ? 255
          : 40 + ((x * 7 + y * 3) % 216);
    }
  }
  return { data, width: WIDTH, height: HEIGHT };
}

interface FilterParityCase {
  readonly id: string;
  readonly el: ImageFilterFields;
}

const PARITY_CASES: readonly FilterParityCase[] = [
  {
    id: "gaussian-premultiplied",
    el: { blurFx: { type: "gaussian", strength: 73, radius: 6, angle: 0 } },
  },
  {
    id: "gaussian-large-radius",
    el: { blurFx: { type: "gaussian", strength: 100, radius: 40, angle: 0 } },
  },
  {
    id: "morphology-dilate",
    el: { morphology: { mode: "dilate", radius: 3 } },
  },
  {
    id: "morphology-erode",
    el: { morphology: { mode: "erode", radius: 2 } },
  },
  {
    id: "convolution-edge",
    el: {
      convolution: {
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        divisor: 1,
        bias: 128,
      },
    },
  },
  {
    id: "spatial-chain",
    el: {
      blurFx: { type: "gaussian", strength: 61, radius: 3, angle: 0 },
      morphology: { mode: "dilate", radius: 1 },
      convolution: {
        kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0],
        divisor: 1,
        bias: 0,
      },
    },
  },
  { id: "brightness", el: { brightness: 0.3 } },
  { id: "brightness-negative", el: { brightness: -0.35 } },
  { id: "contrast", el: { contrast: 45 } },
  { id: "brightness-contrast", el: { brightness: -0.2, contrast: 45 } },
  { id: "hsl-hue-saturation", el: { saturation: 0.5, hue: 130 } },
  { id: "hsl-desaturate", el: { saturation: -0.7, hue: -40 } },
  {
    id: "levels-master",
    el: { levelsBlack: 25, levelsWhite: 230, levelsGamma: 1.3, levelsOutBlack: 10, levelsOutWhite: 245 },
  },
  {
    id: "levels-channels",
    el: { levelsBlack: 12, levelsGamma: 0.9, levelsCh: { r: { gamma: 0.8 }, b: { blackPoint: 30 } } },
  },
  {
    id: "curves-master",
    el: {
      curve: [
        { x: 0, y: 0 },
        { x: 64, y: 48 },
        { x: 192, y: 208 },
        { x: 255, y: 255 },
      ],
    },
  },
  {
    id: "curves-channels",
    el: {
      curve: [
        { x: 0, y: 0 },
        { x: 128, y: 150 },
        { x: 255, y: 255 },
      ],
      curveCh: {
        r: [{ x: 0, y: 20 }, { x: 255, y: 235 }],
        g: [{ x: 0, y: 0 }, { x: 128, y: 110 }, { x: 255, y: 255 }],
      },
    },
  },
  {
    id: "color-balance",
    el: {
      colorBalance: {
        shadows: [20, 0, -10],
        midtones: [0, 15, 0],
        highlights: [-25, 0, 30],
      },
    },
  },
  {
    // brightness/contrast + levels + curves are all byte->byte LUT stages with no formula
    // kernel between them — the plan must fuse them into a single lut3 dispatch that stays
    // bit-identical to the CPU chain (lutOnly gate: delta 0).
    id: "lut-fused-chain",
    el: {
      brightness: -0.2,
      contrast: 45,
      levelsBlack: 20,
      levelsWhite: 235,
      levelsGamma: 1.3,
      levelsCh: { r: { gamma: 0.8 } },
      curve: [
        { x: 0, y: 0 },
        { x: 64, y: 48 },
        { x: 255, y: 255 },
      ],
      curveCh: { g: [{ x: 0, y: 10 }, { x: 255, y: 245 }] },
    },
  },
  {
    id: "full-chain",
    el: {
      brightness: 0.1,
      contrast: 20,
      saturation: 0.4,
      hue: -40,
      levelsBlack: 15,
      levelsCh: { g: { whitePoint: 240 } },
      curve: [
        { x: 0, y: 0 },
        { x: 64, y: 48 },
        { x: 255, y: 255 },
      ],
      curveCh: { r: [{ x: 0, y: 10 }, { x: 255, y: 245 }] },
      colorBalance: {
        shadows: [0, 0, 12],
        midtones: [0, 12, 0],
        highlights: [-8, 0, 8],
      },
    },
  },
];

function diffBuffers(
  cpu: Uint8ClampedArray,
  gpu: Uint8ClampedArray,
): Pick<
  FilterParityCaseResult,
  "maxChannelDelta" | "maxAlphaDelta" | "changedPixels" | "totalPixels" | "meanAbsoluteDelta"
> {
  if (cpu.length !== gpu.length) throw new Error("CPU/GPU pixel buffer sizes differ");
  let maxChannelDelta = 0;
  let maxAlphaDelta = 0;
  let changedPixels = 0;
  let totalAbsoluteDelta = 0;
  for (let offset = 0; offset < cpu.length; offset += 4) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(cpu[offset + channel]! - gpu[offset + channel]!);
      pixelDelta = Math.max(pixelDelta, delta);
      totalAbsoluteDelta += delta;
      if (channel === 3) maxAlphaDelta = Math.max(maxAlphaDelta, delta);
      else maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (pixelDelta > 0) changedPixels += 1;
  }
  return {
    maxChannelDelta,
    maxAlphaDelta,
    changedPixels,
    totalPixels: cpu.length / 4,
    meanAbsoluteDelta: totalAbsoluteDelta / cpu.length,
  };
}

async function run(): Promise<FilterParityResult> {
  if (!supportsStudioGpuFilters()) {
    return { status: "unsupported", message: "navigator.gpu is unavailable in this browser context" };
  }

  const source = buildTestImage();
  const cases: FilterParityCaseResult[] = [];
  for (const parityCase of PARITY_CASES) {
    // --- CPU oracle: the exact registry + chain StudioKonvaImageNode executes -----------------
    const cpuImage = {
      data: new Uint8ClampedArray(source.data),
      width: source.width,
      height: source.height,
    };
    const { filters, attrs } = buildImageFilters(parityCase.el, registry);
    if (filters.length === 0) {
      return { status: "error", message: `[${parityCase.id}] CPU chain resolved to zero filters` };
    }
    applyImageFilters(cpuImage, filters, attrs);

    const plan = planStudioGpuFilterChain(parityCase.el);
    if (!plan) {
      return { status: "error", message: `[${parityCase.id}] GPU plan rejected a supported-field case` };
    }

    // --- GPU compute chain --------------------------------------------------------------------
    const gpuInput = {
      data: new Uint8ClampedArray(source.data),
      width: source.width,
      height: source.height,
    };
    const gpuImage = await applyGpuFilterChain(gpuInput, parityCase.el);
    if (!gpuImage) {
      return {
        status: "error",
        message: `[${parityCase.id}] applyGpuFilterChain returned null on a WebGPU-capable browser`,
      };
    }
    if (gpuImage.width !== source.width || gpuImage.height !== source.height) {
      return { status: "error", message: `[${parityCase.id}] GPU result dimensions diverged` };
    }

    cases.push({
      id: parityCase.id,
      stepCount: filters.length,
      kernelCount: plan.length,
      lutOnly: plan.every((step) => !!step.lut),
      ...diffBuffers(cpuImage.data, gpuImage.data),
    });
  }

  return { status: "ok", width: WIDTH, height: HEIGHT, cases };
}

run()
  .then((result) => {
    window.__studioGpuFiltersParityResult = result;
  })
  .catch((error: unknown) => {
    window.__studioGpuFiltersParityResult = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  });
