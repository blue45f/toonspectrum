/**
 * 엔진 진입점 `createBabylonCharacterEngine` 실패 경로 — GPU·DOM이 없는 Node에서 **실제** Babylon `WebGPUEngine`/`Engine` 생성자와
 * 초기화를 호출해 fail-visible을 확인한다: 요청한 backend 하나만 시도하고(다른 backend 컨텍스트를 요청하지 않음), 어댑터 없음·
 * timeout·WebGL 컨텍스트 없음이 코드가 있는 LabFailure로 reject된다. 성공 경로(실제 GPU 초기화·device.lost)는 브라우저 미검증이다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { isLabFailure } from "../contracts";

import { createBabylonCharacterEngine } from "./babylon-character-engine";

import type { EngineBackend, LabFailure, PhysicsProviderFactory } from "../contracts";

const NO_PHYSICS: PhysicsProviderFactory = () => Promise.reject(new Error("물리 provider를 만들지 않는다"));

/** WebGPUEngine 생성자가 요구하는 최소 `navigator.gpu`(어댑터 요청만 시나리오별로 바꾼다) */
function stubNavigatorGpu(requestAdapter: () => Promise<null>): void {
  vi.stubGlobal("navigator", { gpu: { requestAdapter, getPreferredCanvasFormat: () => "bgra8unorm" } });
}

/** getContext 호출을 기록하는 최소 캔버스(항상 컨텍스트 없음) */
function recordingCanvas(calls: string[]): HTMLCanvasElement {
  const canvas = {
    width: 100,
    height: 100,
    style: {},
    clientWidth: 100,
    clientHeight: 100,
    getContext(kind: string) {
      calls.push(kind);
      return null;
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setAttribute: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  };
  return canvas as unknown as HTMLCanvasElement;
}

async function create(backend: EngineBackend, calls: string[], initTimeoutMs = 2_000): Promise<LabFailure> {
  const lost: LabFailure[] = [];
  const failure = await createBabylonCharacterEngine({ canvas: recordingCanvas(calls), backend, initTimeoutMs, physicsProviders: NO_PHYSICS, onLost: (value) => lost.push(value) }).then(
    () => null,
    (error: unknown) => error,
  );
  expect(isLabFailure(failure)).toBe(true);
  expect(lost).toEqual([]);
  return failure as LabFailure;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebGPU 요청", () => {
  it("navigator.gpu가 없으면 webgpu-init-failed로 거부하고 WebGL 컨텍스트를 요청하지 않는다(자동 fallback 없음)", async () => {
    const calls: string[] = [];
    const failure = await create("webgpu", calls);
    expect(failure.code).toBe("webgpu-init-failed");
    expect(failure.reasonKo).toContain("자동 전환 없이 중단");
    expect(calls.filter((kind) => kind.includes("webgl"))).toEqual([]);
  });

  it("어댑터를 얻지 못하면(requestAdapter → null) webgpu-init-failed이고 WebGL을 시도하지 않는다", async () => {
    stubNavigatorGpu(async () => null);
    const calls: string[] = [];
    const failure = await create("webgpu", calls);
    expect(failure.code).toBe("webgpu-init-failed");
    expect(failure.detail ?? "").toMatch(/adapter/iu);
    expect(calls.filter((kind) => kind.includes("webgl"))).toEqual([]);
  });

  it("requestAdapter가 끝나지 않으면 timeout 안에 engine-init-timeout으로 거부한다", async () => {
    stubNavigatorGpu(() => new Promise<null>(() => undefined));
    const started = Date.now();
    const failure = await create("webgpu", [], 80);
    expect(failure.code).toBe("engine-init-timeout");
    expect(failure.reasonKo).toContain("80ms");
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("WebGL2 요청", () => {
  it("WebGL 컨텍스트를 만들 수 없으면 webgl2-init-failed로 거부한다(WebGPU 요청 없음)", async () => {
    const calls: string[] = [];
    const failure = await create("webgl2", calls);
    expect(failure.code).toBe("webgl2-init-failed");
    expect(failure.reasonKo).toContain("자동 전환 없이 중단");
    expect(calls).toContain("webgl2");
    expect(calls).not.toContain("webgpu");
  });
});
