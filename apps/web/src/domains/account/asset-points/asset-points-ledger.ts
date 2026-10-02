/**
 * 에셋 포인트 원장 — append-only 이벤트로만 상태를 만드는 순수 로직.
 *
 * 이벤트는 절대 수정·삭제하지 않는다. 사용 취소는 `spend_refund` 이벤트를
 * 새로 붙여 되돌린다. 잔액은 이벤트를 시간순으로 재생해 계산하므로,
 * 저장된 이벤트 목록만 있으면 언제든 같은 잔액이 재현된다.
 *
 * 적립분은 만료 시각을 가진 lot으로 쌓이고, 사용할 때는 만료가 가까운
 * lot부터 먼저 소진한다(멤버십 정책의 "만료가 가까운 무료 재화부터 사용"과 동일).
 */

import {
  ASSET_POINT_EXPIRY_DAYS,
  ASSET_POINT_EXPIRY_NOTICE_DAYS,
  type AssetPointEarnRule,
} from "./asset-points-policy";

export type AssetPointEventKind = "earn" | "spend" | "spend_refund";

export interface AssetPointEvent {
  readonly id: string;
  readonly kind: AssetPointEventKind;
  /** 항상 양수. 증감 방향은 kind가 정한다. */
  readonly amount: number;
  /** earn일 때 적립 규칙 키. */
  readonly activityKey?: string;
  /** earn일 때 중복 방지 키. 같은 (activityKey, sourceRef) 적립은 한 번만 인정한다. */
  readonly sourceRef?: string;
  /** spend일 때 산 에셋 리소스 ID. */
  readonly resourceId?: string;
  /** spend일 때 표시용 리소스 이름. */
  readonly resourceName?: string;
  /** spend_refund일 때 되돌리는 spend 이벤트 ID. */
  readonly spendEventId?: string;
  readonly occurredAt: string;
  /** earn일 때 만료 시각. spend_refund로 되돌아온 포인트는 환불 시점부터 새로 계산한다. */
  readonly expiresAt?: string;
}

export type EarnRejection = "duplicate" | "daily-cap";
export type SpendRejection = "already-owned" | "insufficient";

export type EarnEvaluation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: EarnRejection };

export type SpendEvaluation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: SpendRejection };

const DAY_MS = 24 * 60 * 60 * 1000;

/** 로컬 시간대 기준 YYYY-MM-DD. 일일 상한 판정에 쓴다. */
export function localDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function createEarnEvent(input: {
  readonly id: string;
  readonly rule: AssetPointEarnRule;
  readonly sourceRef: string;
  readonly now: Date;
}): AssetPointEvent {
  return {
    id: input.id,
    kind: "earn",
    amount: input.rule.points,
    activityKey: input.rule.key,
    sourceRef: input.sourceRef,
    occurredAt: input.now.toISOString(),
    expiresAt: addDays(input.now, ASSET_POINT_EXPIRY_DAYS).toISOString(),
  };
}

export function createSpendEvent(input: {
  readonly id: string;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly pointPrice: number;
  readonly now: Date;
}): AssetPointEvent {
  return {
    id: input.id,
    kind: "spend",
    amount: input.pointPrice,
    resourceId: input.resourceId,
    resourceName: input.resourceName,
    occurredAt: input.now.toISOString(),
  };
}

export function createSpendRefundEvent(input: {
  readonly id: string;
  readonly spend: AssetPointEvent;
  readonly now: Date;
}): AssetPointEvent {
  return {
    id: input.id,
    kind: "spend_refund",
    amount: input.spend.amount,
    resourceId: input.spend.resourceId,
    resourceName: input.spend.resourceName,
    spendEventId: input.spend.id,
    occurredAt: input.now.toISOString(),
    expiresAt: addDays(input.now, ASSET_POINT_EXPIRY_DAYS).toISOString(),
  };
}

/**
 * 적립 가능 여부를 판정한다.
 * - duplicate: 같은 활동·같은 sourceRef로 이미 적립한 적이 있으면 거부 (재시도·새로고침 farming 차단).
 * - daily-cap: 오늘(로컬 날짜) 이미 규칙의 일일 상한만큼 적립했으면 거부.
 */
export function evaluateEarn(
  events: readonly AssetPointEvent[],
  rule: AssetPointEarnRule,
  sourceRef: string,
  now: Date,
): EarnEvaluation {
  const today = localDateKey(now);
  let todayCount = 0;
  for (const event of events) {
    if (event.kind !== "earn" || event.activityKey !== rule.key) continue;
    if (event.sourceRef === sourceRef) return { ok: false, reason: "duplicate" };
    if (localDateKey(event.occurredAt) === today) todayCount += 1;
  }
  if (todayCount >= rule.dailyLimit) return { ok: false, reason: "daily-cap" };
  return { ok: true };
}

