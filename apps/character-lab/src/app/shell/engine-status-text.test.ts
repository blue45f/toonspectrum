import { describe, expect, it } from "vitest";

import { failVisible } from "../../contracts";
import { mockDiagnostics } from "../../testing/mock-engine";

import { describeAdapter, describeEngineStatus, engineLaneLabel } from "./engine-status-text";

describe("app/shell/engine-status-text", () => {
  it("레인 라벨은 ENGINE_LANES 표기와 같다", () => {
    expect(engineLaneLabel("webgpu")).toBe("Babylon 9.19 WebGPU");
    expect(engineLaneLabel("webgl2")).toBe("Babylon 9.19 WebGL2");
  });

  it("어댑터 정보가 없으면 그 사실을 적는다", () => {
    expect(describeAdapter({ ...mockDiagnostics("webgpu"), adapter: null })).toBe("어댑터 정보 없음");
    expect(describeAdapter({ ...mockDiagnostics("webgl2"), adapter: null, renderer: "ANGLE (Mesa)" })).toBe("ANGLE (Mesa)");
    expect(describeAdapter({ ...mockDiagnostics("webgpu"), adapter: { vendor: "mock", device: "mock-device", isFallbackAdapter: true } })).toBe(
      "mock mock-device (소프트웨어 fallback 어댑터)",
    );
  });

  it("상태별 문구와 tone", () => {
    expect(describeEngineStatus({ phase: "idle" })).toMatchObject({ tone: "idle", text: expect.stringContaining("명시 선택") });
    expect(describeEngineStatus({ phase: "initializing", backend: "webgpu" })).toMatchObject({ tone: "busy" });
    const ready = describeEngineStatus({ phase: "ready", backend: "webgpu", diagnostics: mockDiagnostics("webgpu") });
    expect(ready.tone).toBe("ok");
    expect(ready.text).toContain("backend webgpu");
    expect(ready.text).toContain("mock-0.0.0");
    const failed = describeEngineStatus({ phase: "failed", backend: "webgl2", failure: failVisible("webgl2-unsupported", "WebGL2 미지원", "stack", 0) });
    expect(failed).toEqual({ tone: "error", text: "Babylon 9.19 WebGL2 초기화 실패 [webgl2-unsupported]: WebGL2 미지원", detail: "stack" });
    expect(describeEngineStatus({ phase: "lost", backend: "webgpu", failure: failVisible("device-lost", "손실", undefined, 0) }).text).toContain("복원");
  });
});
