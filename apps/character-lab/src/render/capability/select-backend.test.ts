import { describe, expect, it } from "vitest";

import { WEBGPU_MIN_LIMITS } from "../../contracts";

import { describeAdapter, probeGpu, selectBackend } from "./select-backend";

import type { GpuAdapterLike } from "./select-backend";
import type { GpuProbe } from "../../contracts";

const GOOD_LIMITS = {
  maxTextureDimension2D: 8192,
  maxBufferSize: 256 * 1024 * 1024,
  maxStorageBufferBindingSize: 128 * 1024 * 1024,
  maxColorAttachments: 8,
};

function probe(overrides: Partial<GpuProbe> = {}): GpuProbe {
  return {
    hasNavigatorGpu: true,
    adapter: { isFallbackAdapter: false, limits: GOOD_LIMITS, features: ["timestamp-query"] },
    webgl2: true,
    ...overrides,
  };
}

describe("selectBackend", () => {
  it("navigator.gpu가 없으면 webgpu-unsupported", () => {
    const decision = selectBackend("webgpu", probe({ hasNavigatorGpu: false, adapter: null }));
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("webgpu-unsupported");
      expect(decision.backend).toBe("webgpu");
      expect(decision.reasonKo).toContain("WebGPU");
    }
  });

  it("adapter가 null이면 webgpu-no-adapter", () => {
    const decision = selectBackend("webgpu", probe({ adapter: null }));
    expect(decision).toMatchObject({ ok: false, code: "webgpu-no-adapter", backend: "webgpu" });
  });

  it("fallback adapter는 차단한다", () => {
    const decision = selectBackend("webgpu", probe({ adapter: { isFallbackAdapter: true, limits: GOOD_LIMITS, features: [] } }));
    expect(decision).toMatchObject({ ok: false, code: "webgpu-fallback-adapter" });
  });

  it("limit 미달은 위반 항목을 사유에 나열한다", () => {
    const decision = selectBackend(
      "webgpu",
      probe({ adapter: { isFallbackAdapter: false, limits: { ...GOOD_LIMITS, maxBufferSize: 64 * 1024 * 1024, maxColorAttachments: 2 }, features: [] } }),
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("webgpu-limits");
      expect(decision.reasonKo).toContain("maxBufferSize");
      expect(decision.reasonKo).toContain("maxColorAttachments 2");
      expect(decision.reasonKo).toContain(`${WEBGPU_MIN_LIMITS.maxColorAttachments}`);
    }
  });

  it("정상 어댑터는 webgpu를 승인한다", () => {
    expect(selectBackend("webgpu", probe())).toEqual({ ok: true, backend: "webgpu" });
  });

  it("webgl2 요청은 webgpu 상태와 무관하게 webgl2만 판정한다", () => {
    expect(selectBackend("webgl2", probe({ hasNavigatorGpu: false, adapter: null, webgl2: true }))).toEqual({ ok: true, backend: "webgl2" });
    const blocked = selectBackend("webgl2", probe({ webgl2: false }));
    expect(blocked).toMatchObject({ ok: false, code: "webgl2-unsupported", backend: "webgl2" });
  });

  it("webgpu 차단 시 다른 backend를 제안하지 않는다(backend 필드는 요청값)", () => {
    const decision = selectBackend("webgpu", probe({ adapter: null, webgl2: true }));
    expect(decision.backend).toBe("webgpu");
  });
});

describe("probeGpu", () => {
  it("gpu가 없으면 hasNavigatorGpu=false, webgl2는 주입값", async () => {
    const result = await probeGpu({}, { webgl2: () => true });
    expect(result).toEqual({ hasNavigatorGpu: false, adapter: null, webgl2: true });
  });

  it("requestAdapter 결과를 직렬화 가능한 probe로 바꾼다(GPUDevice 미할당)", async () => {
    let requestDeviceCalled = false;
    const adapter: GpuAdapterLike & { requestDevice(): Promise<void> } = {
      isFallbackAdapter: false,
      limits: GOOD_LIMITS,
      features: new Set(["timestamp-query", "depth-clip-control"]),
      async requestDevice() {
        requestDeviceCalled = true;
      },
    };
    const result = await probeGpu({ gpu: { requestAdapter: async () => adapter } }, { webgl2: () => false });
    expect(requestDeviceCalled).toBe(false);
    expect(result.hasNavigatorGpu).toBe(true);
    expect(result.adapter).toEqual({ isFallbackAdapter: false, limits: GOOD_LIMITS, features: ["depth-clip-control", "timestamp-query"] });
    expect(result.webgl2).toBe(false);
  });

  it("requestAdapter가 던지거나 시간을 넘기면 adapter null", async () => {
    const thrown = await probeGpu({ gpu: { requestAdapter: async () => { throw new Error("boom"); } } }, { webgl2: () => true });
    expect(thrown.adapter).toBeNull();
    const slow = await probeGpu({ gpu: { requestAdapter: () => new Promise(() => undefined) } }, { webgl2: () => true, timeoutMs: 5 });
    expect(slow).toEqual({ hasNavigatorGpu: true, adapter: null, webgl2: true });
  });

  it("describeAdapter는 info.isFallbackAdapter와 비정상 limit 값을 정리한다", () => {
    const described = describeAdapter({ info: { isFallbackAdapter: true }, limits: { maxBufferSize: Number.NaN } });
    expect(described.isFallbackAdapter).toBe(true);
    expect(described.limits).toEqual({ maxTextureDimension2D: 0, maxBufferSize: 0, maxStorageBufferBindingSize: 0, maxColorAttachments: 0 });
    expect(described.features).toEqual([]);
  });
});
