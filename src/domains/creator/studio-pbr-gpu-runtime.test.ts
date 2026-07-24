import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquireStudioPbrGpuRuntime,
  disposeStudioPbrGpuRuntime,
  supportsStudioPbrGpu,
} from "./studio-pbr-gpu-runtime";

interface FakeDeviceHarness {
  readonly device: GPUDevice;
  readonly createShaderModule: ReturnType<typeof vi.fn>;
  readonly createComputePipeline: ReturnType<typeof vi.fn>;
  readonly createBuffer: ReturnType<typeof vi.fn>;
  readonly writeBuffer: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
  readonly loseDevice: () => void;
}

/** WebGPU 가 없는 node 에서 수명 규율만 검증하기 위한 위조 GPUDevice. */
function createFakeDevice(readback?: Float32Array): FakeDeviceHarness {
  let resolveLost: (() => void) | null = null;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    resolveLost = () => resolve({ reason: "destroyed", message: "test" } as GPUDeviceLostInfo);
  });
  const createShaderModule = vi.fn((descriptor: { label?: string; code: string }) => ({
    label: descriptor.label,
    code: descriptor.code,
  }));
  const createComputePipeline = vi.fn((descriptor: { label?: string }) => ({
    label: descriptor.label,
    getBindGroupLayout: vi.fn(() => ({})),
  }));
  const createBuffer = vi.fn((descriptor: { size: number; usage: number; label?: string }) => ({
    size: descriptor.size,
    usage: descriptor.usage,
    label: descriptor.label,
    destroy: vi.fn(),
    mapAsync: vi.fn(async () => undefined),
    getMappedRange: vi.fn(() => {
      const buffer = new ArrayBuffer(descriptor.size);
      if (readback) new Float32Array(buffer).set(readback.subarray(0, descriptor.size / 4));
      return buffer;
    }),
    unmap: vi.fn(),
  }));
  const writeBuffer = vi.fn();
  const destroy = vi.fn();
  const device = {
    createShaderModule,
    createComputePipeline,
    createBuffer,
    createCommandEncoder: vi.fn(() => ({
      copyBufferToBuffer: vi.fn(),
      finish: vi.fn(() => ({})),
    })),
    queue: { writeBuffer, submit: vi.fn() },
    destroy,
    lost,
  } as unknown as GPUDevice;
  return {
    device,
    createShaderModule,
    createComputePipeline,
    createBuffer,
    writeBuffer,
    destroy,
    loseDevice: () => resolveLost?.(),
  };
}

function fakeGpuFor(device: GPUDevice): GPU {
  return { requestAdapter: async () => ({ requestDevice: async () => device }) } as unknown as GPU;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  disposeStudioPbrGpuRuntime();
});

describe("studio-pbr-gpu-runtime: 기능 감지", () => {
  it("node 환경(navigator.gpu 없음)은 미지원 → null", async () => {
    expect(supportsStudioPbrGpu()).toBe(false);
    expect(await acquireStudioPbrGpuRuntime()).toBeNull();
    // 실패는 캐시되지 않고 두 번째 호출도 조용히 null 이다.
    expect(await acquireStudioPbrGpuRuntime()).toBeNull();
  });

  it("gpu: null 오버라이드는 미지원 강제", async () => {
    expect(supportsStudioPbrGpu(null)).toBe(false);
    expect(await acquireStudioPbrGpuRuntime({ gpu: null })).toBeNull();
  });

  it("어댑터 없음/획득 예외는 예외를 흘리지 않고 null 이다", async () => {
    const noAdapter = { requestAdapter: async () => null } as unknown as GPU;
    expect(await acquireStudioPbrGpuRuntime({ gpu: noAdapter })).toBeNull();
    const throwing = {
      requestAdapter: async () => {
        throw new Error("boom");
      },
    } as unknown as GPU;
    expect(await acquireStudioPbrGpuRuntime({ gpu: throwing })).toBeNull();
  });
});

describe("studio-pbr-gpu-runtime: 파이프라인 캐시", () => {
  it("같은 커널을 두 번 요청해도 모듈·파이프라인을 한 번만 만든다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    const first = runtime.getComputePipeline("ssao");
    const second = runtime.getComputePipeline("ssao");
    expect(second).toBe(first);
    expect(harness.createShaderModule).toHaveBeenCalledTimes(1);
    expect(harness.createComputePipeline).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("서로 다른 커널은 별도 모듈을 만든다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    runtime.getComputePipeline("ssao");
    runtime.getComputePipeline("bloomThreshold");
    runtime.getComputePipeline("brdfLut");
    expect(harness.createShaderModule).toHaveBeenCalledTimes(3);
    const codes = harness.createShaderModule.mock.calls.map((call) => (call[0] as { code: string }).code);
    expect(new Set(codes).size).toBe(3);
    runtime.dispose();
  });

  it("알 수 없는 커널 id 는 던진다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    expect(() =>
      runtime.getComputePipeline("nope" as unknown as Parameters<typeof runtime.getComputePipeline>[0]),
    ).toThrow();
    runtime.dispose();
  });
});

