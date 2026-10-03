/**
 * 에셋 포인트의 도메인 간 공개 경계.
 *
 * 다른 도메인(market·cuts·learn 등)은 asset-points 내부 파일을 직접 import하지 않고
 * 이 모듈만 참조한다(아키텍처 경계 검증의 public 경계 규칙).
 * 노출 범위는 지갑 소비에 필요한 것만으로 유지한다 — 충전(현금 구매) 경로는 존재하지 않는다.
 */

export {
  ASSET_POINTS_STORAGE_KEY,
  assetPointsApi,
  awardCutsClipPublished,
  awardDailyLoginBonus,
  computeBalance,
  ownedResourceIds,
  pointPriceForKrw,
  readAssetPointBalance,
  summarizeAssetPoints,
  useAssetPointsStore,
  type AssetPointEvent,
  type AssetPointSummary,
  type AssetPointsApi,
  type EarnResult,
  type SpendResult,
} from "../asset-points";
