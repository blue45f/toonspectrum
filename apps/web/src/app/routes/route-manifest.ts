export interface AppRouteMeta {
  path: string;
  label: string;
}

/**
 * 공개 내비게이션·사이트맵·명령 팔레트가 가리키는 정식 목적지와 그 i18n 라벨 키.
 * 라우터 등록부(groups/app-routes)를 대체하지 않는 읽기 전용 목록이며,
 * 모든 경로는 실제 등록 라우트에 맞고 라벨은 ko/en 셸 사전에 있어야 한다(route-manifest.test.ts).
 */
export const appRoutes: AppRouteMeta[] = [
  // 홈·작품 탐색
  { path: "/", label: "nav.home" },
  { path: "/ranking", label: "route.ranking" },
  { path: "/search", label: "route.search" },
  { path: "/references", label: "route.references" },
  { path: "/recommend", label: "route.recommend" },
  { path: "/play", label: "route.play" },
  { path: "/cuts", label: "route.cuts" },
  { path: "/character-chat", label: "route.characterChat" },
  { path: "/explore", label: "route.explore" },
  { path: "/calendar", label: "route.calendar" },
  { path: "/reviews", label: "route.reviews" },
  { path: "/random", label: "route.random" },
  { path: "/tags", label: "route.tags" },
  { path: "/authors", label: "route.authors" },
  { path: "/news", label: "route.news" },
  { path: "/compare", label: "route.compare" },
  { path: "/insights", label: "route.insights" },
  { path: "/guide", label: "route.guide" },
  { path: "/fortune", label: "route.fortune" },
  // 커뮤니티·창작자
  { path: "/community", label: "route.community" },
  { path: "/community/cafes", label: "route.community_cafes" },
  { path: "/creators", label: "route.creators" },
  { path: "/messages", label: "route.messages" },
  // 제작
  { path: "/studio", label: "route.studio" },
  { path: "/studio/new", label: "route.studioNew" },
  { path: "/studio/import", label: "route.studioImport" },
  { path: "/studio/templates", label: "route.studioTemplates" },
  { path: "/studio/assets", label: "route.studioAssets" },
  { path: "/studio/analytics", label: "route.creatorAnalytics" },
  { path: "/production", label: "route.production" },
  { path: "/shaper", label: "route.shaper" },
  // 마켓
  { path: "/market", label: "route.market" },
  { path: "/market/browse", label: "route.marketBrowse" },
  { path: "/market/publish", label: "route.marketPublish" },
  { path: "/market/library", label: "route.marketLibrary" },
  { path: "/market/wishlist", label: "route.marketWishlist" },
  { path: "/market/manage", label: "route.marketManage" },
  // 계정·요금
  { path: "/library", label: "route.library" },
  { path: "/notifications", label: "route.notifications" },
  { path: "/onboarding/taste", label: "route.recommend" },
  { path: "/me", label: "route.me" },
  { path: "/settings", label: "route.settings" },
  { path: "/membership", label: "route.membership" },
  { path: "/account/points", label: "route.assetPoints" },
  { path: "/pricing", label: "route.pricing" },
  // 안내·지원·정책
  { path: "/about", label: "route.about" },
  { path: "/help", label: "route.help" },
  { path: "/support", label: "route.support" },
  { path: "/feedback", label: "route.feedback" },
  { path: "/contact", label: "route.contact" },
  { path: "/business", label: "route.business" },
  { path: "/support-us", label: "route.supportUs" },
  { path: "/support-creators", label: "route.creatorSupport" },
  { path: "/design", label: "route.design" },
  { path: "/copyright", label: "route.copyright" },
  { path: "/terms", label: "route.terms" },
  { path: "/privacy", label: "route.privacy" },
  { path: "/sitemap", label: "route.sitemap" },
  { path: "/admin", label: "route.admin" },
];
