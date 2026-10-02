import {
  cancelEnrollment,
  enrollClass,
  getActiveEnrollment,
  getClassProduct,
  type ClassEnrollmentState,
} from "./learning-classes";

/**
 * 클래스 수강 등록이 활동 포인트 지갑과 만나는 유일한 지점.
 *
 * 지갑의 정본은 M-4 에셋 포인트다(브랜치 feat/asset-points-2026-10-02,
 * 팁 1137b3a4에서 대조 완료). 이 어댑터는 그 계약을 그대로 미러링해
 * 같은 지갑을 읽고 쓴다:
 * - 스토리지 키: `toonstudio-asset-points-v1` (M-4의 ASSET_POINTS_STORAGE_KEY)
 * - 저장 형태: zustand persist 봉투 `{ state: { events, nextSeq }, version: 0 }`
 * - 원장: append-only 이벤트(earn/spend/spend_refund), ID는 `ape_000001` 순번,
 *   스토어와 같은 최근 1,000개 유지 규칙
 * - 잔액: 만료(365일)가 가까운 적립 lot부터 소진하는 재생 계산
 * - 차감 거부 사유: already-owned / insufficient (M-4의 SpendRejection과 동일)
 *
 * ⚠️ 일원화 지점: M-4가 병합되면 이 파일의 저장소 접근·잔액 계산을 지우고
 * 공개 경계 `@/domains/account/public/asset-points`만 import한다(내부 파일
 * 직접 import는 아키텍처 경계 규칙 위반). 대응 관계:
 * - readPointBalance → readAssetPointBalance()
 * - computePointBalance → computeBalance(events, now)
 * - spendPointsForClass → useAssetPointsStore.getState().spendForResource({ resourceId: class:<id>, resourceName, pointPrice })
 * - refundClassPoints → useAssetPointsStore.getState().refundSpend(spendEventId)
 * - ASSET_POINTS_STORAGE_KEY → 같은 이름의 공개 상수
 * `enrollInClass`·`cancelClassEnrollment`의 결과 타입은 호출부 계약이라 유지한다.
 *
 * 충전(현금→포인트 구매) 경로는 정책상 존재하지 않는다. 포인트는 활동
 * 적립으로만 쌓이고, 이 모듈은 잔액 확인·차감·환불만 한다.
 */

/** M-4 지갑 스토어와 같은 localStorage 키. 병합 시 M-4 상수를 그대로 쓴다. */
export const ASSET_POINTS_STORAGE_KEY = "toonstudio-asset-points-v1";

/** M-4 정책(ASSET_POINT_EXPIRY_DAYS)과 같은 포인트 유효기간(일). */
export const POINT_EXPIRY_DAYS = 365;

export type PointsStorage = Pick<Storage, "getItem" | "setItem"> | null;

export type PointLedgerEventKind = "earn" | "spend" | "spend_refund";

/** M-4의 AssetPointEvent와 같은 형태의 원장 이벤트. */
export interface PointLedgerEvent {
  readonly id: string;
  readonly kind: PointLedgerEventKind;
  /** 항상 양수. 증감 방향은 kind가 정한다. */
  readonly amount: number;
  readonly activityKey?: string;
  readonly sourceRef?: string;
  readonly resourceId?: string;
  readonly resourceName?: string;
  readonly spendEventId?: string;
  readonly occurredAt: string;
  readonly expiresAt?: string;
}

interface PointLedger {
  readonly events: readonly PointLedgerEvent[];
  readonly nextSeq: number;
}

const EMPTY_LEDGER: PointLedger = { events: [], nextSeq: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LEDGER_RAW_LENGTH = 2_000_000;
const MAX_EVENT_FIELD_LENGTH = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_EVENT_FIELD_LENGTH
    ? value
    : undefined;
}

