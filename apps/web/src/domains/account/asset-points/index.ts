/**
 * 에셋 포인트 모듈의 공개 진입점.
 * account 도메인 안에서는 이 파일을 import하고, 다른 도메인은
 * domains/account/public/asset-points 경계를 통한다 — 내부 파일 직접 참조 금지.
 */

export { AssetPointsWalletPage } from "./AssetPointsWalletPage";
export {
  ASSET_POINT_EARN_RULES,
  ASSET_POINT_EXPIRY_DAYS,
  KRW_PER_POINT,
  MIN_POINT_PRICE,
  assetPointEarnRule,
  pointPriceForKrw,
  type AssetPointEarnRule,
} from "./asset-points-policy";
export {
  computeBalance,
  ownedResourceIds,
  summarizeAssetPoints,
  type AssetPointEvent,
  type AssetPointSummary,
} from "./asset-points-ledger";
export {
  ASSET_POINTS_STORAGE_KEY,
  readAssetPointBalance,
  readCurrentOwnerAssetPointEvents,
  useAssetPointsStore,
  useCurrentOwnerAssetPointEvents,
  type EarnResult,
  type SpendResult,
} from "./asset-points-store";
export { assetPointsApi, type AssetPointsApi } from "./asset-points-api";
export {
  awardCutsClipPublished,
  awardDailyLoginBonus,
} from "./asset-points-triggers";
