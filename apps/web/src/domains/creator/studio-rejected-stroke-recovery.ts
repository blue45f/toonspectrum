/**
 * Rejected-stroke recovery — keeps the geometry of a stroke whose *selected* live provider failed.
 *
 * ADR 0018 forbids automatic renderer substitution: when the selected WebGPU / wet-ink / dynamic /
 * retained-media provider fails mid-stroke or at pointer-up, the same operation must not continue
 * through Canvas2D or Konva, and the failed presentation stays `unavailable`. Until 2026-09-02 the
 * host implemented that by discarding the whole operation — including the CPU-side `DrawEl`
 * (points, pressures, tilts) that was fully intact at that moment. A GPU hiccup therefore deleted
 * finished user work, which the product principle "무손실 입력" does not allow.
 *
 * This module separates the two concerns. The provider failure still cancels the live operation
 * exactly as before (no re-presentation, no promotion to another renderer). The completed geometry
 * is parked here as a recovery record and surfaced in the reliability rail, where the user can
 * **explicitly** restore it as an ordinary document element ("사용자 명시적 선택" — the one form of
 * provider change ADR 0018 permits) or throw it away. Nothing in this module renders anything.
 *
 * React 바인딩은 use-studio-reliability-status.ts가 맡는다. 화면은 최근 원본만 보여 주되
 * 보관 원본을 표시 개수 때문에 버리지 않는다. 문서별 저장 어댑터와 명시적인 복구 명령은
 * 호스트가 등록하므로 이 스토어는 편집기 상태나 데이터베이스를 직접 import하지 않는다.
 */

import { isCompleteStudioDrawOp } from "./brush/studio-draw-completion";

import type { DrawEl } from "./studio-element-model";

/** 상태 레일의 한 번에 보이는 개수다. 복구 원본의 보관 개수를 제한하지 않는다. */
export const STUDIO_REJECTED_STROKE_RECOVERY_LIMIT = 8;

/**
 * Reasons that mean the *user or tool* ended the stroke, not the provider. Those are real
 * cancellations and must stay discards — recording them would resurrect intentionally abandoned
 * marks.
 */
const CANCELLATION_REASONS: ReadonlySet<string> = new Set([
  "cancelled",
  "canonical-commit-cancelled",
  "pointercancel",
]);

export type StudioRejectedStrokeSalvagePlan =
  | {
      readonly action: "discard";
      readonly reason: "no-stroke" | "incomplete-stroke" | "cancelled" | "already-recorded";
    }
  | { readonly action: "salvage"; readonly strokeId: string };

export interface StudioRejectedStrokeSalvageInput {
  readonly stroke: DrawEl | null | undefined;
  /** Provider failure reason (`StudioLiveStrokeUnavailableReason` or a provider outcome reason). */
  readonly reason: string;
  readonly recordedIds: ReadonlySet<string>;
}

/**
 * Decides whether a rejected stroke is worth keeping. Only a complete mark (same rule as history
 * promotion) that the provider — not the user — abandoned, and that is not already recorded.
 */
export function planStudioRejectedStrokeSalvage(
  input: StudioRejectedStrokeSalvageInput,
): StudioRejectedStrokeSalvagePlan {
  const stroke = input.stroke;
  if (!stroke) return { action: "discard", reason: "no-stroke" };
  if (CANCELLATION_REASONS.has(input.reason)) return { action: "discard", reason: "cancelled" };
  if (!isCompleteStudioDrawOp(stroke)) return { action: "discard", reason: "incomplete-stroke" };
  if (input.recordedIds.has(stroke.id)) return { action: "discard", reason: "already-recorded" };
  return { action: "salvage", strokeId: stroke.id };
}

export interface StudioRejectedStrokeRecord {
  /** Equals the rejected stroke's id so a second failure report for the same stroke is a no-op. */
  readonly id: string;
  readonly pageId: string;
  /** The exact CPU-side operation at the moment of rejection. Never mutated. */
  readonly stroke: DrawEl;
  /** Human label of the selected provider that failed ("WebGPU 라이브 잉크", "습식 매체", …). */
  readonly provider: string;
  readonly reason: string;
  readonly at: number;
  /** 계정·프로젝트·문서 경계. 미지정 값은 테스트/비영속 호출 전용이다. */
  readonly scopeKey?: string;
  readonly sourceGeneration?: number;
  /** 다시 열어 복구를 재시도해도 같은 문서 요소가 되도록 처음 보관할 때 고정한다. */
  readonly restoredStrokeId?: string;
  /** provider 준비 대기의 원본. 자동 수락 시 원래 id도 문서 저장 완료 증거가 된다. */
  readonly admissionCheckpoint?: true;
  readonly durability?: "pending" | "saved" | "failed";
  readonly storageError?: string;
}