function parseLedgerEvent(value: unknown): PointLedgerEvent | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "earn" && value.kind !== "spend" && value.kind !== "spend_refund") return null;
  const id = optionalText(value.id);
  const occurredAt = optionalText(value.occurredAt);
  if (!id || !occurredAt) return null;
  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0) return null;
  return {
    id,
    kind: value.kind,
    amount: value.amount,
    activityKey: optionalText(value.activityKey),
    sourceRef: optionalText(value.sourceRef),
    resourceId: optionalText(value.resourceId),
    resourceName: optionalText(value.resourceName),
    spendEventId: optionalText(value.spendEventId),
    occurredAt,
    expiresAt: optionalText(value.expiresAt),
  };
}

function eventSeq(id: string): number {
  const match = /^ape_(\d+)$/.exec(id);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function nextEventId(seq: number): string {
  return `ape_${seq.toString().padStart(6, "0")}`;
}

/** 저장된 지갑 원장은 신뢰하지 않는다 — zustand persist 봉투만 인정하고 깨진 이벤트는 버린다. */
export function parsePointLedger(raw: string | null): PointLedger {
  if (!raw || raw.length > MAX_LEDGER_RAW_LENGTH) return EMPTY_LEDGER;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return EMPTY_LEDGER; }
  if (!isRecord(value) || !isRecord(value.state) || !Array.isArray(value.state.events)) return EMPTY_LEDGER;
  const events = value.state.events
    .map(parseLedgerEvent)
    .filter((event): event is PointLedgerEvent => event !== null);
  const storedSeq = value.state.nextSeq;
  const seqFromState = typeof storedSeq === "number" && Number.isInteger(storedSeq) && storedSeq >= 1
    ? storedSeq
    : 1;
  const seqFromEvents = events.reduce((max, event) => Math.max(max, eventSeq(event.id) + 1), 1);
  return { events, nextSeq: Math.max(seqFromState, seqFromEvents) };
}

function loadPointLedger(storage: PointsStorage): PointLedger {
  if (!storage) return EMPTY_LEDGER;
  try { return parsePointLedger(storage.getItem(ASSET_POINTS_STORAGE_KEY)); }
  catch { return EMPTY_LEDGER; }
}

/** M-4 스토어의 MAX_EVENTS와 같은 원장 유지 상한. 오래된 이벤트부터 버린다. */
const MAX_LEDGER_EVENTS = 1000;

function savePointLedger(storage: PointsStorage, ledger: PointLedger): boolean {
  if (!storage) return false;
  try {
    const events = ledger.events.length > MAX_LEDGER_EVENTS
      ? ledger.events.slice(ledger.events.length - MAX_LEDGER_EVENTS)
      : ledger.events;
    storage.setItem(
      ASSET_POINTS_STORAGE_KEY,
      JSON.stringify({ state: { events, nextSeq: ledger.nextSeq }, version: 0 }),
    );
    return true;
  } catch {
    return false;
  }
}

interface PointLot {
  remaining: number;
  readonly expiresAtMs: number;
}

function replayLots(events: readonly PointLedgerEvent[], untilMs: number): PointLot[] {
  const ordered = [...events]
    .filter((event) => new Date(event.occurredAt).getTime() <= untilMs)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const lots: PointLot[] = [];
  for (const event of ordered) {
    const atMs = new Date(event.occurredAt).getTime();
    if (event.kind === "earn" || event.kind === "spend_refund") {
      const expiresAtMs = event.expiresAt
        ? new Date(event.expiresAt).getTime()
        : atMs + POINT_EXPIRY_DAYS * DAY_MS;
      lots.push({ remaining: event.amount, expiresAtMs });
      continue;
    }
    // spend: 만료가 가까운 lot부터 소진한다. 그 시점에 이미 만료된 lot은 쓸 수 없다.
    let left = event.amount;
    const usable = lots
      .filter((lot) => lot.remaining > 0 && lot.expiresAtMs > atMs)
      .sort((a, b) => a.expiresAtMs - b.expiresAtMs);
    for (const lot of usable) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      lot.remaining -= take;
      left -= take;
    }
  }
  return lots;
}

