import { describe, expect, it } from "vitest";

import { isLabFailure } from "../contracts";

import { attachDeviceLost, createLostReporter, createPartialDisposer, initializeEngine, toInitFailure } from "./engine-init";

import type { LabFailure } from "../contracts";

interface FakeEngine {
  disposed: number;
  throwOnDispose: boolean;
  dispose(): void;
}

function fakeEngine(throwOnDispose = false): FakeEngine {
  const engine: FakeEngine = {
    disposed: 0,
    throwOnDispose,
    dispose() {
      if (engine.throwOnDispose) throw new Error("partial dispose");
      engine.disposed += 1;
    },
  };
  return engine;
}

describe("initializeEngine", () => {
  it("성공하면 엔진과 소요 시간을 돌려준다", async () => {
    const engine = fakeEngine();
    const result = await initializeEngine({ backend: "webgpu", create: () => engine, init: async () => undefined, timeoutMs: 100 });
    expect(result.engine).toBe(engine);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(engine.disposed).toBe(0);
  });

  it("timeout이면 engine-init-timeout LabFailure로 reject하고 부분 disposer를 호출한다", async () => {
    const engine = fakeEngine();
    let resolveInit: (() => void) | null = null;
    const pending = initializeEngine({
      backend: "webgpu",
      create: () => engine,
      init: () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
      timeoutMs: 10,
    });
    await expect(pending).rejects.toMatchObject({ code: "engine-init-timeout" });
    expect(engine.disposed).toBe(1);
    // 늦게 성공해도 다시 정리만 하고 상태를 바꾸지 않는다(이미 disposed라 추가 호출 없음).
    (resolveInit as (() => void) | null)?.();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(engine.disposed).toBe(1);
  });

  it("initAsync 거부는 backend별 코드로 감싸고 WebGL2를 만들지 않는다", async () => {
    const engine = fakeEngine();
    const created: string[] = [];
    await expect(
      initializeEngine({
        backend: "webgpu",
        create: () => {
          created.push("webgpu");
          return engine;
        },
        init: async () => {
          throw new Error("requestDevice failed");
        },
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ code: "webgpu-init-failed", detail: expect.stringContaining("requestDevice failed") });
    expect(created).toEqual(["webgpu"]);
    expect(engine.disposed).toBe(1);
  });

  it("생성자 예외도 LabFailure", async () => {
    await expect(
      initializeEngine({
        backend: "webgl2",
        create: () => {
          throw new Error("no context");
        },
        init: async () => undefined,
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ code: "webgl2-init-failed" });
  });

  it("init이 LabFailure를 던지면 그대로 전달한다", async () => {
    const failure: LabFailure = { code: "custom", reasonKo: "사용자 사유", at: 1 };
    await expect(initializeEngine({ backend: "webgl2", create: () => fakeEngine(), init: async () => { throw failure; }, timeoutMs: 100 })).rejects.toBe(failure);
  });
});

describe("createPartialDisposer", () => {
  it("dispose가 던지면 _device.destroy를 시도하고 예외를 삼킨다", () => {
    let destroyed = 0;
    const engine = Object.assign(fakeEngine(true), { _device: { destroy: () => { destroyed += 1; } } });
    const dispose = createPartialDisposer(engine);
    expect(() => dispose()).not.toThrow();
    expect(destroyed).toBe(1);
    engine.throwOnDispose = false;
    dispose();
    expect(engine.disposed).toBe(1);
    dispose();
    expect(engine.disposed).toBe(1);
  });
});

describe("lost 보고", () => {
  it("device.lost는 한 번만 lost LabFailure로 보고한다", async () => {
    const reports: LabFailure[] = [];
    const report = createLostReporter("webgpu", (failure) => reports.push(failure), () => 42);
    attachDeviceLost(Promise.resolve({ reason: "destroyed", message: "device destroyed" }), report);
    await new Promise((resolve) => setTimeout(resolve, 0));
    report({ reason: "unknown" });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ code: "webgpu-device-lost", at: 42, detail: "device destroyed" });
    expect(reports[0]?.reasonKo).toContain("destroyed");
  });

  it("WebGL2 컨텍스트 손실 코드", () => {
    const reports: LabFailure[] = [];
    createLostReporter("webgl2", (failure) => reports.push(failure))();
    expect(reports[0]?.code).toBe("webgl2-context-lost");
  });

  it("toInitFailure는 LabFailure를 보존하고 그 외는 감싼다", () => {
    const failure: LabFailure = { code: "x", reasonKo: "y", at: 0 };
    expect(toInitFailure("webgpu", failure)).toBe(failure);
    const wrapped = toInitFailure("webgl2", "문자열 오류", 7);
    expect(isLabFailure(wrapped)).toBe(true);
    expect(wrapped).toMatchObject({ code: "webgl2-init-failed", detail: "문자열 오류", at: 7 });
  });
});
