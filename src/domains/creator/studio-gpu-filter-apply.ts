/**
 * Studio GPU Filter Apply (엔진 로드맵 M1)
 * 이미지 보정 필드 → GPU 커널 체인 계획(plan) → 단일 커맨드 인코더 안에서 storage buffer
 * ping-pong 으로 커널을 연쇄 실행(중간 readback 없음) → 마지막에 한 번만 readback.
 *
 * 계약:
 *  - applyGpuFilterChain(...) === null 은 "GPU 로 처리하지 않았다"는 뜻이다 — 미지원 환경,
 *    지원 외 필터 활성, 디바이스 손실, 검증/OOM 오류 전부. 호출부는 기존 CPU 경로
 *    (Worker/Konva)를 그대로 태우면 된다. GPU 경로가 틀린 픽셀을 돌려주는 일은 없어야
 *    하므로 검증 오류는 error scope 로 감지해 null 로 강등한다(fail-closed).
 *  - 체인 순서는 buildImageFilters(studio-konva-filters.ts)가 같은 필드를 적용하는 순서와
 *    동일하다: Brighten→Contrast → HSL → Levels → Curve → ColorBalance
 *    (계약 테스트가 buildImageFilters 실물과 대조한다).
 *  - 지원 5필드 외의 보정이 하나라도 활성이면 전체를 CPU 로 넘긴다(부분 GPU 실행 금지 —
 *    중간 순서에 끼어드는 미지원 필터와 결과가 달라질 수 있기 때문).
 *
 * 이 모듈은 konva 를 import 하지 않는다 — 게이트는 경량 studio-konva-filter-fields 의
 * 후보 판정(보수적: 애매하면 CPU 폴백)을 쓴다.
 */

import { isIdentityColorBalance, normalizeColorBalance } from "./studio-color-balance";
import { isIdentityCurve, isIdentityCurveChannels, normalizeCurve } from "./studio-curves";
import {
  STUDIO_GPU_FILTER_BINDINGS,
  STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS,
  STUDIO_GPU_FILTER_KERNELS,
  STUDIO_GPU_FILTER_WORKGROUP_SIZE,
  packStudioGpuBrightnessContrastParams,
  packStudioGpuColorBalanceParams,
  packStudioGpuCurvesLut,
  packStudioGpuHslParams,
  packStudioGpuLevelsLut,
  packStudioGpuLut3Uniform,
  patchStudioGpuFilterPixelCount,
} from "./studio-gpu-filter-kernels";
import { acquireStudioGpuFilterRuntime } from "./studio-gpu-filter-runtime";
import { hasActiveImageFilters } from "./studio-konva-filter-fields";
import { isIdentityLevels, isIdentityLevelsChannels, normalizeLevels } from "./studio-levels";

import type { StudioImageDataLike } from "./studio-filters";
import type { StudioGpuFilterKernelId } from "./studio-gpu-filter-kernels";
import type { StudioGpuFilterRuntimeOptions } from "./studio-gpu-filter-runtime";
import type { ImageFilterFields } from "./studio-konva-filter-fields";

/** GPU 경로가 담당하는 보정 필드(이 외의 활성 필드가 있으면 전체 CPU 폴백). */
export const STUDIO_GPU_FILTER_SUPPORTED_FIELDS = [
  "brightness",
  "contrast",
  "saturation",
  "hue",
  "levelsBlack",
  "levelsWhite",
  "levelsGamma",
  "levelsOutBlack",
  "levelsOutWhite",
  "levelsCh",
  "curve",
  "curveCh",
  "colorBalance",
] as const satisfies readonly (keyof ImageFilterFields)[];

export interface StudioGpuFilterPlanStep {
  readonly kernelId: StudioGpuFilterKernelId;
  /** offset 0 은 pixelCount 자리표시자 — apply 가 이미지별로 패치한다. */
  readonly uniform: ArrayBuffer;
  readonly lut?: Uint32Array;
}

export type StudioGpuFilterPlan = readonly StudioGpuFilterPlanStep[];

