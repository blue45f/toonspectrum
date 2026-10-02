/**
 * 비전 모델 세션(순수, 로더 주입): 모델별 상태(idle/loading/ready/failed)와 로드된 포트를 보관한다.
 *
 * 무음 대체 금지(ADR-0018): 모델은 한 번만 시도하고 실패하면 사용자가 `retry`를 누를 때까지 failed로 남는다.
 * 같은 모델을 동시에 요청하면 진행 중인 로드를 공유한다. 상태 변화는 onStatus로 보고하며, 패널은
 * imageEmbedder·poseLandmarker 상태를 계약 `vision/status` 이벤트로 올린다.
 * `dispose()`는 진행 중인 로드도 무효화한다: 늦게 끝난 모델은 즉시 해제하고 대기자는 `vision-session-disposed`로 끝난다.
 */
import { failVisible, isLabFailure } from "../../contracts";

import type { HandDetectorPort, LoadedModel, PoseDetectorPort, VisionLoaders, VisionModelKey, VisionModelStatus } from "./vision-ports";
import type { EmbedderPort, LabFailure } from "../../contracts";

export interface VisionSessionDeps {
  readonly loaders: VisionLoaders;
  readonly onStatus?: (key: VisionModelKey, status: VisionModelStatus) => void;
  readonly now?: () => number;
}

export interface VisionSession {
  status(key: VisionModelKey): VisionModelStatus;
  statuses(): Readonly<Record<VisionModelKey, VisionModelStatus>>;
  ensure(key: "imageEmbedder"): Promise<LoadedModel<EmbedderPort>>;
  ensure(key: "poseLandmarker"): Promise<LoadedModel<PoseDetectorPort>>;
  ensure(key: "handLandmarker"): Promise<LoadedModel<HandDetectorPort>>;
  /** 실패한 모델을 사용자 요청으로 다시 시도한다(자동 재시도 없음). */
  retry(key: VisionModelKey): Promise<void>;
  /** 로드된 모델 전부 해제 + idle */
  dispose(): void;
  /** 상태 변화 구독(statuses()는 변화 전까지 같은 참조를 돌려준다) */
  subscribe(listener: () => void): () => void;
}

type AnyLoaded = LoadedModel<EmbedderPort> | LoadedModel<PoseDetectorPort> | LoadedModel<HandDetectorPort>;

export function createVisionSession(deps: VisionSessionDeps): VisionSession {
  const now = deps.now ?? (() => Date.now());
  const statuses: Record<VisionModelKey, VisionModelStatus> = { imageEmbedder: { phase: "idle" }, poseLandmarker: { phase: "idle" }, handLandmarker: { phase: "idle" } };
  /** useSyncExternalStore용 불변 스냅샷(상태가 바뀔 때만 새 객체) */
  let snapshot: Readonly<Record<VisionModelKey, VisionModelStatus>> = { ...statuses };
  const loaded = new Map<VisionModelKey, AnyLoaded>();
  const pending = new Map<VisionModelKey, Promise<AnyLoaded>>();
  const listeners = new Set<() => void>();

  const setStatus = (key: VisionModelKey, status: VisionModelStatus): void => {
    statuses[key] = status;
    snapshot = { ...statuses };
    deps.onStatus?.(key, status);
    for (const listener of [...listeners]) listener();
  };

  const runLoader = (key: VisionModelKey): Promise<AnyLoaded> => {
    switch (key) {
      case "imageEmbedder":
        return deps.loaders.imageEmbedder();
      case "poseLandmarker":
        return deps.loaders.poseLandmarker();
      case "handLandmarker":
        return deps.loaders.handLandmarker();
      default: {
        const exhaustive: never = key;
        return Promise.reject(new Error(`알 수 없는 비전 모델입니다: ${String(exhaustive)}`));
      }
    }
  };

  /** dispose()마다 1 증가. 로드는 시작 시점의 세대를 기억하고, 끝났을 때 세대가 바뀌었으면 폐기된 로드다. */
  let generation = 0;

  const disposedFailure = (key: VisionModelKey, detail?: unknown): LabFailure =>
    failVisible("vision-session-disposed", `비전 세션이 해제되어 ${key} 모델 로드가 취소되었습니다.`, detail, now());

  const load = (key: VisionModelKey): Promise<AnyLoaded> => {
    const ready = loaded.get(key);
    if (ready) return Promise.resolve(ready);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const current = statuses[key];
    if (current.phase === "failed") return Promise.reject(current.failure);
    setStatus(key, { phase: "loading", model: key });
    const startedAt = generation;
    const promise = runLoader(key).then(
      (model) => {
        if (startedAt !== generation) {
          // dispose() 뒤에 끝난 로드: 보관할 세션이 없으니 모델을 해제하고, 상태·pending·loaded(새 로드가 쓸 수 있음)는 건드리지 않는다.
          let disposeError: unknown;
          try {
            model.dispose();
          } catch (error) {
            disposeError = error;
          }
          throw disposedFailure(key, disposeError);
        }
        pending.delete(key);
        loaded.set(key, model);
        setStatus(key, { phase: "ready", model: key, observedSha256: model.observedSha256, pinned: model.pinned, delegate: model.delegate });
        return model;
      },
      (error: unknown) => {
        if (startedAt !== generation) throw disposedFailure(key, error);
        pending.delete(key);
        const failure = isLabFailure(error) ? error : failVisible("vision-model-load-failed", `비전 모델 ${key} 로드에 실패했습니다.`, error, now());
        setStatus(key, { phase: "failed", model: key, failure });
        throw failure;
      },
    );
    pending.set(key, promise);
    return promise;
  };

  const ensure = ((key: VisionModelKey) => load(key)) as VisionSession["ensure"];

  return {
    status: (key) => statuses[key],
    statuses: () => snapshot,
    ensure,
    async retry(key) {
      if (statuses[key].phase === "failed") setStatus(key, { phase: "idle" });
      await load(key).catch(() => undefined);
    },
    dispose() {
      // 세대를 먼저 올려 진행 중인 로드를 무효화한다(끝나는 즉시 모델을 해제하고 상태를 보고하지 않는다).
      // 세션은 dispose 뒤에도 다시 쓸 수 있다(React StrictMode의 effect 정리→재실행).
      generation += 1;
      const models = [...loaded.values()];
      loaded.clear();
      pending.clear();
      for (const key of Object.keys(statuses) as VisionModelKey[]) setStatus(key, { phase: "idle" });
      for (const model of models) model.dispose();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
