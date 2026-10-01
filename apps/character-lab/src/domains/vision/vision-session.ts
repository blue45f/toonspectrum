/**
 * 비전 모델 세션(순수, 로더 주입): 모델별 상태(idle/loading/ready/failed)와 로드된 포트를 보관한다.
 *
 * 무음 대체 금지(ADR-0018): 모델은 한 번만 시도하고 실패하면 사용자가 `retry`를 누를 때까지 failed로 남는다.
 * 같은 모델을 동시에 요청하면 진행 중인 로드를 공유한다. 상태 변화는 onStatus로 보고하며, 패널은
 * imageEmbedder·poseLandmarker 상태를 계약 `vision/status` 이벤트로 올린다.
 */
import { failVisible, isLabFailure } from "../../contracts";

import type { HandDetectorPort, LoadedModel, PoseDetectorPort, VisionLoaders, VisionModelKey, VisionModelStatus } from "./vision-ports";
import type { EmbedderPort } from "../../contracts";

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

  const load = (key: VisionModelKey): Promise<AnyLoaded> => {
    const ready = loaded.get(key);
    if (ready) return Promise.resolve(ready);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const current = statuses[key];
    if (current.phase === "failed") return Promise.reject(current.failure);
    setStatus(key, { phase: "loading", model: key });
    const promise = runLoader(key).then(
      (model) => {
        pending.delete(key);
        loaded.set(key, model);
        setStatus(key, { phase: "ready", model: key, observedSha256: model.observedSha256, pinned: model.pinned, delegate: model.delegate });
        return model;
      },
      (error: unknown) => {
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
      for (const model of loaded.values()) model.dispose();
      loaded.clear();
      pending.clear();
      for (const key of Object.keys(statuses) as VisionModelKey[]) setStatus(key, { phase: "idle" });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