// buildImageFilters 의 isActiveNumber 복제(비공개 함수).
function isActiveNumber(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

// buildImageFilters 의 levelsParamsOf / hasActiveLevels 와 동일한 판정.
function hasActiveLevelsFields(el: ImageFilterFields): boolean {
  const master = normalizeLevels({
    blackPoint: el.levelsBlack,
    whitePoint: el.levelsWhite,
    gamma: el.levelsGamma,
    outBlack: el.levelsOutBlack,
    outWhite: el.levelsOutWhite,
  });
  if (!isIdentityLevels(master)) return true;
  return !!el.levelsCh && !isIdentityLevelsChannels(el.levelsCh);
}

// buildImageFilters 의 hasActiveCurve 와 동일한 판정.
function hasActiveCurveFields(el: ImageFilterFields): boolean {
  if (el.curve && !isIdentityCurve(normalizeCurve(el.curve))) return true;
  return !!el.curveCh && !isIdentityCurveChannels(el.curveCh);
}

// buildImageFilters 의 hasActiveColorBalance 와 동일한 판정.
function hasActiveColorBalanceFields(el: ImageFilterFields): boolean {
  return !!el.colorBalance && !isIdentityColorBalance(normalizeColorBalance(el.colorBalance));
}

/**
 * 지원 필드를 제거한 사본에 활성 보정이 남아 있으면 true — 즉 GPU 체인이 감당 못 하는
 * 필터가 켜져 있다. 경량 후보 판정(hasActiveImageFilters)은 엔진 판정보다 넓어서, 애매한
 * 값(정규화하면 항등인 객체 등)도 "활성"으로 보고 CPU 폴백시킨다 — 안전한 방향의 오탐이다.
 */
function hasUnsupportedActiveFilters(el: ImageFilterFields): boolean {
  const rest: ImageFilterFields = { ...el };
  for (const field of STUDIO_GPU_FILTER_SUPPORTED_FIELDS) {
    delete rest[field];
  }
  return hasActiveImageFilters(rest);
}

/**
 * 보정 필드 → GPU 커널 체인 계획. buildImageFilters 가 같은 필드를 태우는 순서와 동일한
 * 순서의 스텝 배열을 돌려준다. 다음의 경우 null(호출부는 CPU 경로):
 *  - 지원 5필드 중 활성이 하나도 없음
 *  - 지원 외 보정이 하나라도 활성
 */
export function planStudioGpuFilterChain(el: ImageFilterFields): StudioGpuFilterPlan | null {
  if (hasUnsupportedActiveFilters(el)) return null;

  const steps: StudioGpuFilterPlanStep[] = [];
  if (isActiveNumber(el.brightness) || isActiveNumber(el.contrast)) {
    steps.push({
      kernelId: "brightness-contrast",
      uniform: packStudioGpuBrightnessContrastParams({
        brightness: el.brightness,
        contrast: el.contrast,
      }),
    });
  }
  if (isActiveNumber(el.saturation) || isActiveNumber(el.hue)) {
    steps.push({
      kernelId: "hsl",
      uniform: packStudioGpuHslParams({ saturation: el.saturation, hue: el.hue }),
    });
  }
  if (hasActiveLevelsFields(el)) {
    steps.push({
      kernelId: "levels",
      uniform: packStudioGpuLut3Uniform(),
      lut: packStudioGpuLevelsLut({
        master: {
          blackPoint: el.levelsBlack,
          whitePoint: el.levelsWhite,
          gamma: el.levelsGamma,
          outBlack: el.levelsOutBlack,
          outWhite: el.levelsOutWhite,
        },
        channels: el.levelsCh,
      }),
    });
  }
  if (hasActiveCurveFields(el)) {
    steps.push({
      kernelId: "curves",
      uniform: packStudioGpuLut3Uniform(),
      lut: packStudioGpuCurvesLut({ master: el.curve, channels: el.curveCh }),
    });
  }
  if (hasActiveColorBalanceFields(el)) {
    steps.push({
      kernelId: "color-balance",
      uniform: packStudioGpuColorBalanceParams(el.colorBalance),
    });
  }
  return steps.length > 0 ? steps : null;
}

/** 통합 게이트용 — 이 보정 프로그램을 GPU 체인이 통째로 담당할 수 있는지. */
export function isStudioGpuFilterChainEligible(el: ImageFilterFields): boolean {
  return planStudioGpuFilterChain(el) !== null;
}

function isValidImageData(imageData: StudioImageDataLike): boolean {
  return (
    !!imageData
    && imageData.data instanceof Uint8ClampedArray
    && Number.isSafeInteger(imageData.width)
    && Number.isSafeInteger(imageData.height)
    && imageData.width > 0
    && imageData.height > 0
    && imageData.data.length === imageData.width * imageData.height * 4
  );
}

/**
 * 보정 체인을 WebGPU 컴퓨트로 실행한다. 커널들은 하나의 커맨드 인코더 안에서 픽셀 버퍼
 * ping-pong 으로 이어지며(중간 readback 없음) 마지막 버퍼만 한 번 read back 한다.
 * 입력 imageData 는 변형하지 않고 새 버퍼를 돌려준다.
 *
 * null 반환 = GPU 미처리(미지원/부적격/실패) — 호출부는 CPU 경로로 폴백한다.
 */
export async function applyGpuFilterChain(
  imageData: StudioImageDataLike,
  el: ImageFilterFields,
  options?: StudioGpuFilterRuntimeOptions,
): Promise<StudioImageDataLike | null> {
  if (!isValidImageData(imageData)) return null;
  const plan = planStudioGpuFilterChain(el);
  if (!plan) return null;

  const runtime = await acquireStudioGpuFilterRuntime(options);
  if (!runtime || runtime.lost) return null;

  const pixelCount = imageData.width * imageData.height;
  const byteLength = pixelCount * 4;
  const workgroupsX = STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS / STUDIO_GPU_FILTER_WORKGROUP_SIZE;
  const workgroupsY = Math.ceil(pixelCount / STUDIO_GPU_FILTER_DISPATCH_ROW_THREADS);
  const limits = runtime.device.limits;
  if (
    byteLength > limits.maxStorageBufferBindingSize
    || byteLength > limits.maxBufferSize
    || workgroupsY > limits.maxComputeWorkgroupsPerDimension
  ) {
    return null;
  }

  const transientBuffers: GPUBuffer[] = [];
  let pushedErrorScopes = 0;
  try {
    // 검증/OOM 오류는 예외를 던지지 않는다 — error scope 로 잡아 fail-closed(null) 한다.
    // (검증 오류를 놓치면 컴퓨트가 통째로 무시된 "무필터" 픽셀을 성공으로 돌려줄 수 있다.)
    runtime.device.pushErrorScope("out-of-memory");
    pushedErrorScopes += 1;
    runtime.device.pushErrorScope("validation");
    pushedErrorScopes += 1;

    let current = runtime.createPixelBuffer(byteLength, "studio-gpu-filter/ping");
    transientBuffers.push(current);
    let other = runtime.createPixelBuffer(byteLength, "studio-gpu-filter/pong");
    transientBuffers.push(other);
    runtime.uploadPixels(current, imageData.data);

    const encoder = runtime.device.createCommandEncoder({ label: "studio-gpu-filter/chain" });
    for (const step of plan) {
      const kernel = STUDIO_GPU_FILTER_KERNELS[step.kernelId];
      patchStudioGpuFilterPixelCount(step.uniform, pixelCount);
      const uniformBuffer = runtime.createUniformBuffer(
        step.uniform,
        `studio-gpu-filter/${step.kernelId}/params`,
      );
      transientBuffers.push(uniformBuffer);
      const entries: GPUBindGroupEntry[] = [
        { binding: STUDIO_GPU_FILTER_BINDINGS.src, resource: { buffer: current } },
        { binding: STUDIO_GPU_FILTER_BINDINGS.dst, resource: { buffer: other } },
        { binding: STUDIO_GPU_FILTER_BINDINGS.params, resource: { buffer: uniformBuffer } },
      ];
      if (kernel.usesLut) {
        if (!step.lut) return null;
        const lutBuffer = runtime.createLutBuffer(
          step.lut,
          `studio-gpu-filter/${step.kernelId}/lut`,
        );
        transientBuffers.push(lutBuffer);
        entries.push({ binding: STUDIO_GPU_FILTER_BINDINGS.lut, resource: { buffer: lutBuffer } });
      }
      const pipeline = runtime.getComputePipeline(kernel);
      const bindGroup = runtime.device.createBindGroup({
        label: `studio-gpu-filter/${step.kernelId}`,
        layout: pipeline.getBindGroupLayout(0),
        entries,
      });
      const pass = encoder.beginComputePass({ label: `studio-gpu-filter/${step.kernelId}` });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(workgroupsX, workgroupsY);
      pass.end();
      const written = other;
      other = current;
      current = written;
    }
    runtime.device.queue.submit([encoder.finish()]);

    const validationError = await runtime.device.popErrorScope();
    pushedErrorScopes -= 1;
    const oomError = await runtime.device.popErrorScope();
    pushedErrorScopes -= 1;
    if (validationError || oomError || runtime.lost) return null;

    const bytes = await runtime.readbackPixels(current, byteLength);
    if (bytes.length !== byteLength) return null;
    return { data: bytes, width: imageData.width, height: imageData.height };
  } catch {
    return null;
  } finally {
    // 예외 경로에서도 error scope 스택을 균형 맞춰 공유 디바이스를 오염시키지 않는다.
    while (pushedErrorScopes > 0) {
      pushedErrorScopes -= 1;
      try {
        void runtime.device.popErrorScope().catch(() => undefined);
      } catch {
        // lost 디바이스 — 스택도 함께 사라졌다.
      }
    }
    for (const buffer of transientBuffers) {
      try {
        buffer.destroy();
      } catch {
        // destroy 는 제출된 작업이 끝난 뒤 내부적으로 해제된다 — 폐기 실패는 무시.
      }
    }
  }
}
