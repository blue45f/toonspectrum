import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acquireStudioGpuFilterRuntimeOnFabric,
  activeStudioGpuDeviceLeaseCount,
  disposeStudioGpuFabric,
} from "./studio-gpu-fabric";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

interface FakeDeviceHarness {
  readonly device: GPUDevice;
  readonly destroy: ReturnType<typeof vi.fn>;
}

function createFakeDevice(): FakeDeviceHarness {
  const destroy = vi.fn();
  const device = {
    destroy,
    lost: new Promise<GPUDeviceLostInfo>(() => {
      // 이 경쟁 조건 테스트에서는 device-loss가 발생하지 않는다.
    }),
    limits: {},
    features: new Set<string>(),
  } as unknown as GPUDevice;
  return { device, destroy };
}

interface DeferredGpuHarness {
  readonly gpu: GPU;
  readonly requestAdapter: ReturnType<typeof vi.fn>;
  readonly requestDevice: ReturnType<typeof vi.fn>;
}

function gpuWithDeferredDevice(device: Promise<GPUDevice>): DeferredGpuHarness {
  const requestDevice = vi.fn(() => device);
  const requestAdapter = vi.fn(async () => ({ requestDevice }));
  return {
    gpu: { requestAdapter } as unknown as GPU,
    requestAdapter,
    requestDevice,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  disposeStudioGpuFabric();
});

describe("studio-gpu-fabric: filter acquisition lifecycle race", () => {
  it("이전 세대 완료가 새 acquisition 캐시를 지우거나 lease 를 중복시키지 않는다", async () => {
    const staleDevice = createFakeDevice();
    const staleDeviceDeferred = createDeferred<GPUDevice>();
    const staleGpu = gpuWithDeferredDevice(staleDeviceDeferred.promise);
    const staleAcquisition = acquireStudioGpuFilterRuntimeOnFabric({ gpu: staleGpu.gpu });
    await flushMicrotasks();
    expect(staleGpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(staleGpu.requestDevice).toHaveBeenCalledTimes(1);

    disposeStudioGpuFabric();

    const activeDevice = createFakeDevice();
    const activeDeviceDeferred = createDeferred<GPUDevice>();
    const activeGpu = gpuWithDeferredDevice(activeDeviceDeferred.promise);
    const activeAcquisition = acquireStudioGpuFilterRuntimeOnFabric({ gpu: activeGpu.gpu });
    await flushMicrotasks();
    expect(activeGpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(activeGpu.requestDevice).toHaveBeenCalledTimes(1);

    staleDeviceDeferred.resolve(staleDevice.device);
    await expect(staleAcquisition).resolves.toBeNull();
    expect(staleDevice.destroy).toHaveBeenCalledTimes(1);

    // 이전 acquisition 이 끝난 직후에도 새 acquisition 은 계속 공유돼야 한다.
    const concurrentAcquisition = acquireStudioGpuFilterRuntimeOnFabric({ gpu: activeGpu.gpu });
    activeDeviceDeferred.resolve(activeDevice.device);

    const [first, second] = await Promise.all([activeAcquisition, concurrentAcquisition]);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(activeGpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(activeGpu.requestDevice).toHaveBeenCalledTimes(1);
    expect(activeStudioGpuDeviceLeaseCount()).toBe(1);
  });
});