export interface StudioRejectedStrokePersistence {
  load?(): Promise<readonly StudioRejectedStrokeRecord[]>;
  save(record: StudioRejectedStrokeRecord): Promise<void>;
  delete(record: StudioRejectedStrokeRecord): Promise<void>;
  /** 복구 원본은 문서의 영속 저장이 확인된 경우에만 제거한다. */
  confirmRestored(record: StudioRejectedStrokeRecord): Promise<boolean | void>;
}

export type StudioRejectedStrokeRestoreOutcome =
  | { readonly status: "restored"; readonly recordId: string; readonly restoredStrokeId: string }
  | {
      readonly status: "refused";
      readonly recordId: string;
      /** Human-readable reason (e.g. the record belongs to another page). */
      readonly reason: string;
    }
  | { readonly status: "unavailable"; readonly recordId: string };

/**
 * Host-registered restore step. It receives the record and must commit the geometry through the
 * ordinary document path (never through the failed provider). Returning `refused` keeps the record.
 */
export type StudioRejectedStrokeRestorer = (
  record: StudioRejectedStrokeRecord,
) => Exclude<StudioRejectedStrokeRestoreOutcome, { status: "unavailable" }>;

let allRecords: readonly StudioRejectedStrokeRecord[] = Object.freeze([]);
let records: readonly StudioRejectedStrokeRecord[] = Object.freeze([]);
let activeScopeKey: string | undefined;
let storageError: string | null = null;
const hiddenRestoredRecords = new Set<string>();
const pendingAdmissionRecords = new Set<string>();
const dismissedRecords = new Set<string>();
const persistenceByScope = new Map<string, StudioRejectedStrokePersistence>();
let resetGeneration = 0;
let restorer: StudioRejectedStrokeRestorer | null = null;
const listeners = new Set<() => void>();

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

/**
 * The live `DrawEl` keeps receiving pointer samples and post-correction writes after the rejection
 * is announced (the discard runs in a later microtask), and a restorer must not be able to edit the
 * parked geometry either. Snapshot the serialisable element and freeze every nested array.
 */
export function snapshotStudioRejectedStroke(stroke: DrawEl): DrawEl {
  return deepFreeze(structuredClone(stroke));
}

function publish(): void {
  records = Object.freeze(allRecords.filter((record) => (
    record.scopeKey === activeScopeKey && !hiddenRestoredRecords.has(recordKey(record))
      && !pendingAdmissionRecords.has(recordKey(record))
  )));
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Subscriber isolation — one failing listener must not hide the notice from the others.
    }
  }
}

function recordKey(record: Pick<StudioRejectedStrokeRecord, "scopeKey" | "id">): string {
  return JSON.stringify([record.scopeKey ?? null, record.id]);
}

function persistenceFor(record: StudioRejectedStrokeRecord): StudioRejectedStrokePersistence | undefined {
  return record.scopeKey === undefined ? undefined : persistenceByScope.get(record.scopeKey);
}

function updateDurability(record: StudioRejectedStrokeRecord, error?: unknown): void {
  const key = recordKey(record);
  // 저장 완료 전에 복구를 눌렀더라도 저장 실패를 숨기지 않는다. 원본을 다시 보여 준다.
  if (error !== undefined) hiddenRestoredRecords.delete(key);
  allRecords = Object.freeze(allRecords.map((candidate) => recordKey(candidate) === key
    ? Object.freeze({
        ...candidate,
        durability: error === undefined ? "saved" as const : "failed" as const,
        storageError: error === undefined ? undefined : "복구 원본을 기기에 저장하지 못했습니다. 탭을 닫기 전에 획을 복구해 주세요.",
      })
    : candidate));
  publish();
}

/** 문서 변경 뒤 늦게 도착한 읽기는 호출자가 세대 토큰을 확인하고 이 경계에 전달한다. */
export function hydrateStudioRejectedStrokeRecords(
  scopeKey: string,
  recovered: readonly StudioRejectedStrokeRecord[],
): void {
  const existing = new Set(allRecords.map(recordKey));
  const accepted = recovered.filter((record) => record.scopeKey === scopeKey
    && !existing.has(recordKey(record)) && !dismissedRecords.has(recordKey(record)));
  if (accepted.length === 0) return;
  allRecords = Object.freeze([...allRecords, ...accepted].sort((left, right) => right.at - left.at));
  publish();
}

export function activateStudioRejectedStrokeRecovery(
  scopeKey: string,
  persistence: StudioRejectedStrokePersistence,
): () => void {
  activeScopeKey = scopeKey;
  storageError = null;
  persistenceByScope.set(scopeKey, persistence);
  publish();
  return () => {
    // 이전 문서의 이미 시작된 실패 처리도 원래 저장소를 사용해야 하므로 어댑터는 유지한다.
    if (activeScopeKey === scopeKey && persistenceByScope.get(scopeKey) === persistence) {
      activeScopeKey = undefined;
      storageError = null;
      publish();
    }
  };
}