describe("studio-pbr-gpu-runtime: 버퍼", () => {
  it("f32 storage 버퍼가 요소 수 × 4 바이트로 잡히고 usage 비트가 맞다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    runtime.createFloatBuffer(1024, "ao");
    const descriptor = harness.createBuffer.mock.calls[0][0] as { size: number; usage: number };
    expect(descriptor.size).toBe(4096);
    expect(descriptor.usage & 0x0080).toBe(0x0080); // STORAGE
    expect(descriptor.usage & 0x0004).toBe(0x0004); // COPY_SRC
    expect(descriptor.usage & 0x0008).toBe(0x0008); // COPY_DST
    runtime.dispose();
  });

  it("uniform 버퍼는 UNIFORM|COPY_DST 이고 즉시 기록된다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    const uniform = new ArrayBuffer(32);
    runtime.createUniformBuffer(uniform, "params");
    const descriptor = harness.createBuffer.mock.calls[0][0] as { size: number; usage: number };
    expect(descriptor.size).toBe(32);
    expect(descriptor.usage & 0x0040).toBe(0x0040); // UNIFORM
    expect(harness.writeBuffer).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("잘못된 요소 수는 던진다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    expect(() => runtime.createFloatBuffer(0)).toThrow();
    expect(() => runtime.createFloatBuffer(1.5)).toThrow();
    runtime.dispose();
  });

  it("readback 이 매핑된 메모리의 복사본을 돌려준다(unmap 후에도 유효)", async () => {
    const payload = Float32Array.from([1.5, 2.5, 3.5, 4.5]);
    const harness = createFakeDevice(payload);
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    const source = runtime.createFloatBuffer(4);
    const result = await runtime.readbackFloats(source, 4);
    expect(Array.from(result)).toEqual([1.5, 2.5, 3.5, 4.5]);
    runtime.dispose();
  });
});

describe("studio-pbr-gpu-runtime: 수명·경합", () => {
  it("device lost 면 lost 로 표시되고 파이프라인 요청이 거부된다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    expect(runtime.lost).toBe(false);
    harness.loseDevice();
    await flushMicrotasks();
    expect(runtime.lost).toBe(true);
    expect(() => runtime.getComputePipeline("ssao")).toThrow(/폴백/);
  });

  it("공유 싱글턴이 재사용되고 lost 후에는 새로 획득한다", async () => {
    const first = createFakeDevice();
    const gpuFactory = { current: first };
    const gpu = {
      requestAdapter: async () => ({ requestDevice: async () => gpuFactory.current.device }),
    } as unknown as GPU;

    // 주입 경로는 싱글턴을 우회하므로, 싱글턴 동작은 navigator.gpu 를 흉내 내 검증한다.
    // node 의 navigator 는 getter-only 라 직접 대입이 안 된다 → stubGlobal 사용.
    vi.stubGlobal("navigator", { gpu });
    try {
      const a = await acquireStudioPbrGpuRuntime();
      const b = await acquireStudioPbrGpuRuntime();
      expect(a).not.toBeNull();
      expect(b).toBe(a);

      first.loseDevice();
      await flushMicrotasks();
      const second = createFakeDevice();
      gpuFactory.current = second;
      const c = await acquireStudioPbrGpuRuntime();
      expect(c).not.toBe(a);
      expect(c!.device).toBe(second.device);
    } finally {
      disposeStudioPbrGpuRuntime();
      vi.unstubAllGlobals();
    }
  });

  it("dispose 는 디바이스를 파괴하고 두 번 불러도 안전하다", async () => {
    const harness = createFakeDevice();
    const runtime = (await acquireStudioPbrGpuRuntime({ gpu: fakeGpuFor(harness.device) }))!;
    runtime.dispose();
    runtime.dispose();
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(() => runtime.getComputePipeline("ssao")).toThrow();
  });

  it("획득 중 dispose 가 끼어들면 늦게 온 디바이스를 심지 않고 폐기한다", async () => {
    const harness = createFakeDevice();
    let releaseDevice: ((device: GPUDevice) => void) | null = null;
    const slowGpu = {
      requestAdapter: async () => ({
        requestDevice: () =>
          new Promise<GPUDevice>((resolve) => {
            releaseDevice = resolve;
          }),
      }),
    } as unknown as GPU;

    vi.stubGlobal("navigator", { gpu: slowGpu });
    try {
      const pending = acquireStudioPbrGpuRuntime();
      // requestAdapter 가 먼저 resolve 돼야 requestDevice 가 불린다.
      await flushMicrotasks();
      disposeStudioPbrGpuRuntime(); // 세대 증가 — 이 시점에 디바이스는 아직 in-flight
      releaseDevice!(harness.device);
      expect(await pending).toBeNull();
      // 버려진 디바이스는 실제로 destroy 된다(누수 방지).
      expect(harness.destroy).toHaveBeenCalledTimes(1);
    } finally {
      disposeStudioPbrGpuRuntime();
      vi.unstubAllGlobals();
    }
  });
});
