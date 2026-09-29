export interface AppRouteMeta {
  path: string;
  label: string;
}

/**
 * 헤더·푸터·탭바·사이트맵에서 쓰는 canonical 경로 메타.
 *
 * label은 반드시 `apps/web/public/i18n/app` 아래 ko.json·en.json에 존재하는
 * 번역 키여야 한다(새 키를 쓰면 `node scripts/generate-i18n-builtins.mjs`로
 * builtins를 재생성한다). 라우트 등록 자체는 `groups/*.routes.tsx`가 소유하고,
 * 이 매니페스트는 내비게이션 노출용 서브셋이다.
 */
export const appRoutes: AppRouteMeta[] = [
  // 홈·탐색
  { path: "/", label: "nav.home" },
  { path: "/discover", label: "nav.discover" },
  { path: "/explore", label: "route.explore" },
  { path: "/ranking", label: "route.ranking" },
  { path: "/recommend", label: "route.recommend" },
  { path: "/search", label: "route.search" },
  { path: "/calendar", label: "route.calendar" },
  { path: "/news", label: "route.news" },
  { path: "/authors", label: "route.authors" },
  { path: "/tags", label: "route.tags" },
  { path: "/guide", label: "route.guide" },
  { path: "/random", label: "route.random" },
  { path: "/insights", label: "route.insights" },
  { path: "/references", label: "route.references" },
  { path: "/compare", label: "route.compare" },
  { path: "/reviews", label: "route.reviews" },
  { path: "/library", label: "route.library" },
  // 창작·Studio
  { path: "/studio", label: "route.studio" },
  { path: "/studio/new", label: "route.studioNew" },
  { path: "/studio/assets", label: "route.studioAssets" },
  { path: "/studio/manual", label: "nav.studio" },
  { path: "/shaper", label: "route.shaper" },
  { path: "/showcase", label: "route.create" },
  { path: "/create", label: "route.create" },
  // 커뮤니티
  { path: "/community", label: "route.community" },
  { path: "/community/cafes", label: "route.community_cafes" },
  // 마켓
  { path: "/market", label: "route.market" },
  { path: "/market/browse", label: "route.marketBrowse" },
  { path: "/market/publish", label: "route.marketPublish" },
  { path: "/market/manage", label: "route.marketManage" },
  { path: "/market/library", label: "route.marketLibrary" },
  { path: "/market/wishlist", label: "route.marketWishlist" },
  // 제작
  { path: "/production", label: "route.production" },
  { path: "/production/projects", label: "route.production" },
  // 계정·멤버십
  { path: "/me", label: "route.me" },
  { path: "/messages", label: "route.messages" },
  { path: "/creators", label: "route.creators" },
  { path: "/settings", label: "route.settings" },
  { path: "/membership", label: "route.membership" },
  { path: "/membership/usage", label: "route.membership" },
  { path: "/notifications", label: "route.library" },
  { path: "/onboarding/taste", label: "route.recommend" },
  // 요금·소개·지원
  { path: "/pricing", label: "route.pricing" },
  { path: "/about", label: "route.about" },
  { path: "/about/studio", label: "route.about" },
  { path: "/about/principles", label: "route.about" },
  { path: "/help", label: "route.help" },
  { path: "/support", label: "route.support" },
  { path: "/support-us", label: "route.supportUs" },
  { path: "/support-creators", label: "route.creatorSupport" },
  { path: "/contact", label: "route.contact" },
  { path: "/business", label: "route.business" },
  { path: "/feedback", label: "route.feedback" },
  { path: "/terms", label: "route.terms" },
  { path: "/privacy", label: "route.privacy" },
  { path: "/copyright", label: "route.copyright" },
  { path: "/sitemap", label: "route.sitemap" },
  // 놀이
  { path: "/play", label: "route.play" },
  { path: "/fortune", label: "route.fortune" },
  // 관리
  { path: "/admin", label: "route.admin" },
];