export function setStudioRejectedStrokeStorageError(scopeKey: string, message: string | null): void {
  if (activeScopeKey !== scopeKey) return;
  storageError = message;
  publish();
}

export function getStudioRejectedStrokeStorageError(): string | null {
  return storageError;
}

export function retryStudioRejectedStrokeStorage(): void {
  const scopeKey = activeScopeKey;
  const persistence = scopeKey === undefined ? undefined : persistenceByScope.get(scopeKey);
  if (!scopeKey || !persistence?.load) return;
  void persistence.load().then((recovered) => {
    if (activeScopeKey !== scopeKey || persistenceByScope.get(scopeKey) !== persistence) return;
    storageError = null;
    hydrateStudioRejectedStrokeRecords(scopeKey, recovered);
    publish();
  }).catch(() => {
    setStudioRejectedStrokeStorageError(scopeKey, "획 복구 원본을 아직 읽지 못했습니다. 원본은 삭제하지 않았습니다.");
  });
}

export function retryStudioRejectedStrokePersistence(id: string): void {
  const record = records.find((candidate) => candidate.id === id);
  const persistence = record && persistenceFor(record);
  if (!record || !persistence) return;
  const generation = resetGeneration;
  void persistence.save(record).then(
    () => { if (generation === resetGeneration) updateDurability(record); },
    (error: unknown) => { if (generation === resetGeneration) updateDurability(record, error); },
  );
}

export function subscribeStudioRejectedStrokeRecovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Newest first. The array identity only changes when the records change (useSyncExternalStore). */
export function getStudioRejectedStrokeRecords(): readonly StudioRejectedStrokeRecord[] {
  return records;
}

export function studioRejectedStrokeRecordIds(): ReadonlySet<string> {
  return new Set(allRecords.filter((record) => record.scopeKey === activeScopeKey).map((record) => record.id));
}

/**
 * 실패 획을 문서·획 식별자별로 한 번만 보관한다. 표시 한도와 무관하게 원본을 유지하고
 * 호출자가 취소와 복구 가능 안내를 구분할 수 있도록 수락 결과를 돌려준다.
 */
export function recordStudioRejectedStroke(input: {
  readonly stroke: DrawEl | null | undefined;
  readonly pageId: string;
  readonly provider: string;
  readonly reason: string;
  readonly at?: number;
  readonly scopeKey?: string;
  readonly sourceGeneration?: number;
  readonly restoredStrokeId?: string;
  readonly admissionCheckpoint?: true;
}): StudioRejectedStrokeSalvagePlan {
  const plan = planStudioRejectedStrokeSalvage({
    stroke: input.stroke,
    reason: input.reason,
    recordedIds: new Set(allRecords.filter((record) => record.scopeKey === input.scopeKey).map((record) => record.id)),
  });
  if (plan.action !== "salvage" || !input.stroke) {
    if (plan.action === "discard" && plan.reason === "already-recorded" && !input.admissionCheckpoint && input.stroke) {
      const pending = allRecords.find((record) => record.scopeKey === input.scopeKey
        && record.id === input.stroke?.id && record.admissionCheckpoint);
      if (pending) {
        // 자동 수락 뒤 provider가 실패해도 이미 보관한 원본을 다시 복구 목록에 노출한다.
        releaseStudioPendingStrokeCheckpoint(pending.scopeKey, pending.id, false);
        return { action: "salvage", strokeId: pending.id };
      }
    }
    return plan;
  }
  const record: StudioRejectedStrokeRecord = Object.freeze({
    id: input.stroke.id,
    pageId: input.pageId,
    stroke: snapshotStudioRejectedStroke(input.stroke),
    provider: input.provider,
    reason: input.reason,
    at: input.at ?? Date.now(),
    ...(input.admissionCheckpoint ? { admissionCheckpoint: true as const } : {}),
    ...(input.scopeKey === undefined ? {} : {
      scopeKey: input.scopeKey,
      sourceGeneration: input.sourceGeneration,
      restoredStrokeId: input.restoredStrokeId,
      durability: "pending" as const,
    }),
  });
  allRecords = Object.freeze([record, ...allRecords]);
  publish();
  const persistence = persistenceFor(record);
  if (persistence) {
    const generation = resetGeneration;
    void persistence.save(record).then(
      () => { if (generation === resetGeneration) updateDurability(record); },
      (error: unknown) => { if (generation === resetGeneration) updateDurability(record, error); },
    );
  }
  return plan;
}