/** 오늘 특정 활동으로 적립한 횟수. 지갑의 "오늘 남은 횟수" 표시에 쓴다. */
export function countEarnsToday(
  events: readonly AssetPointEvent[],
  activityKey: string,
  now: Date,
): number {
  const today = localDateKey(now);
  return events.filter(
    (event) =>
      event.kind === "earn"
      && event.activityKey === activityKey
      && localDateKey(event.occurredAt) === today,
  ).length;
}

/** 환불되지 않은 spend가 있는 리소스 ID 집합 — 포인트로 산 에셋 목록. */
export function ownedResourceIds(events: readonly AssetPointEvent[]): ReadonlySet<string> {
  const refundedSpendIds = new Set(
    events
      .filter((event) => event.kind === "spend_refund" && event.spendEventId)
      .map((event) => event.spendEventId as string),
  );
  const owned = new Set<string>();
  for (const event of events) {
    if (event.kind === "spend" && event.resourceId && !refundedSpendIds.has(event.id)) {
      owned.add(event.resourceId);
    }
  }
  return owned;
}

/**
 * 사용 가능 여부를 판정한다.
 * - already-owned: 환불되지 않은 구매가 이미 있는 리소스면 거부 (이중 차감 방지).
 * - insufficient: 현재 잔액이 포인트 가격보다 적으면 거부.
 */
export function evaluateSpend(
  events: readonly AssetPointEvent[],
  resourceId: string,
  pointPrice: number,
  now: Date,
): SpendEvaluation {
  if (ownedResourceIds(events).has(resourceId)) {
    return { ok: false, reason: "already-owned" };
  }
  if (computeBalance(events, now) < pointPrice) {
    return { ok: false, reason: "insufficient" };
  }
  return { ok: true };
}

interface PointLot {
  remaining: number;
  readonly expiresAtMs: number;
}

function replayLots(events: readonly AssetPointEvent[], untilMs: number): PointLot[] {
  const ordered = [...events]
    .filter((event) => new Date(event.occurredAt).getTime() <= untilMs)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const lots: PointLot[] = [];
  for (const event of ordered) {
    const atMs = new Date(event.occurredAt).getTime();
    if (event.kind === "earn" || event.kind === "spend_refund") {
      const expiresAtMs = event.expiresAt
        ? new Date(event.expiresAt).getTime()
        : atMs + ASSET_POINT_EXPIRY_DAYS * DAY_MS;
      lots.push({ remaining: event.amount, expiresAtMs });
      continue;
    }
    // spend: 만료가 가까운 lot부터 소진. 그 시점에 이미 만료된 lot은 쓸 수 없다.
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

/** now 시점의 사용 가능 잔액. 만료된 lot은 제외한다. */
export function computeBalance(events: readonly AssetPointEvent[], now: Date): number {
  const nowMs = now.getTime();
  return replayLots(events, nowMs)
    .filter((lot) => lot.expiresAtMs > nowMs)
    .reduce((sum, lot) => sum + lot.remaining, 0);
}

export interface AssetPointSummary {
  readonly balance: number;
  readonly lifetimeEarned: number;
  readonly lifetimeSpent: number;
  /** 만료 임박 구간 안에 만료되는 잔여 포인트 합계. */
  readonly expiringSoonPoints: number;
  /** 가장 빨리 만료되는 lot의 만료 시각. 없으면 null. */
  readonly nextExpiryAt: string | null;
}

export function summarizeAssetPoints(
  events: readonly AssetPointEvent[],
  now: Date,
): AssetPointSummary {
  const nowMs = now.getTime();
  const lots = replayLots(events, nowMs).filter((lot) => lot.expiresAtMs > nowMs);
  const balance = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  const lifetimeEarned = events
    .filter((event) => event.kind === "earn")
    .reduce((sum, event) => sum + event.amount, 0);
  const spent = events
    .filter((event) => event.kind === "spend")
    .reduce((sum, event) => sum + event.amount, 0);
  const refunded = events
    .filter((event) => event.kind === "spend_refund")
    .reduce((sum, event) => sum + event.amount, 0);
  const noticeUntilMs = nowMs + ASSET_POINT_EXPIRY_NOTICE_DAYS * DAY_MS;
  const expiring = lots
    .filter((lot) => lot.remaining > 0 && lot.expiresAtMs <= noticeUntilMs)
    .sort((a, b) => a.expiresAtMs - b.expiresAtMs);
  return {
    balance,
    lifetimeEarned,
    lifetimeSpent: spent - refunded,
    expiringSoonPoints: expiring.reduce((sum, lot) => sum + lot.remaining, 0),
    nextExpiryAt: expiring.length > 0
      ? new Date(expiring[0].expiresAtMs).toISOString()
      : null,
  };
}

/** 내역 표시용: 최신순 정렬. */
export function sortEventsNewestFirst(
  events: readonly AssetPointEvent[],
): AssetPointEvent[] {
  return [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
