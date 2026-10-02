/**
 * 엔진 세션: backend 선택 → capability 판정 → 엔진 모듈 로드 → 엔진 생성 → 상태 노출.
 *
 * 무음 대체 금지(ADR-0018): 요청한 backend 하나만 시도하고 차단·실패·timeout·device lost를
 * EngineStatus(failed|lost)로 노출한다. WebGPU 실패 후 WebGL2 자동 생성은 없다(사용자 클릭만).
 * 동적 import는 여기 없고 composition이 `loadFactory`로 주입한다(render 모듈 부재 시에도 typecheck 통과).
 */
import { ENGINE_INIT_TIMEOUT_MS, failVisible, isLabFailure } from "../../contracts";

import type {
  BackendDecision,
  CharacterEngine,
  CharacterEngineFactory,
  CharacterSource,
  EngineBackend,
  EngineSession,
  EngineStatus,
  LabFailure,
  LabStore,
  PhysicsProviderFactory,
  SourceCapabilities,
} from "../../contracts";

export interface EngineSessionDeps {
  /** 단 하나의 `import("../../render/babylon-character-engine")`는 composition에 있다. */
  readonly loadFactory: () => Promise<CharacterEngineFactory>;
  /** render/capability의 probeGpu + selectBackend. 요청 backend만 판정한다. */
  readonly decideBackend: (backend: EngineBackend) => Promise<BackendDecision>;
  readonly physicsProviders: PhysicsProviderFactory;
  readonly store: Pick<LabStore, "applyEvent">;
  readonly initTimeoutMs?: number;
  readonly now?: () => number;
}

/** 지정 시간 안에 끝나지 않으면 failure로 reject. 늦게 도착한 값은 onLate로 넘긴다. */
export function withTimeout<T>(promise: Promise<T>, ms: number, makeFailure: () => LabFailure, onLate?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      promise.then(
        (value) => onLate?.(value),
        () => undefined,
      );
      reject(makeFailure());
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error || isLabFailure(error) ? error : new Error(String(error)));
      },
    );
  });
}

export function createEngineSession(deps: EngineSessionDeps): EngineSession {
  const now = deps.now ?? (() => Date.now());
  const timeoutMs = deps.initTimeoutMs ?? ENGINE_INIT_TIMEOUT_MS;
  const listeners = new Set<(status: EngineStatus) => void>();
  let status: EngineStatus = { phase: "idle" };
  let engine: CharacterEngine | null = null;
  let generation = 0;
  let factoryPromise: Promise<CharacterEngineFactory> | null = null;

  const setStatus = (next: EngineStatus): void => {
    status = next;
    deps.store.applyEvent({ type: "engine/status", status: next });
    for (const listener of listeners) listener(next);
  };

  const toFailure = (code: string, reasonKo: string, error: unknown): LabFailure =>
    isLabFailure(error) ? error : failVisible(code, reasonKo, error, now());

  const safeDispose = (target: CharacterEngine, context: string): void => {
    try {
      target.dispose();
    } catch (error) {
      deps.store.applyEvent({ type: "failure", failure: failVisible("engine-dispose-failed", `${context} 중 엔진 해제 오류가 났습니다.`, error, now()) });
    }
  };

  const disposeCurrent = (context: string): void => {
    if (!engine) return;
    const current = engine;
    engine = null;
    safeDispose(current, context);
  };

  const select = async (backend: EngineBackend, canvas: HTMLCanvasElement): Promise<void> => {
    generation += 1;
    const myGeneration = generation;
    const stale = (): boolean => myGeneration !== generation;
    disposeCurrent("엔진 교체");
    setStatus({ phase: "initializing", backend });

    let decision: BackendDecision;
    try {
      decision = await deps.decideBackend(backend);
    } catch (error) {
      if (stale()) return;
      setStatus({ phase: "failed", backend, failure: toFailure("backend-probe-failed", "GPU 능력 조회 중 오류가 났습니다.", error) });
      return;
    }
    if (stale()) return;
    if (!decision.ok) {
      setStatus({ phase: "failed", backend, failure: failVisible(decision.code, decision.reasonKo, undefined, now()) });
      return;
    }

    let factory: CharacterEngineFactory;
    try {
      factoryPromise ??= deps.loadFactory();
      factory = await factoryPromise;
    } catch (error) {
      factoryPromise = null;
      if (stale()) return;
      setStatus({ phase: "failed", backend, failure: toFailure("engine-module-load-failed", "렌더 엔진 모듈을 불러오지 못했습니다.", error) });
      return;
    }
    if (stale()) return;

    const onLost = (failure: LabFailure): void => {
      if (stale()) return;
      engine = null;
      setStatus({ phase: "lost", backend, failure });
    };

    let created: CharacterEngine;
    try {
      created = await withTimeout(
        factory({ canvas, backend, initTimeoutMs: timeoutMs, physicsProviders: deps.physicsProviders, onLost }),
        timeoutMs,
        () => failVisible("engine-init-timeout", `엔진 초기화가 ${timeoutMs}ms 안에 끝나지 않았습니다.`, undefined, now()),
        (late) => safeDispose(late, "timeout 후 늦게 생성된 엔진 정리"),
      );
    } catch (error) {
      if (stale()) return;
      setStatus({ phase: "failed", backend, failure: toFailure("engine-init-failed", "엔진 초기화에 실패했습니다.", error) });
      return;
    }
    if (stale()) {
      safeDispose(created, "선택이 바뀐 뒤 도착한 엔진 정리");
      return;
    }
    engine = created;
    setStatus({ phase: "ready", backend, diagnostics: created.diagnostics });
  };

  const reloadSource = async (source: CharacterSource): Promise<SourceCapabilities | null> => {
    if (!engine) return null;
    try {
      return await engine.loadSource(source);
    } catch (error) {
      deps.store.applyEvent({ type: "failure", failure: toFailure("source-load-failed", "캐릭터 소스를 엔진에 올리지 못했습니다.", error) });
      return null;
    }
  };

  return {
    select,
    status: () => status,
    engine: () => engine,
    reloadSource,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      generation += 1;
      disposeCurrent("세션 종료");
      setStatus({ phase: "idle" });
      listeners.clear();
    },
  };
}
