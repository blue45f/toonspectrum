/**
 * 공용 헤더 아트 배정 — D-1 ResourceLayout의 INTRO_ART와 같은 형태(정확 경로 → 아트 키)다.
 *
 * 아트 키는 일러스트 풀(`apps/web/public/brand/illustrated-20260928/`)의 파일 이름이며,
 * 배정을 바꾸려면 이 맵만 고친다. 페이지 파일에 경로 분기나 파일명을 흩뿌리지 않는다.
 * 중첩 경로(예: /title/:slug 같은 동적 경로)는 특정 페이지의 맥락이 아니라서 배정하지 않는다.
 *
 * 배정 기준 (2026-10-03, 디자인 전수 검수 P-1):
 * - S1 문서군 중 헤더를 쓰는 페이지부터: /status·/sitemap.
 *   /help·/contact는 이미 SitePageArt(aside)를 쓰므로 이 맵에서 제외한다.
 * - S2 카탈로그 쉘 페이지: /discover·/library·/news·/compare·/recommend·/search.
 *   /ranking은 aside에 랭킹 일러스트를 이미 쓰므로 제외한다.
 * - 다른 섹션(S4~S6)의 헤더 사용 페이지는 각 소관 트랙이 이 맵에 한 줄씩 추가한다.
 */
export const SITE_PAGE_HEADER_ART: Readonly<Record<string, string>> = {
  "/status": "background-city",
  "/sitemap": "storyboard",
  "/discover": "hero",
  "/library": "project-romance",
  "/news": "canvas-noir",
  "/compare": "character-blue",
  "/recommend": "character-pink",
  "/search": "blank-canvas",
};

/** 경로 끝 슬래시는 D-1과 같은 방식으로 떼고 정확히 대조한다. 배정이 없으면 undefined. */
export function sitePageHeaderArtFor(pathname: string): string | undefined {
  return SITE_PAGE_HEADER_ART[pathname.replace(/\/$/u, "")];
}

/** 아트 키 → 일러스트 풀 파일 경로. D-1 마스트헤드와 같은 풀·같은 경로 규칙을 쓴다. */
export function sitePageHeaderArtSource(artKey: string): string {
  return `/brand/illustrated-20260928/${artKey}.webp`;
}
