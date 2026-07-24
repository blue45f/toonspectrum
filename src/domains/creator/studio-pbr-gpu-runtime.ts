/**
 * Studio PBR — WebGPU 디바이스 seam (주입 가능)
 *
 * studio-gpu-filter-runtime.ts 의 수명 규율을 **복제**한다(그 파일은 수정 금지 대상이자
 * rgba8 픽셀 storage 전용이라 f32 IBL/AO/블룸 버퍼를 얹을 수 없다):
 *  - 기능 감지 실패 / 어댑터 없음 / 획득 예외 → null (호출부는 CPU 참조 경로로 폴백)
 *  - device lost → 런타임을 lost 로 표시하고 공유 싱글턴을 비운다
 *  - dispose 는 generation 카운터로 in-flight 획득과 경합해도 안전하다
 *  - `options.gpu` 로 싱글턴을 우회 주입할 수 있다(테스트 격리). `null` 은 미지원 강제.
 *
 * node 테스트 환경에는 GPUBufferUsage 전역이 없으므로 WebGPU 명세의 고정 상수를
 * 리터럴로 쓴다 — 필터 런타임과 같은 이유, 같은 값이다.
 *
 * 【정직한 한계】 이 파일은 디바이스/파이프라인/버퍼 **수명만** 관리한다. 실제 패스
 * 오케스트레이션(어떤 커널을 어떤 순서로 디스패치할지)은 호출부의 몫이고, 여기에는
 * 없다. 그리고 node 에는 WebGPU 가 없으므로 테스트는 위조 GPUDevice 로 수명 규율만
 * 검증한다 — 셰이더 컴파일이나 수치는 검증하지 않는다(브라우저 프로브의 영역).
 */

import { STUDIO_PBR_KERNELS, type StudioPbrKernelId } from "./studio-pbr-wgsl";

// WebGPU 명세 고정 상수 — node 전역에 GPUBufferUsage 가 없다.
const USAGE_MAP_READ = 0x0001;
const USAGE_COPY_SRC = 0x0004;
const USAGE_COPY_DST = 0x0008;
const USAGE_UNIFORM = 0x0040;
const USAGE_STORAGE = 0x0080;
const MAP_MODE_READ = 0x0001;

export interface StudioPbrGpuRuntime {
  readonly device: GPUDevice;
  /** true 면 재사용 불가 — 호출부는 즉시 CPU 참조 경로로 폴백해야 한다. */
  readonly lost: boolean;
  /** 커널 id 로 컴퓨트 파이프라인을 가져온다(모듈·파이프라인 모두 캐시). */
  getComputePipeline(kernelId: StudioPbrKernelId): GPUComputePipeline;
  /** f32 storage 버퍼(STORAGE|COPY_SRC|COPY_DST). */
  createFloatBuffer(elementCount: number, label?: string): GPUBuffer;
  createUniformBuffer(uniform: ArrayBuffer, label?: string): GPUBuffer;
  writeFloats(target: GPUBuffer, values: Float32Array): void;
  /** 스테이징 MAP_READ 버퍼로 복사 → mapAsync → 새 Float32Array 로 반환. */
  readbackFloats(source: GPUBuffer, elementCount: number): Promise<Float32Array>;
  dispose(): void;
}

export interface StudioPbrGpuRuntimeOptions {
  /**
   * 테스트/하니스 주입용 GPU 오버라이드. 지정되면 공유 싱글턴을 우회해 매 호출 새로
   * 획득한다(테스트 간 상태 오염 방지). `null` 은 "미지원 환경" 강제.
   */
  readonly gpu?: GPU | null;
}

function defaultGpu(): GPU | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as { gpu?: GPU }).gpu ?? null;
}

/** WebGPU 사용 가능 여부(디바이스 획득 없이 기능 감지만). */
export function supportsStudioPbrGpu(gpu: GPU | null = defaultGpu()): boolean {
  return !!gpu && typeof gpu.requestAdapter === "function";
}

function safeDestroyDevice(device: GPUDevice | null): void {
  try {
    device?.destroy();
  } catch {
    // 이미 lost 된 디바이스는 destroy 가 던질 수 있다 — 폐기 경로에서는 무시.
  }
}

class StudioPbrGpuRuntimeImpl implements StudioPbrGpuRuntime {
  readonly device: GPUDevice;
  lost = false;
  private readonly modules = new Map<string, GPUShaderModule>();
  private readonly pipelines = new Map<string, GPUComputePipeline>();
  private disposed = false;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  markLost(): void {
    this.lost = true;
  }

