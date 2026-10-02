import { describe, expect, it } from "vitest";

import { LaneUnavailableError, WgslCompileError } from "../core/errors";

import {
  compileShaderOrThrow,
  describeProbe,
  detectSoftwareRenderer,
  effectiveDeviceLimits,
  limitShortfalls,
  probeWebGpu,
  readDeviceLimits,
  requestSumiDevice,
  SUMI_REQUIRED_LIMITS,
} from "./device";
import { createMockAdapter, createMockGpu, createMockGpuApi } from "./testing/mock-gpu-device";

describe("gpu/device probeWebGpu", () => {
  it("gpu가 없으면 webgpu-api-unavailable(throw 없음)", async () => {
    expect(await probeWebGpu({ gpu: undefined })).toMatchObject({ status: "unavailable", reasons: ["webgpu-api-unavailable"] });
    expect(await probeWebGpu({ gpu: null })).toMatchObject({ status: "unavailable", reasons: ["webgpu-api-unavailable"] });
  });

  it("requestAdapter가 null이거나 던지면 adapter-unavailable", async () => {
    expect(await probeWebGpu({ gpu: createMockGpuApi(null) })).toMatchObject({ status: "unavailable", reasons: ["adapter-unavailable"] });
    const throwing = {
      requestAdapter: async (): Promise<GPUAdapter | null> => {
        throw new Error("boom");
      },
    } as unknown as GPU;
    expect(await probeWebGpu({ gpu: throwing })).toMatchObject({ status: "unavailable", reasons: ["adapter-unavailable"] });
  });

  it("지원 어댑터는 supported + 정보·기능·한도", async () => {
    const { adapter } = createMockAdapter({
      info: { vendor: "nvidia", architecture: "ampere", device: "0x2204", description: "NVIDIA GeForce" },
      features: ["timestamp-query", "shader-f16"],
    });
    const result = await probeWebGpu({ gpu: createMockGpuApi(adapter) });
    expect(result.status).toBe("supported");
    expect(result.reasons).toEqual([]);
    expect(result.adapterInfo).toEqual({ vendor: "nvidia", architecture: "ampere", device: "0x2204", description: "NVIDIA GeForce" });
    expect(result.features).toEqual(["shader-f16", "timestamp-query"]);
    expect(result.limits.maxStorageBuffersPerShaderStage).toBe(8);
    expect(result.softwareRenderer).toBe(false);
    expect(describeProbe(result)).toContain("nvidia");
  });

  it("swiftshader·llvmpipe·fallback 어댑터는 softwareRenderer true", async () => {
    const sw = createMockAdapter({ info: { vendor: "google", architecture: "", device: "", description: "SwiftShader device" } });
    expect((await probeWebGpu({ gpu: createMockGpuApi(sw.adapter) })).softwareRenderer).toBe(true);
    const llvm = createMockAdapter({ info: { vendor: "mesa", device: "llvmpipe (LLVM 15)" } });
    expect((await probeWebGpu({ gpu: createMockGpuApi(llvm.adapter) })).softwareRenderer).toBe(true);
    const fallback = createMockAdapter({ info: { vendor: "x", isFallbackAdapter: true } });
    expect((await probeWebGpu({ gpu: createMockGpuApi(fallback.adapter) })).softwareRenderer).toBe(true);
    expect(detectSoftwareRenderer(null, undefined)).toBeNull();
    expect(detectSoftwareRenderer({ vendor: "", architecture: "", device: "", description: "" }, undefined)).toBeNull();
  });

  it("한도 미달이면 limit-exceeded와 미달 목록", async () => {
    const { adapter } = createMockAdapter({ limits: { maxStorageBuffersPerShaderStage: 4, maxComputeWorkgroupSizeX: 64 } });
    const result = await probeWebGpu({ gpu: createMockGpuApi(adapter) });
    expect(result.status).toBe("unavailable");
    expect(result.reasons).toEqual(["limit-exceeded"]);
    expect(result.limitShortfalls.map((s) => s.name).sort()).toEqual(["maxComputeWorkgroupSizeX", "maxStorageBuffersPerShaderStage"]);
    expect(describeProbe(result)).toContain("maxStorageBuffersPerShaderStage 4 < 8");
  });

  it("limitShortfalls는 노출되지 않은 한도를 판단하지 않는다", () => {
    expect(limitShortfalls({}, SUMI_REQUIRED_LIMITS)).toEqual([]);
    expect(limitShortfalls({ maxBindGroups: 1 }, { maxBindGroups: 2 })).toEqual([{ name: "maxBindGroups", actual: 1, required: 2 }]);
  });
});

