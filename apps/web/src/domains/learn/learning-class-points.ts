import {
  computeBalance,
  useAssetPointsStore,
  type AssetPointEvent,
} from "@/domains/account/public/asset-points";

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
 * 지갑의 정본은 M-4 에셋 포인트 스토어다. 이 어댑터는 자체 저장소를 갖지
 * 않고 공개 경계(`@/domains/account/public/asset-points`)의 스토어를 직접
 * 읽고 쓴다 — 과거의 localStorage 미러 구현은 스토어와 같은 키를 따로
 * 읽고 써서, 스토어가 IndexedDB로 이전한 뒤에는 원장이 갈라질 수 있어
 * 제거했다. 이제 스토어의 이벤트가 곧 이 모듈의 원장이다.
 *
 * - 차감 규칙(already-owned / insufficient)은 스토어의 evaluateSpend와
 *   같고, 이 모듈은 클래스 도메인 결과 타입으로 번역만 한다.
 * - 스토어의 `spendForResource`는 0P도 spend 이벤트를 남기므로, 무료
 *   클래스의 "이벤트를 남기지 않는다" 규칙은 이 모듈이 지켜준다.
 * - 충전(현금→포인트 구매) 경로는 정책상 존재하지 않는다. 포인트는 활동
 *   적립으로만 쌓이고, 이 모듈은 잔액 확인·차감·환불만 한다.
 *
 * 주의: 스토어 하이드레이션(IndexedDB→메모리)은 비동기다. 이 모듈의
 * 함수들은 스토어의 현재 메모리 상태를 기준으로 판정하므로, 앱 부팅
 * 직후 하이드레이션이 끝나기 전에 호출하면 빈 원장으로 보일 수 있다.
 * 클래스 페이지는 사용자 탐색 뒤에 눌리는 화면이라 실질 위험이 낮고,
 * 지갑 스토어를 쓰는 다른 화면과 같은 전제를 공유한다.
 */

/** M-4 지갑 스토어와 같은 스토리지 키. 정본 상수는 account 도메인이 갖고, 기존 import 경로 유지를 위해 다시 내보낸다. */
export { ASSET_POINTS_STORAGE_KEY } from "@/domains/account/public/asset-points";

/** 현재 지갑 원장 스냅샷. */
function walletEvents(): readonly AssetPointEvent[] {
  return useAssetPointsStore.getState().events;
}

/** now 시점의 사용 가능 잔액. 만료된 적립은 제외한다. (스토어 computeBalance와 같은 규칙) */
export function readPointBalance(now: Date = new Date()): number {
  return computeBalance(walletEvents(), now);
}

/** 클래스 차감을 지갑 원장에서 찾는 리소스 ID. 에셋 구매와 같은 규칙을 쓴다. */
export function classPointResourceId(classId: string): string {
  return `class:${classId}`;
}

function findUnrefundedClassSpend(
  events: readonly AssetPointEvent[],
  classId: string,
): AssetPointEvent | null {
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
      // "storage-unavailable"은 localStorage 미러 시절의 사유로, 스토어
      // 일원화 이후에는 발생하지 않는다 (어댑터가 IDB→localStorage 폴백을
      // 포함한다). 결과 타입의 호환을 위해 유니온에만 남긴다.
      readonly reason: "insufficient" | "already-owned" | "storage-unavailable";
      readonly balance: number;
      /** already-owned일 때 기존 차감 이벤트 ID. 등록 기록 복구에 쓴다. */
      readonly existingEventId?: string;
    };

/**
 * 클래스 등록용 포인트 차감.
 * 무료(0P)는 원장에 이벤트를 남기지 않는다. 잔액이 부족하면 차감하지 않는다.
 */
export function spendPointsForClass(input: {
  readonly classId: string;
  readonly classTitle: string;
  readonly pointPrice: number;
  readonly now?: Date;
}): ClassPointSpendResult {
  const now = input.now ?? new Date();
  const events = walletEvents();
  const balance = computeBalance(events, now);
  if (input.pointPrice <= 0) return { ok: true, eventId: null, balanceAfter: balance };
  const existing = findUnrefundedClassSpend(events, input.classId);
  if (existing) {
    return { ok: false, reason: "already-owned", balance, existingEventId: existing.id };
  }
  if (balance < input.pointPrice) return { ok: false, reason: "insufficient", balance };
  const spent = useAssetPointsStore.getState().spendForResource({
    resourceId: classPointResourceId(input.classId),
    resourceName: input.classTitle,
    pointPrice: input.pointPrice,
    now,
  });
  if (!spent.ok) {
    // 위에서 이미 같은 규칙으로 판정했으므로 보통 도달하지 않는다.
    // 스토어 판정이 달라진 경우에도 결과 타입 계약은 유지한다.
    return spent.reason === "already-owned"
      ? { ok: false, reason: "already-owned", balance, existingEventId: findUnrefundedClassSpend(walletEvents(), input.classId)?.id }
      : { ok: false, reason: "insufficient", balance };
  }
  return { ok: true, eventId: spent.eventId, balanceAfter: balance - input.pointPrice };
}

/** 차감을 되돌린다. 이미 환불했거나 없는 차감이면 false. (스토어 refundSpend와 같은 규칙) */
export function refundClassPoints(
  spendEventId: string | null,
  now: Date = new Date(),
): boolean {
  if (!spendEventId) return false;
  return useAssetPointsStore.getState().refundSpend(spendEventId, now);
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
  readonly now?: Date;
}): ClassEnrollResult {
  const now = input.now ?? new Date();
  if (!input.userId) return { kind: "requires-account" };
  const product = getClassProduct(input.classId);
  if (!product) return { kind: "unknown-class" };
  if (getActiveEnrollment(input.enrollments, input.classId)) {
    return { kind: "already-enrolled", state: input.enrollments };
  }
  const spend = spendPointsForClass({
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
  // already-owned: 원장에는 차감이 있는데 등록 기록만 없는 경우 — 다시 차감하지 않고 등록을 복구한다.
  const spendEventId = spend.ok ? spend.eventId : (spend.existingEventId ?? null);
  const balanceAfter = spend.ok ? spend.balanceAfter : readPointBalance(now);
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
  readonly now?: Date;
}): { readonly state: ClassEnrollmentState; readonly refundedPoints: number } {
  const now = input.now ?? new Date();
  const active = getActiveEnrollment(input.enrollments, input.classId);
  if (!active) return { state: input.enrollments, refundedPoints: 0 };
  const state = cancelEnrollment(input.enrollments, input.classId, now.toISOString());
  const refunded = active.spendEventId
    ? refundClassPoints(active.spendEventId, now)
    : false;
  return { state, refundedPoints: refunded ? active.pointPricePaid : 0 };
}
