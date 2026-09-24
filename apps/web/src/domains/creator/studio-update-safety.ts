export type StudioUpdateUnsafeReason =
  | "unsaved-work"
  | "save-in-progress"
  | "sync-pending"
  | "multiple";

export interface StudioUpdateSafetySourceSnapshot {
  readonly safe: boolean;
  readonly reason?: Exclude<StudioUpdateUnsafeReason, "multiple">;
  readonly message?: string;
  readonly pendingCount?: number;
}

export interface StudioUpdateSafetySnapshot {
  readonly safe: boolean;
  readonly reason: StudioUpdateUnsafeReason | null;
  readonly message: string;
  readonly pendingCount: number;
  readonly sourceCount: number;
}

type StudioUpdateSafetyEvaluator = () => StudioUpdateSafetySourceSnapshot;
type StudioUpdateSafetyListener = (snapshot: StudioUpdateSafetySnapshot) => void;

interface StudioUpdateSafetyRegistry {
  readonly sources: Map<string, StudioUpdateSafetyEvaluator>;
  readonly listeners: Set<StudioUpdateSafetyListener>;
}

const REGISTRY_KEY = "__toonspectrumStudioUpdateSafetyV1";

function registry(): StudioUpdateSafetyRegistry {
  const root = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: StudioUpdateSafetyRegistry;
  };
  root[REGISTRY_KEY] ??= {
    sources: new Map(),
    listeners: new Set(),
  };
  return root[REGISTRY_KEY];
}

function normalizePendingCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function evaluateSource(evaluate: StudioUpdateSafetyEvaluator): StudioUpdateSafetySourceSnapshot {
  try {
    const value = evaluate();
    return value && typeof value === "object"
      ? value
      : { safe: false, reason: "unsaved-work", message: "작업 상태를 확인하지 못했습니다." };
  } catch {
    return {
      safe: false,
      reason: "unsaved-work",
      message: "작업 상태를 확인하지 못했습니다. 저장 후 다시 시도해 주세요.",
    };
  }
}

export function getStudioUpdateSafetySnapshot(): StudioUpdateSafetySnapshot {
  const values = [...registry().sources.values()].map(evaluateSource);
  const unsafe = values.filter((value) => !value.safe);
  if (unsafe.length === 0) {
    return {
      safe: true,
      reason: null,
      message: "업데이트를 적용해도 안전합니다.",
      pendingCount: 0,
      sourceCount: values.length,
    };
  }
  const reasons = new Set(unsafe.map((value) => value.reason ?? "unsaved-work"));
  const pendingCount = unsafe.reduce(
    (total, value) => total + normalizePendingCount(value.pendingCount),
    0,
  );
  const firstMessage = unsafe.find((value) => value.message?.trim())?.message?.trim();
  return {
    safe: false,
    reason: reasons.size > 1 ? "multiple" : [...reasons][0] ?? "unsaved-work",
    message: firstMessage
      ?? (pendingCount > 0
        ? `서버 반영을 기다리는 변경 ${pendingCount.toLocaleString("ko-KR")}개가 있습니다.`
        : "아직 저장되지 않은 작업이 있습니다. 저장이 끝난 뒤 업데이트해 주세요."),
    pendingCount,
    sourceCount: values.length,
  };
}

function notify(): void {
  const current = registry();
  const snapshot = getStudioUpdateSafetySnapshot();
  for (const listener of current.listeners) listener(snapshot);
}

/** Registers one live evaluator; the prompt re-evaluates it rather than trusting stale React state. */
export function registerStudioUpdateSafetySource(
  sourceId: string,
  evaluate: StudioUpdateSafetyEvaluator,
): () => void {
  const id = sourceId.trim();
  if (!id) throw new TypeError("Studio update safety source id is required.");
  const current = registry();
  current.sources.set(id, evaluate);
  notify();
  return () => {
    if (current.sources.get(id) !== evaluate) return;
    current.sources.delete(id);
    notify();
  };
}

export function subscribeStudioUpdateSafety(
  listener: StudioUpdateSafetyListener,
): () => void {
  const current = registry();
  current.listeners.add(listener);
  listener(getStudioUpdateSafetySnapshot());
  return () => current.listeners.delete(listener);
}

/** Explicit refresh for ref-backed state that can become durable without a React render. */
export function refreshStudioUpdateSafety(): StudioUpdateSafetySnapshot {
  const snapshot = getStudioUpdateSafetySnapshot();
  for (const listener of registry().listeners) listener(snapshot);
  return snapshot;
}

/** Test-only reset; intentionally not used by product code. */
export function resetStudioUpdateSafetyForTest(): void {
  const current = registry();
  current.sources.clear();
  current.listeners.clear();
}