/** now 시점의 사용 가능 잔액. 만료된 lot은 제외한다. (M-4 computeBalance와 같은 규칙) */
export function computePointBalance(events: readonly PointLedgerEvent[], now: Date): number {
  const nowMs = now.getTime();
  return replayLots(events, nowMs)
    .filter((lot) => lot.expiresAtMs > nowMs)
    .reduce((sum, lot) => sum + lot.remaining, 0);
}

export function readPointBalance(storage: PointsStorage, now: Date = new Date()): number {
  return computePointBalance(loadPointLedger(storage).events, now);
}

/** 클래스 차감을 지갑 원장에서 찾는 리소스 ID. 에셋 구매와 같은 규칙을 쓴다. */
export function classPointResourceId(classId: string): string {
  return `class:${classId}`;
}

function findUnrefundedClassSpend(
  events: readonly PointLedgerEvent[],
  classId: string,
): PointLedgerEvent | null {
  const resourceId = classPointResourceId(classId);
  const refundedSpendIds = new Set(
    events
      .filter((event) => event.kind === "spend_refund" && event.spendEventId)
      .map((event) => event.spendEventId as string),
  );
  return events.find(
    (event) => event.kind === "spend" && event.resourceId === resourceId && !refundedSpendIds.has(event.id),
  ) ?? null;
}

export type ClassPointSpendResult =
  | { readonly ok: true; readonly eventId: string | null; readonly balanceAfter: number }
  | {
      readonly ok: false;
      readonly reason: "insufficient" | "already-owned" | "storage-unavailable";
      readonly balance: number;
      /** already-owned일 때 기존 차감 이벤트 ID. 등록 기록 복구에 쓴다. */
      readonly existingEventId?: string;
    };

/**
 * 클래스 등록용 포인트 차감.
 * 무료(0P)는 원장에 이벤트를 남기지 않는다. 잔액이 부족하면 차감하지 않는다.
 */
export function spendPointsForClass(
  storage: PointsStorage,
  input: {
    readonly classId: string;
    readonly classTitle: string;
    readonly pointPrice: number;
    readonly now?: Date;
  },
): ClassPointSpendResult {
  const now = input.now ?? new Date();
  const ledger = loadPointLedger(storage);
  const balance = computePointBalance(ledger.events, now);
  if (input.pointPrice <= 0) return { ok: true, eventId: null, balanceAfter: balance };
  if (!storage) return { ok: false, reason: "storage-unavailable", balance };
  const existing = findUnrefundedClassSpend(ledger.events, input.classId);
  if (existing) {
    return { ok: false, reason: "already-owned", balance, existingEventId: existing.id };
  }
  if (balance < input.pointPrice) return { ok: false, reason: "insufficient", balance };
  const event: PointLedgerEvent = {
    id: nextEventId(ledger.nextSeq),
    kind: "spend",
    amount: input.pointPrice,
    resourceId: classPointResourceId(input.classId),
    resourceName: input.classTitle,
    occurredAt: now.toISOString(),
  };
  if (!savePointLedger(storage, { events: [...ledger.events, event], nextSeq: ledger.nextSeq + 1 })) {
    return { ok: false, reason: "storage-unavailable", balance };
  }
  return { ok: true, eventId: event.id, balanceAfter: balance - input.pointPrice };
}

/** 차감을 되돌린다. 이미 환불했거나 없는 차감이면 false. (M-4 refundSpend와 같은 규칙) */
export function refundClassPoints(
  storage: PointsStorage,
  spendEventId: string | null,
  now: Date = new Date(),
): boolean {
  if (!storage || !spendEventId) return false;
  const ledger = loadPointLedger(storage);
  const spend = ledger.events.find((event) => event.id === spendEventId && event.kind === "spend");
  if (!spend) return false;
  const alreadyRefunded = ledger.events.some(
    (event) => event.kind === "spend_refund" && event.spendEventId === spendEventId,
  );
  if (alreadyRefunded) return false;
  const event: PointLedgerEvent = {
    id: nextEventId(ledger.nextSeq),
    kind: "spend_refund",
    amount: spend.amount,
    resourceId: spend.resourceId,
    resourceName: spend.resourceName,
    spendEventId,
    occurredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + POINT_EXPIRY_DAYS * DAY_MS).toISOString(),
  };
  return savePointLedger(storage, { events: [...ledger.events, event], nextSeq: ledger.nextSeq + 1 });
}

