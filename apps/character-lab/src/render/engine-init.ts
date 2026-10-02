/**
 * 엔진 초기화 오케스트레이션(순수). Babylon 타입을 모른다 — 구조적 타입으로 timeout·부분 disposer·
 * device lost 신호를 다룬다. babylon/engine-factory.ts가 실제 WebGPUEngine/Engine을 여기에 바인딩한다.
 *
 * 규칙(ADR-0018): 실패는 LabFailure로 reject하고 다른 backend를 시도하지 않는다.
 */
import { ENGINE_BACKEND_LABELS_KO, failVisible, isLabFailure } from "../contracts";

import type { EngineBackend, LabFailure } from "../contracts";

export interface DisposableEngineLike {
  dispose(): void;
}

export interface EngineInitDeps<E extends DisposableEngineLike> {
  readonly backend: EngineBackend;
  /** 동기 생성(생성자 예외도 실패로 본다) */
  create(): E;
  /** 비동기 초기화(WebGPU initAsync). WebGL2는 즉시 resolve */
  init(engine: E): Promise<void>;
  readonly timeoutMs: number;
  /** 부분 초기화된 엔진을 정리하는 disposer(기본: createPartialDisposer) */
  disposer?(engine: E): () => void;
  readonly now?: () => number;
}

export interface EngineInitResult<E> {
  readonly engine: E;
  readonly elapsedMs: number;
}

/**
 * WebGPUEngine.dispose()는 requestDevice 전에 던질 수 있다. 공개 dispose가 완료된 경우만 종료로 보고,
 * 실패하면 사설 device.destroy를 최선으로 호출한다(예외는 흡수, 재throw 금지).
 */
export function createPartialDisposer(engine: DisposableEngineLike): () => void {
  let fullyDisposed = false;
  return () => {
    if (fullyDisposed) return;
    try {
      engine.dispose();
      fullyDisposed = true;
      return;
    } catch {
      // 부분 초기화 상태에서는 사설 매니저가 없어 dispose가 던질 수 있다.
    }
    try {
      const device = Reflect.get(engine, "_device") as { destroy?: () => void } | undefined;
      device?.destroy?.();
    } catch {
      // 초기화 실패 결과가 정리 실패보다 우선한다.
    }
  };
}

export function initFailureCode(backend: EngineBackend): string {
  return backend === "webgpu" ? "webgpu-init-failed" : "webgl2-init-failed";
}

/** 알 수 없는 오류를 backend별 LabFailure로 바꾼다(이미 LabFailure면 그대로). */
export function toInitFailure(backend: EngineBackend, error: unknown, now: number = Date.now()): LabFailure {
  if (isLabFailure(error)) return error;
  const label = ENGINE_BACKEND_LABELS_KO[backend];
  return failVisible(initFailureCode(backend), `${label} 엔진 초기화에 실패했습니다. 자동 전환 없이 중단합니다.`, error, now);
}

/**
 * create → init(timeout) 순서로 엔진을 만든다. timeout·실패 시 부분 disposer로 정리하고 LabFailure로 reject한다.
 * 늦게 도착한 init 성공도 정리한다(세션은 이미 failed 상태).
 */
export async function initializeEngine<E extends DisposableEngineLike>(deps: EngineInitDeps<E>): Promise<EngineInitResult<E>> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  let engine: E;
  try {
    engine = deps.create();
  } catch (error) {
    throw toInitFailure(deps.backend, error, now());
  }
  const dispose = (deps.disposer ?? createPartialDisposer)(engine);
  const label = ENGINE_BACKEND_LABELS_KO[deps.backend];

  return new Promise<EngineInitResult<E>>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      dispose();
      reject(failVisible("engine-init-timeout", `${label} 엔진 초기화가 ${deps.timeoutMs}ms 안에 끝나지 않았습니다.`, undefined, now()));
    }, deps.timeoutMs);
    let initPromise: Promise<void>;
    try {
      initPromise = deps.init(engine);
    } catch (error) {
      initPromise = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    initPromise.then(
      () => {
        if (settled) {
          // timeout 뒤 늦게 성공한 초기화: 자원만 정리한다.
          dispose();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ engine, elapsedMs: now() - started });
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        dispose();
        reject(toInitFailure(deps.backend, error, now()));
      },
    );
  });
}

export interface DeviceLostInfoLike {
  readonly reason?: string | undefined;
  readonly message?: string | undefined;
}

/**
 * WebGPU `device.lost` 또는 WebGL `webglcontextlost`를 LabFailure로 바꿔 onLost에 전달한다.
 * lost는 한 번만 보고한다.
 */
export function createLostReporter(backend: EngineBackend, onLost: (failure: LabFailure) => void, now: () => number = () => Date.now()): (info?: DeviceLostInfoLike) => void {
  let reported = false;
  const label = ENGINE_BACKEND_LABELS_KO[backend];
  return (info) => {
    if (reported) return;
    reported = true;
    const code = backend === "webgpu" ? "webgpu-device-lost" : "webgl2-context-lost";
    const reason = info?.reason ? `(${info.reason})` : "";
    onLost(failVisible(code, `${label} 디바이스가 손실됐습니다${reason}. 엔진을 다시 선택해 주세요(자동 복구 없음).`, info?.message, now()));
  };
}

/** `device.lost` Promise를 lost 보고에 연결한다(구조적 접근, 없으면 아무것도 하지 않는다). */
export function attachDeviceLost(lost: Promise<DeviceLostInfoLike> | undefined, report: (info?: DeviceLostInfoLike) => void): void {
  if (!lost || typeof lost.then !== "function") return;
  lost.then(
    (info) => report(info),
    () => report(undefined),
  );
}
