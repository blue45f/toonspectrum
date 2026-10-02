import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { failVisible } from "../../contracts";
import { MOCK_ENGINE_FAILURE, createMockEngine, createMockEngineFactory, createMockPhysicsProviderFactory } from "../../testing/mock-engine";
import { createMockLabStore } from "../../testing/mock-store";

import { createEngineSession, withTimeout } from "./engine-session";

import type { BackendDecision, CharacterEngineFactory, EngineBackend, EngineStatus } from "../../contracts";

function canvasStub(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

function okDecision(backend: EngineBackend): BackendDecision {
  return { ok: true, backend };
}

describe("app/shell/engine-session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("capability가 차단하면 factory를 호출하지 않고 failed를 노출한다", async () => {
    const store = createMockLabStore();
    const factory = createMockEngineFactory();
    const session = createEngineSession({
      loadFactory: async () => factory,
      decideBackend: async (backend) => ({ ok: false, backend, code: "webgpu-no-adapter", reasonKo: "WebGPU 어댑터를 얻지 못했습니다." }),
      physicsProviders: createMockPhysicsProviderFactory(),
      store,
      now: () => 7,
    });
    await session.select("webgpu", canvasStub());
    const status = session.status();
    expect(status.phase).toBe("failed");
    if (status.phase === "failed") {
      expect(status.failure.code).toBe("webgpu-no-adapter");
      expect(status.failure.reasonKo).toContain("어댑터");
    }
    expect(factory.calls).toHaveLength(0);
    expect(session.engine()).toBeNull();
    expect(store.events.map((event) => event.type)).toEqual(["engine/status", "engine/status"]);
  });

  it("factory 실패 시 failed를 노출하고 WebGL2를 자동 생성하지 않는다", async () => {
    const store = createMockLabStore();
    const factory = createMockEngineFactory({ failWith: MOCK_ENGINE_FAILURE });
    const session = createEngineSession({ loadFactory: async () => factory, decideBackend: async (b) => okDecision(b), physicsProviders: createMockPhysicsProviderFactory(), store });
    await session.select("webgpu", canvasStub());
    expect(session.status()).toMatchObject({ phase: "failed", backend: "webgpu", failure: { code: "mock-engine-failed" } });
    expect(factory.calls).toHaveLength(1);
    expect(factory.calls[0]?.backend).toBe("webgpu");
    expect(factory.calls.some((call) => call.backend === "webgl2")).toBe(false);
  });

  it("초기화 timeout 시 failed(engine-init-timeout)이고 늦게 온 엔진은 해제한다", async () => {
    const store = createMockLabStore();
    const engine = createMockEngine();
    const factory = createMockEngineFactory({ engine, delayMs: 500 });
    const session = createEngineSession({
      loadFactory: async () => factory,
      decideBackend: async (b) => okDecision(b),
      physicsProviders: createMockPhysicsProviderFactory(),
      store,
      initTimeoutMs: 100,
    });
    const selecting = session.select("webgpu", canvasStub());
    await vi.advanceTimersByTimeAsync(150);
    await selecting;
    expect(session.status()).toMatchObject({ phase: "failed", failure: { code: "engine-init-timeout" } });
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.disposed).toBe(true);
    expect(session.engine()).toBeNull();
  });

  it("성공 시 ready와 diagnostics를 노출하고 모듈 로드는 1회만 한다", async () => {
    const store = createMockLabStore();
    const factory = createMockEngineFactory();
    const loadFactory = vi.fn(async () => factory);
    const session = createEngineSession({ loadFactory, decideBackend: async (b) => okDecision(b), physicsProviders: createMockPhysicsProviderFactory(), store });
    await session.select("webgpu", canvasStub());
    expect(session.status()).toMatchObject({ phase: "ready", backend: "webgpu", diagnostics: { engineVersion: "mock-0.0.0" } });
    expect(session.engine()).not.toBeNull();
    await session.select("webgl2", canvasStub());
    expect(session.status()).toMatchObject({ phase: "ready", backend: "webgl2" });
    expect(loadFactory).toHaveBeenCalledTimes(1);
    expect(factory.calls).toHaveLength(2);
    expect(store.getState().engine.phase).toBe("ready");
  });

  it("엔진이 알리는 비치명 실패(onFailure)는 failure 이벤트로만 올리고 세션 상태는 그대로이며, 교체된 엔진의 늦은 보고는 버린다", async () => {
    const store = createMockLabStore();
    const factory = createMockEngineFactory();
    const session = createEngineSession({ loadFactory: async () => factory, decideBackend: async (b) => okDecision(b), physicsProviders: createMockPhysicsProviderFactory(), store, now: () => 3 });
    await session.select("webgpu", canvasStub());
    const first = factory.calls[0];
    expect(first?.onFailure).toBeTypeOf("function");
    first?.onFailure?.(failVisible("physics-step-failed", "물리 스텝 중 오류가 나 물리를 중단했습니다.", undefined, 3));
    const failures = (): string[] => store.events.flatMap((event) => (event.type === "failure" ? [event.failure.code] : []));
    expect(failures()).toEqual(["physics-step-failed"]);
    expect(session.status().phase).toBe("ready");
    expect(session.engine()).not.toBeNull();
    await session.select("webgl2", canvasStub());
    first?.onFailure?.(failVisible("physics-step-failed", "늦은 보고", undefined, 4));
    expect(failures()).toEqual(["physics-step-failed"]);
  });

  it("device lost → lost 상태와 failure를 노출하고 엔진 참조를 비운다", async () => {
    const store = createMockLabStore();
    const engine = createMockEngine();
    const factory = createMockEngineFactory({ engine });
    const session = createEngineSession({ loadFactory: async () => factory, decideBackend: async (b) => okDecision(b), physicsProviders: createMockPhysicsProviderFactory(), store });
    const seen: EngineStatus[] = [];
    session.subscribe((status) => seen.push(status));
    await session.select("webgpu", canvasStub());
    engine.emitLost(failVisible("device-lost", "GPU 장치가 손실되었습니다.", undefined, 1));
    expect(session.status()).toMatchObject({ phase: "lost", failure: { code: "device-lost" } });
    expect(session.engine()).toBeNull();
    expect(seen.map((status) => status.phase)).toEqual(["initializing", "ready", "lost"]);
  });

  it("선택이 겹치면 이전 세대 결과를 버리고 이전 엔진을 해제한다", async () => {
    const store = createMockLabStore();
    const first = createMockEngine();
    const second = createMockEngine({ backend: "webgl2" });
    let call = 0;
    const factory: CharacterEngineFactory = async (options) => {
      call += 1;
      if (call === 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100);
        });
        return first;
      }
      expect(options.backend).toBe("webgl2");
      return second;
    };
    const session = createEngineSession({ loadFactory: async () => factory, decideBackend: async (b) => okDecision(b), physicsProviders: createMockPhysicsProviderFactory(), store });
    const firstSelect = session.select("webgpu", canvasStub());
    // 첫 선택이 capability 판정을 지나 느린 factory(100ms)에 들어간 뒤에 두 번째 선택이 겹치게 한다
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toBe(1);
    const secondSelect = session.select("webgl2", canvasStub());
    await secondSelect;
    expect(call).toBe(2);
    expect(session.status()).toMatchObject({ phase: "ready", backend: "webgl2" });
    expect(session.engine()).toBe(second);
    // 늦게 도착한 첫 엔진은 세대가 바뀌었으므로 버리고 해제한다
    await vi.advanceTimersByTimeAsync(150);
    await firstSelect;
    expect(first.disposed).toBe(true);
    expect(session.engine()).toBe(second);
    expect(session.status()).toMatchObject({ phase: "ready", backend: "webgl2" });
    session.dispose();
    expect(second.disposed).toBe(true);
    expect(session.status()).toEqual({ phase: "idle" });
  });

  it("decideBackend 대기 중에 선택이 바뀌면 이전 선택은 factory를 호출하지 않는다", async () => {
    const store = createMockLabStore();
    const factory = createMockEngineFactory();
    const session = createEngineSession({ loadFactory: async () => factory, decideBackend: async (b) => okDecision(b), physicsProviders: createMockPhysicsProviderFactory(), store });
    const firstSelect = session.select("webgpu", canvasStub());
    const secondSelect = session.select("webgl2", canvasStub());
    await Promise.all([firstSelect, secondSelect]);
    expect(factory.calls.map((entry) => entry.backend)).toEqual(["webgl2"]);
    expect(session.status()).toMatchObject({ phase: "ready", backend: "webgl2" });
  });

  it("withTimeout은 제한 시간 안에 끝나지 않으면 failure로 reject한다", async () => {
    const pending = new Promise<number>((resolve) => {
      setTimeout(() => resolve(1), 1000);
    });
    const late: number[] = [];
    const result = withTimeout(pending, 10, () => failVisible("t", "늦음", undefined, 0), (value) => late.push(value));
    // reject 핸들러를 먼저 붙여 두어야 타이머가 돌 때 '처리되지 않은 rejection'으로 잡히지 않는다
    const rejected = expect(result).rejects.toMatchObject({ code: "t" });
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    await vi.advanceTimersByTimeAsync(1000);
    expect(late).toEqual([1]);
  });
});