  getComputePipeline(kernelId: StudioPbrKernelId): GPUComputePipeline {
    if (this.lost || this.disposed) {
      throw new Error("studio-pbr: 런타임이 lost/dispose 상태다 — CPU 경로로 폴백하라");
    }
    const kernel = STUDIO_PBR_KERNELS[kernelId];
    if (!kernel) throw new Error(`studio-pbr: 알 수 없는 커널 ${String(kernelId)}`);
    const cached = this.pipelines.get(kernel.shaderId);
    if (cached) return cached;
    let module = this.modules.get(kernel.shaderId);
    if (!module) {
      module = this.device.createShaderModule({ label: kernel.shaderId, code: kernel.wgsl });
      this.modules.set(kernel.shaderId, module);
    }
    const pipeline = this.device.createComputePipeline({
      label: kernel.shaderId,
      layout: "auto",
      compute: { module, entryPoint: kernel.entryPoint },
    });
    this.pipelines.set(kernel.shaderId, pipeline);
    return pipeline;
  }

  createFloatBuffer(elementCount: number, label?: string): GPUBuffer {
    if (!Number.isInteger(elementCount) || elementCount < 1) {
      throw new Error(`studio-pbr: elementCount 는 1 이상 정수여야 한다 (${elementCount})`);
    }
    return this.device.createBuffer({
      label,
      size: elementCount * 4,
      usage: USAGE_STORAGE | USAGE_COPY_SRC | USAGE_COPY_DST,
    });
  }

  createUniformBuffer(uniform: ArrayBuffer, label?: string): GPUBuffer {
    const buffer = this.device.createBuffer({
      label,
      size: uniform.byteLength,
      usage: USAGE_UNIFORM | USAGE_COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, uniform);
    return buffer;
  }

  writeFloats(target: GPUBuffer, values: Float32Array): void {
    this.device.queue.writeBuffer(target, 0, values.buffer, values.byteOffset, values.byteLength);
  }

  async readbackFloats(source: GPUBuffer, elementCount: number): Promise<Float32Array> {
    const byteLength = elementCount * 4;
    const staging = this.device.createBuffer({
      label: "studio-pbr-readback",
      size: byteLength,
      usage: USAGE_MAP_READ | USAGE_COPY_DST,
    });
    try {
      const encoder = this.device.createCommandEncoder({ label: "studio-pbr-readback" });
      encoder.copyBufferToBuffer(source, 0, staging, 0, byteLength);
      this.device.queue.submit([encoder.finish()]);
      await staging.mapAsync(MAP_MODE_READ);
      const copy = new Float32Array(elementCount);
      copy.set(new Float32Array(staging.getMappedRange().slice(0)));
      staging.unmap();
      return copy;
    } finally {
      staging.destroy();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.modules.clear();
    this.pipelines.clear();
    safeDestroyDevice(this.device);
  }
}

let sharedRuntime: StudioPbrGpuRuntimeImpl | null = null;
let sharedPromise: Promise<StudioPbrGpuRuntimeImpl | null> | null = null;
/**
 * dispose 세대 카운터. acquire 가 await 하는 동안 dispose 가 끼어들면 세대가 어긋나므로
 * 뒤늦게 도착한 디바이스를 싱글턴에 심지 않고 즉시 폐기한다.
 */
let generation = 0;

async function requestRuntime(gpu: GPU, expectedGeneration: number): Promise<StudioPbrGpuRuntimeImpl | null> {
  let device: GPUDevice;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }
  if (!device) return null;
  if (generation !== expectedGeneration) {
    // 획득 중 dispose 가 지나갔다 — 이 디바이스는 버린다.
    safeDestroyDevice(device);
    return null;
  }
  const runtime = new StudioPbrGpuRuntimeImpl(device);
  void device.lost.then(() => {
    runtime.markLost();
    if (sharedRuntime === runtime) {
      sharedRuntime = null;
      sharedPromise = null;
    }
  });
  return runtime;
}

/**
 * PBR GPU 런타임 획득. 미지원/실패는 조용히 null 이며 캐시되지 않는다.
 * `options.gpu` 를 주면 공유 싱글턴을 완전히 우회한다(테스트 격리용).
 */
export async function acquireStudioPbrGpuRuntime(
  options: StudioPbrGpuRuntimeOptions = {},
): Promise<StudioPbrGpuRuntime | null> {
  const injected = Object.prototype.hasOwnProperty.call(options, "gpu");
  const gpu = injected ? (options.gpu ?? null) : defaultGpu();
  if (!supportsStudioPbrGpu(gpu)) return null;
  if (injected) return requestRuntime(gpu as GPU, generation);
  if (sharedRuntime && !sharedRuntime.lost) return sharedRuntime;
  if (!sharedPromise) {
    const expected = generation;
    sharedPromise = requestRuntime(gpu as GPU, expected).then((runtime) => {
      if (runtime && generation === expected) sharedRuntime = runtime;
      else if (runtime) runtime.dispose();
      sharedPromise = null;
      return generation === expected ? runtime : null;
    });
  }
  return sharedPromise;
}

/** 공유 싱글턴 폐기 — in-flight 획득은 세대 불일치로 자동 무효화된다. */
export function disposeStudioPbrGpuRuntime(): void {
  generation += 1;
  const runtime = sharedRuntime;
  sharedRuntime = null;
  sharedPromise = null;
  runtime?.dispose();
}
