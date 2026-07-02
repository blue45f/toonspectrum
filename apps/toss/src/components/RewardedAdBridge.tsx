import { useEffect } from "react";

import {
  notifyRewardedAdEvent,
  publishRewardedAdProvider,
} from "@/src/compat/rewarded-ad";

import { useTossFullScreenAd } from "../lib/ads.ts";

/**
 * 보상형 광고 브릿지 — 토스 셸이 `useTossFullScreenAd("rewarded")` 를 공유 레지스트리
 * (`src/compat/rewarded-ad`)에 게시해, 공유 페이지(운세 등)의 옵트인 버튼이 SDK 를 직접
 * import 하지 않고 광고를 노출/보상 처리할 수 있게 한다. UI 없음(항상 null 렌더).
 *
 * 미구성(광고 그룹 ID 없음)·미지원 환경에선 provider 를 게시하지 않아 옵트인 UI 가
 * 아예 노출되지 않는다. 보상 이벤트는 SDK `userEarnedReward` 를 그대로 전달한다.
 */
export function RewardedAdBridge() {
  const ad = useTossFullScreenAd("rewarded", {
    onReward: (reward) => notifyRewardedAdEvent({ type: "reward", reward }),
    onClosed: () => notifyRewardedAdEvent({ type: "closed" }),
  });

  // 매 렌더 후 최신 show/ready 를 게시 — 레지스트리가 상태 변화시에만 구독자에 통지하므로 안전.
  useEffect(() => {
    if (!ad.configured || !ad.supported) {
      publishRewardedAdProvider(null);
      return;
    }
    publishRewardedAdProvider({ ready: ad.ready, show: ad.show });
  });

  // 언마운트 시 게시 해제 — 셸 밖(웹)과 동일한 미구성 상태로 되돌린다.
  useEffect(() => () => publishRewardedAdProvider(null), []);

  return null;
}