describe("gpu/device requestSumiDevice", () => {
  it("선택 기능은 어댑터가 지원하는 것만 요청한다", async () => {
    const { adapter } = createMockAdapter({ features: ["timestamp-query"] });
    const { device, features } = await requestSumiDevice(adapter);
    expect(device).toBeTruthy();
    expect(features.has("timestamp-query")).toBe(true);
    expect(features.has("shader-f16")).toBe(false);
  });

  it("기본 한도를 넘는 요구는 어댑터 한도로 clamp해 requiredLimits로 요청하고 장치가 그 한도를 갖는다(기본 이하로 clamp되면 요청하지 않는다)", async () => {
    const GIB = 1024 ** 3;
    const gpu = createMockGpu();
    const { adapter } = createMockAdapter({ gpu, limits: { maxStorageBufferBindingSize: GIB, maxBufferSize: 512 * 1024 * 1024 } });
    const requests: GPUDeviceDescriptor[] = [];
    const original = adapter.requestDevice.bind(adapter);
    (adapter as unknown as { requestDevice: (d?: GPUDeviceDescriptor) => Promise<GPUDevice> }).requestDevice = async (desc) => {
      if (desc) requests.push(desc);
      return original(desc);
    };
    const { device } = await requestSumiDevice(adapter, {
      requiredLimits: { ...SUMI_REQUIRED_LIMITS, maxStorageBufferBindingSize: 400_000_000, maxBufferSize: 2 * GIB },
    });
    // 바인딩 400 MB는 어댑터 한도(1 GiB) 안이라 그대로, 버퍼 2 GiB는 어댑터 한도 512 MiB로 clamp.
    expect(requests[0]?.requiredLimits).toEqual({ maxStorageBufferBindingSize: 400_000_000, maxBufferSize: 512 * 1024 * 1024 });
    expect(readDeviceLimits(device)).toMatchObject({ maxStorageBufferBindingSize: 400_000_000, maxBufferSize: 512 * 1024 * 1024 });
    // 어댑터 한도가 기본과 같아 clamp 결과가 기본 이하면 요청하지 않는다.
    const small = createMockAdapter();
    const smallRequests: GPUDeviceDescriptor[] = [];
    const smallOriginal = small.adapter.requestDevice.bind(small.adapter);
    (small.adapter as unknown as { requestDevice: (d?: GPUDeviceDescriptor) => Promise<GPUDevice> }).requestDevice = async (desc) => {
      if (desc) smallRequests.push(desc);
      return smallOriginal(desc);
    };
    await requestSumiDevice(small.adapter, { requiredLimits: { ...SUMI_REQUIRED_LIMITS, maxBufferSize: 2 * GIB } });
    expect(smallRequests[0]?.requiredLimits).toEqual({});
  });

  it("요청 실패는 device-request-failed로 던진다", async () => {
    const { adapter } = createMockAdapter({ rejectDevice: new Error("no device") });
    await expect(requestSumiDevice(adapter)).rejects.toBeInstanceOf(LaneUnavailableError);
    await expect(requestSumiDevice(adapter)).rejects.toMatchObject({ code: "device-request-failed" });
  });

  it("device.lost 해소를 onLost로 전달한다", async () => {
    const { adapter, gpu } = createMockAdapter();
    const seen: string[] = [];
    await requestSumiDevice(adapter, { onLost: (info) => seen.push(info.reason) });
    gpu.loseDevice("unknown", "test");
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(["unknown"]);
  });
});

describe("gpu/device compileShaderOrThrow", () => {
  it("오류 메시지가 없으면 모듈을 돌려준다", async () => {
    const gpu = createMockGpu();
    const module = await compileShaderOrThrow(gpu.device, "ok", "fn main() {}");
    expect(module.label).toBe("ok");
    expect(gpu.calls).toContain("shader.getCompilationInfo");
  });

  it("error 메시지는 WgslCompileError(shaderId·messages)로 표면화한다(warning은 무시)", async () => {
    const gpu = createMockGpu({
      compilationMessages: {
        bad: [
          { type: "warning", message: "unused" },
          { type: "error", message: "unresolved identifier 'meta'", lineNum: 12, linePos: 3 },
        ],
      },
    });
    const err = await compileShaderOrThrow(gpu.device, "bad", "fn main() {}").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WgslCompileError);
    const compile = err as WgslCompileError;
    expect(compile.code).toBe("wgsl-compile-error");
    expect(compile.shaderId).toBe("bad");
    expect(compile.messages).toEqual([{ message: "unresolved identifier 'meta'", lineNum: 12, linePos: 3 }]);
  });
});

describe("gpu/device 장치 한도(어댑터 한도가 아니다)", () => {
  it("readDeviceLimits는 device.limits를 읽고, effectiveDeviceLimits는 호출자 한도와 장치 한도 중 더 작은 쪽을 쓴다", () => {
    const gpu = createMockGpu({ limits: { maxStorageBufferBindingSize: 64 * 1024 * 1024, maxBufferSize: 100 } });
    const actual = readDeviceLimits(gpu.device);
    expect(actual.maxStorageBufferBindingSize).toBe(64 * 1024 * 1024);
    expect(actual.maxBufferSize).toBe(100);
    expect(effectiveDeviceLimits(gpu.device)).toEqual(actual);
    // 어댑터 한도처럼 더 큰 값은 장치 한도를 가리지 못하고, 더 작은 주입값은 그대로 쓴다.
    const eff = effectiveDeviceLimits(gpu.device, { maxStorageBufferBindingSize: 1024 ** 3, maxBufferSize: 50, custom: 7 });
    expect(eff.maxStorageBufferBindingSize).toBe(64 * 1024 * 1024);
    expect(eff.maxBufferSize).toBe(50);
    expect(eff.custom).toBe(7);
  });
});
