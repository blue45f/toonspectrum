// 창작 게시판(사용자 제작 웹툰/컷툰) 서버 로직 — 도메인별 모듈은 ./creator/ 아래에 있다.
// 이 파일은 기존 공개 API를 그대로 유지하는 배럴(barrel)이다.
export {
  generateImageAsset,
  type GeneratedCreatorAsset,
  type ImageAssetQuality,
  type ImageAssetSize,
} from "./creator/asset-generation";
export {
  ensureDefaultChallenges,
  getChallenge,
  listChallenges,
  type CreatorChallengeDetail,
  type CreatorChallengeSummary,
} from "./creator/challenges";
export {
  challengeStateOf,
  nextEpisodeNumber,
  parseSeriesSort,
  parseSeriesStatus,
  SEED_CHALLENGES,
  seedChallengeWindow,
  validateFollowPair,
  validateSeriesInput,
  type CreatorChallengeState,
  type CreatorSeriesInput,
  type CreatorSeriesSort,
  type CreatorSeriesStatus,
  type SeedChallengeDef,
  type ValidatedSeriesInput,
} from "./creator/community-contract";
export { ensureCreatorCommunitySchema } from "./creator/community-schema";
export {
  getCreatorPublicProfile,
  getFollowStats,
  toggleFollow,
  type CreatorFollowStats,
  type CreatorPublicProfile,
} from "./creator/follows";
export {
  createSeries,
  deleteSeries,
  getSeries,
  listSeries,
  updateSeries,
  type CreatorSeriesDetail,
  type CreatorSeriesSummary,
} from "./creator/series";
export {
  bumpAssetDownloads,
  deleteSharedAsset,
  getSharedAssetContent,
  listAssetModerationQueue,
  listSharedAssetCatalog,
  listSharedAssets,
  moderateSharedAsset,
  publishAsset,
  reportSharedAsset,
  type CreatorAssetCatalogPage,
  type CreatorAssetModerationQueueItem,
  type CreatorSharedAsset,
  type CreatorSharedAssetCatalogItem,
  type CreatorSharedAssetContent,
  type CreatorSharedAssetSummary,
} from "./creator/shared-assets";
export {
  getWorkRevision,
  getWorkRevisionComparison,
  listWorkRevisions,
  restoreWorkRevision,
} from "./creator/work-revision-service";
export { addComment, listComments, toggleLike } from "./creator/work-social";
export {
  parseCreatorSort,
  type CreatorAuthor,
  type CreatorEpisodeRef,
  type CreatorWorkComment,
  type CreatorWorkDetail,
  type CreatorWorkFormat,
  type CreatorWorkInput,
  type CreatorWorkMutationResult,
  type CreatorWorkRevisionComparisonDetail,
  type CreatorWorkRevisionDetail,
  type CreatorWorkRevisionSummary,
  type CreatorWorkSort,
  type CreatorWorkStatus,
  type CreatorWorkSummary,
} from "./creator/works-contract";
export { bumpViews, createWork, deleteWork, getWork, listWorks, updateWork } from "./creator/works";