export type ClassEnrollResult =
  | { readonly kind: "requires-account" }
  | { readonly kind: "unknown-class" }
  | { readonly kind: "already-enrolled"; readonly state: ClassEnrollmentState }
  | {
      readonly kind: "insufficient-points";
      readonly state: ClassEnrollmentState;
      readonly balance: number;
      readonly pointPrice: number;
    }
  | { readonly kind: "storage-unavailable"; readonly state: ClassEnrollmentState }
  | {
      readonly kind: "enrolled";
      readonly state: ClassEnrollmentState;
      readonly balanceAfter: number;
      readonly pointPricePaid: number;
      readonly spendEventId: string | null;
    };

/**
 * 수강 등록 전체 흐름: 계정 확인 → 포인트 차감(무료는 생략) → 등록 기록.
 * 잔액이 부족하면 차감도 등록도 일어나지 않는다.
 */
export function enrollInClass(input: {
  readonly enrollments: ClassEnrollmentState;
  readonly classId: string;
  readonly userId: string | null;
  readonly pointsStorage: PointsStorage;
  readonly now?: Date;
}): ClassEnrollResult {
  const now = input.now ?? new Date();
  if (!input.userId) return { kind: "requires-account" };
  const product = getClassProduct(input.classId);
  if (!product) return { kind: "unknown-class" };
  if (getActiveEnrollment(input.enrollments, input.classId)) {
    return { kind: "already-enrolled", state: input.enrollments };
  }
  const spend = spendPointsForClass(input.pointsStorage, {
    classId: product.id,
    classTitle: product.title,
    pointPrice: product.pointPrice,
    now,
  });
  if (!spend.ok && spend.reason === "insufficient") {
    return {
      kind: "insufficient-points",
      state: input.enrollments,
      balance: spend.balance,
      pointPrice: product.pointPrice,
    };
  }
  if (!spend.ok && spend.reason === "storage-unavailable") {
    return { kind: "storage-unavailable", state: input.enrollments };
  }
  // already-owned: 원장에는 차감이 있는데 등록 기록만 없는 경우 — 다시 차감하지 않고 등록을 복구한다.
  const spendEventId = spend.ok ? spend.eventId : (spend.existingEventId ?? null);
  const balanceAfter = spend.ok
    ? spend.balanceAfter
    : readPointBalance(input.pointsStorage, now);
  const state = enrollClass(input.enrollments, product.id, {
    now: now.toISOString(),
    spendEventId,
    pointPricePaid: product.pointPrice,
  });
  return {
    kind: "enrolled",
    state,
    balanceAfter,
    pointPricePaid: product.pointPrice,
    spendEventId,
  };
}

/** 수강 취소: 등록을 취소하고, 포인트로 등록했으면 차감을 환불한다. */
export function cancelClassEnrollment(input: {
  readonly enrollments: ClassEnrollmentState;
  readonly classId: string;
  readonly pointsStorage: PointsStorage;
  readonly now?: Date;
}): { readonly state: ClassEnrollmentState; readonly refundedPoints: number } {
  const now = input.now ?? new Date();
  const active = getActiveEnrollment(input.enrollments, input.classId);
  if (!active) return { state: input.enrollments, refundedPoints: 0 };
  const state = cancelEnrollment(input.enrollments, input.classId, now.toISOString());
  const refunded = active.spendEventId
    ? refundClassPoints(input.pointsStorage, active.spendEventId, now)
    : false;
  return { state, refundedPoints: refunded ? active.pointPricePaid : 0 };
}