/** 완성된 미준비 입력은 즉시 기존 저널에 기록하며 현재 세션의 자동 수락과 중복 복구를 막는다. */
export function checkpointStudioPendingStroke(input: Parameters<typeof recordStudioRejectedStroke>[0]): void {
  if (!input.stroke) return;
  const key = recordKey({ scopeKey: input.scopeKey, id: input.stroke.id });
  pendingAdmissionRecords.add(key);
  const result = recordStudioRejectedStroke({ ...input, admissionCheckpoint: true });
  if (result.action !== "salvage" && result.reason !== "already-recorded") pendingAdmissionRecords.delete(key);
}

export function hasUnpersistedStudioPendingStrokeCheckpoints(): boolean {
  return allRecords.some((record) => record.admissionCheckpoint && record.durability !== "saved");
}

/** 수락 자체는 저장이 아니다. 같은 문서의 autosave가 원래/복구 id를 포함할 때만 제거한다. */
export function releaseStudioPendingStrokeCheckpoint(scopeKey: string | undefined, strokeId: string, accepted: boolean): void {
  const record = allRecords.find((candidate) => candidate.scopeKey === scopeKey && candidate.id === strokeId);
  if (!record?.admissionCheckpoint) return;
  const key = recordKey(record);
  pendingAdmissionRecords.delete(key);
  if (!accepted) { hiddenRestoredRecords.delete(key); publish(); return; }
  hiddenRestoredRecords.add(key);
  publish();
  const persistence = persistenceFor(record);
  if (!persistence) return;
  const generation = resetGeneration;
  void persistence.confirmRestored(record).then((durable) => {
    if (generation !== resetGeneration || durable !== true) return;
    allRecords = Object.freeze(allRecords.filter((candidate) => recordKey(candidate) !== key));
    hiddenRestoredRecords.delete(key);
    dismissedRecords.add(key);
    publish();
  }).catch((error: unknown) => { if (generation === resetGeneration) updateDurability(record, error); });
}

export function dismissStudioRejectedStroke(id: string): void {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) return;
  const generation = resetGeneration;
  const key = recordKey(record);
  dismissedRecords.add(key);
  const remove = () => {
    if (generation !== resetGeneration) return;
    allRecords = Object.freeze(allRecords.filter((candidate) => recordKey(candidate) !== key));
    hiddenRestoredRecords.delete(key);
    publish();
  };
  const persistence = persistenceFor(record);
  if (!persistence) remove();
  else void persistence.delete(record).then(remove, (error: unknown) => {
    if (generation !== resetGeneration) return;
    dismissedRecords.delete(key);
    updateDurability(record, error);
  });
}

/** Registers (or clears with `null`) the editor-owned restore step. Returns an unregister function. */
export function setStudioRejectedStrokeRestorer(
  next: StudioRejectedStrokeRestorer | null,
): () => void {
  restorer = next;
  return () => {
    if (restorer === next) restorer = null;
  };
}

/**
 * Explicit user action from the rail. The record is removed only when the restorer reports success;
 * a refusal (wrong page, read-only document) keeps it so the user can retry after switching context.
 */
export function restoreStudioRejectedStroke(id: string): StudioRejectedStrokeRestoreOutcome {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) return { status: "refused", recordId: id, reason: "복구 레코드가 이미 사라졌습니다." };
  if (!restorer) return { status: "unavailable", recordId: id };
  const outcome = restorer(record);
  if (outcome.status === "restored") {
    const persistence = persistenceFor(record);
    if (!persistence) dismissStudioRejectedStroke(id);
    else {
      const generation = resetGeneration;
      hiddenRestoredRecords.add(recordKey(record));
      publish();
      // 큐 수락은 영속 저장 증거가 아니다. 저장 전 새로고침해도 원본과 복구 ID를 재사용한다.
      void persistence.confirmRestored(record).then((durable) => {
        if (generation !== resetGeneration || durable !== true) return;
        const key = recordKey(record);
        allRecords = Object.freeze(allRecords.filter((candidate) => recordKey(candidate) !== key));
        hiddenRestoredRecords.delete(key);
        dismissedRecords.add(key);
        publish();
      }).catch((error: unknown) => {
        if (generation !== resetGeneration) return;
        hiddenRestoredRecords.delete(recordKey(record));
        updateDurability(record, error);
      });
    }
  }
  return outcome;
}

/** Test isolation. */
export function resetStudioRejectedStrokeRecovery(): void {
  records = Object.freeze([]);
  allRecords = Object.freeze([]);
  activeScopeKey = undefined;
  storageError = null;
  hiddenRestoredRecords.clear();
  pendingAdmissionRecords.clear();
  dismissedRecords.clear();
  persistenceByScope.clear();
  resetGeneration += 1;
  restorer = null;
  listeners.clear();
}
