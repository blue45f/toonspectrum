import { useSyncExternalStore } from "react";

/**
 * 보상형 광고 브릿지 — 웹(/)·토스(apps/toss) **공유** 옵트인 광고 레지스트리.
 *
 * 공유 페이지(운세 등)는 앱인토스 SDK 를 직접 import 할 수 없으므로(채널 경계),
 * 토스 셸이 `useTossFullScreenAd("rewarded")` 를 감싼 provider 를 여기에 게시하고
 * 공유 코드는 `useRewardedAd()` 스냅샷 + `showRewardedAd()` 만 소비한다.
 * (`globalThis.__toonspectrumTossLogin` 주입 패턴의 상태 구독 버전.)
 *
 * 정책(앱인토스 보상형 광고 가이드):
 *  - 노출은 항상 사용자 옵트인 버튼에서만(`show` 는 제스처 안에서 호출).
 *  - 보상 지급은 SDK `userEarnedReward` 이벤트를 받은 provider 가 `notifyRewardedAdEvent`
 *    로 전달한 경우에만 — 닫힘(`closed`)만으로 보상하면 안 된다.
 *  - provider 미게시(웹/미구성 토스) 환경에선 `available=false` → 옵트인 UI 자체를 숨긴다.
 */

/** SDK userEarnedReward 페이로드(단위·수량). */
export interface RewardedAdReward {
  unitType: string;
  unitAmount: number;
}

/** 공유 코드가 구독하는 보상형 광고 상태 스냅샷. */
export interface RewardedAdSnapshot {
  /** provider 게시 여부(토스 환경 + 광고 그룹 ID 구성 + SDK 지원). false 면 UI 미노출. */
  available: boolean;
  /** 사전 로드된 광고가 'loaded' 상태인지(즉시 show 가능). */
  ready: boolean;
}

/** 보상형 광고 진행 이벤트 — 보상 지급(reward)과 광고 종료(closed: dismissed/실패 포함). */
export type RewardedAdEvent =
  | { type: "reward"; reward: RewardedAdReward }
  | { type: "closed" };

interface RewardedAdProvider {
  ready: boolean;
  /** 사전 로드된 광고를 노출. 노출 시작 실패 시 false. 반드시 사용자 제스처에서 호출. */
  show: () => boolean;
}

const SERVER_SNAPSHOT: RewardedAdSnapshot = { available: false, ready: false };

let provider: RewardedAdProvider | null = null;
let snapshot: RewardedAdSnapshot = SERVER_SNAPSHOT;
const stateListeners = new Set<() => void>();
const eventListeners = new Set<(event: RewardedAdEvent) => void>();

/**
 * (토스 셸 전용) 보상형 광고 provider 게시/해제. `null` 이면 미구성으로 되돌린다.
 * ready/available 이 실제로 바뀔 때만 스냅샷을 교체·통지한다(useSyncExternalStore 호환).
 */
export function publishRewardedAdProvider(next: RewardedAdProvider | null): void {
  provider = next;
  const nextSnapshot: RewardedAdSnapshot = {
    available: next != null,
    ready: Boolean(next?.ready),
  };
  if (
    nextSnapshot.available === snapshot.available &&
    nextSnapshot.ready === snapshot.ready
  ) {
    return;
  }
  snapshot = nextSnapshot;
  stateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // 한 구독자 오류가 다른 구독자를 막지 않도록.
    }
  });
}

/** (토스 셸 전용) SDK 광고 이벤트(userEarnedReward/dismissed 등)를 공유 구독자에게 전달. */
export function notifyRewardedAdEvent(event: RewardedAdEvent): void {
  eventListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // 한 구독자 오류가 다른 구독자를 막지 않도록.
    }
  });
}

/** 보상형 광고 이벤트 구독. 반환 함수로 해제. */
export function onRewardedAdEvent(
  listener: (event: RewardedAdEvent) => void,
): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

/**
 * 사전 로드된 보상형 광고를 노출한다(사용자 제스처 안에서만 호출).
 * provider 미게시·미로드면 false — 호출부는 버튼 disabled 로 이 상태를 이미 막아야 한다.
 */
export function showRewardedAd(): boolean {
  return provider?.show() ?? false;
}

const subscribe = (onStoreChange: () => void): (() => void) => {
  stateListeners.add(onStoreChange);
  return () => {
    stateListeners.delete(onStoreChange);
  };
};

const getSnapshot = (): RewardedAdSnapshot => snapshot;
const getServerSnapshot = (): RewardedAdSnapshot => SERVER_SNAPSHOT;

/** 보상형 광고 가용/준비 상태 구독 훅(웹에선 항상 `{available:false}` — UI 미노출). */
export function useRewardedAd(): RewardedAdSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
