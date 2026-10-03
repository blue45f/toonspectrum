/**
 * 에셋 포인트 서버 계약 지점 — 지갑이 서버와 맞닿는 유일한 경계.
 *
 * 지금은 로컬 원장 어댑터가 기본 구현이다. 서버 쪽 준비 상태:
 * - 적립(서버 카탈로그 활동): `POST /membership/activity/claim` 이미 있음
 *   (`platform/membership-wallet-client`의 claimMembershipActivity).
 * - 잔액·원장 조회: `GET /membership/overview` 이미 있음 (recentLedger 포함).
 * - 포인트 사용: **아직 없음.** 필요한 계약은
 *   `POST /membership/wallet/spend` { resourceId, pointPrice, requestId }
 *   → { spendEventId, balance } 이고, 서버가 포인트 차감과 클라우드
 *   라이브러리 보관을 한 트랜잭션으로 확정해야 한다. 이 엔드포인트가
 *   생기면 아래 localAssetPointsApi만 서버 구현으로 교체하고,
 *   화면·스토어·원장 로직은 그대로 둔다.
 */

import {
  useAssetPointsStore,
  type EarnResult,
  type SpendResult,
} from "./asset-points-store";

export interface AssetPointsApi {
  earn(activityKey: string, sourceRef: string): Promise<EarnResult>;
  spendOnResource(input: {
    readonly resourceId: string;
    readonly resourceName: string;
    readonly pointPrice: number;
  }): Promise<SpendResult>;
  refundSpend(spendEventId: string): Promise<boolean>;
}

/** 현재 기본 구현: 이 브라우저의 로컬 원장에 기록한다. */
export const localAssetPointsApi: AssetPointsApi = {
  earn: (activityKey, sourceRef) =>
    Promise.resolve(useAssetPointsStore.getState().earn(activityKey, sourceRef)),
  spendOnResource: (input) =>
    Promise.resolve(useAssetPointsStore.getState().spendForResource(input)),
  refundSpend: (spendEventId) =>
    Promise.resolve(useAssetPointsStore.getState().refundSpend(spendEventId)),
};

/** 화면이 쓰는 기본 진입점. 서버 어댑터가 생기면 이 바인딩만 바꾼다. */
export const assetPointsApi: AssetPointsApi = localAssetPointsApi;
