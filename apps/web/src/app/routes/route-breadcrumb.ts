import { canonicalSitePath } from "@/shared/lib/site-route-metadata";

import type { AppBreadcrumbItem } from "../components/breadcrumb";

const HOME: AppBreadcrumbItem = { ko: "홈", en: "Home", href: "/" };

function trail(parent: AppBreadcrumbItem, leafKo: string, leafEn: string): AppBreadcrumbItem[] {
  return [HOME, parent, { ko: leafKo, en: leafEn }];
}

const MARKET: AppBreadcrumbItem = { ko: "마켓", en: "Market", href: "/market" };
const COMMUNITY: AppBreadcrumbItem = { ko: "커뮤니티", en: "Community", href: "/community" };
const ABOUT: AppBreadcrumbItem = { ko: "소개", en: "About", href: "/about" };
const TECHNOLOGY: AppBreadcrumbItem = { ko: "기술", en: "Technology", href: "/about/technology" };
const STUDIO: AppBreadcrumbItem = { ko: "Studio", en: "Studio", href: "/studio" };
const PRODUCTION: AppBreadcrumbItem = { ko: "제작", en: "Production", href: "/production" };
const RESEARCH: AppBreadcrumbItem = { ko: "창작 리서치", en: "Research", href: "/research" };
const CREATOR_HUB: AppBreadcrumbItem = { ko: "창작 허브", en: "Creator hub", href: "/creator-hub" };
const SETTINGS: AppBreadcrumbItem = { ko: "설정", en: "Settings", href: "/settings" };

/**
 * 주요 2뎁스 이상 경로의 브레드크럼 트레일.
 *
 * 큐레이션 방식으로 운영한다: 라벨은 사람이 고른 한·영 문구를 그대로 쓰며,
 * 등록되지 않은 경로는 빈 배열을 돌려준다(브레드크럼 미표시). 새 경로를 추가할
 * 때는 이 테이블에 한 줄을 더하고 `withRouteBreadcrumb`으로 감싸면 된다.
 */
const CURATED_TRAILS: Record<string, AppBreadcrumbItem[]> = {
  "/market/browse": trail(MARKET, "둘러보기", "Browse"),
  "/market/fit": trail(MARKET, "핏 랩", "Fit lab"),
  "/market/publish": trail(MARKET, "에셋 등록", "Publish"),
  "/market/manage": trail(MARKET, "내 등록 에셋", "My assets"),
  "/market/library": trail(MARKET, "내 보관함", "Library"),
  "/market/wishlist": trail(MARKET, "찜 목록", "Wishlist"),
  "/market/compare": trail(MARKET, "비교", "Compare"),
  "/community/cafes": trail(COMMUNITY, "장르 카페", "Cafes"),
  "/community/events": trail(COMMUNITY, "이벤트", "Events"),
  "/community/promote": trail(COMMUNITY, "홍보 게시판", "Promote"),
  "/collaborate": [HOME, { ko: "구인·의뢰", en: "Collaboration" }],
  "/team/recruiting": [HOME, { ko: "협업", en: "Team", href: "/team" }, { ko: "인재·지원 관리", en: "Recruiting" }],
  "/about/workflow": trail(ABOUT, "제작 과정", "Workflow"),
  "/about/principles": trail(ABOUT, "제품 원칙", "Principles"),
  "/about/technology": [HOME, ABOUT, { ko: "기술", en: "Technology" }],
  "/about/technology/story": [HOME, ABOUT, TECHNOLOGY, { ko: "개발 스토리", en: "Story" }],
  "/about/technology/guides": [HOME, ABOUT, TECHNOLOGY, { ko: "가이드", en: "Guides" }],
  "/about/technology/references": [HOME, ABOUT, TECHNOLOGY, { ko: "레퍼런스", en: "References" }],
  "/about/technology/field-notes": [HOME, ABOUT, TECHNOLOGY, { ko: "필드 노트", en: "Field notes" }],
  "/about/technology/deck": [HOME, ABOUT, TECHNOLOGY, { ko: "기술 덱", en: "Deck" }],
  "/about/technology/videos": [HOME, ABOUT, TECHNOLOGY, { ko: "영상", en: "Videos" }],
  "/about/technology/licenses": [HOME, ABOUT, TECHNOLOGY, { ko: "라이선스", en: "Licenses" }],
  "/about/technology/glossary": [HOME, ABOUT, TECHNOLOGY, { ko: "기술 용어집", en: "Glossary" }],
  "/product-tour": [HOME, { ko: "제품 투어", en: "Product tour" }],
  "/brand-film": [HOME, { ko: "브랜드 필름", en: "Brand film" }],
  "/membership": [HOME, { ko: "멤버십", en: "Membership" }],
  "/membership/usage": [HOME, { ko: "멤버십", en: "Membership", href: "/membership" }, { ko: "이용 내역", en: "Usage" }],
  "/account/points": [HOME, { ko: "내 정보", en: "My profile", href: "/me" }, { ko: "포인트 지갑", en: "Points wallet" }],
  "/settings/ai": trail(SETTINGS, "AI 설정", "AI settings"),
  "/settings/integrations": trail(SETTINGS, "연동", "Integrations"),
  "/settings/api-keys": [HOME, SETTINGS, { ko: "연동", en: "Integrations", href: "/settings/integrations" }, { ko: "API 키 허브", en: "API key hub" }],
  "/studio/new": trail(STUDIO, "새 작품", "New work"),
  "/studio/import": trail(STUDIO, "가져오기", "Import"),
  "/studio/assets": trail(STUDIO, "작품 재료", "Assets"),
  "/studio/toolchain": trail(STUDIO, "툴체인", "Toolchain"),
  "/studio/engines": trail(STUDIO, "엔진", "Engines"),
  "/studio/jobs": trail(STUDIO, "작업", "Jobs"),
  "/studio/growth": trail(STUDIO, "그로스 랩", "Growth lab"),
  "/studio/manual": trail(STUDIO, "매뉴얼", "Manual"),
  "/production/projects": trail(PRODUCTION, "프로젝트", "Projects"),
  "/production/workspaces": trail(PRODUCTION, "워크스페이스", "Workspaces"),
  "/research/assets": trail(RESEARCH, "레퍼런스 아틀라스", "Reference atlas"),
  "/research/catalog": trail(RESEARCH, "작품 리서치 랩", "Catalog lab"),
  "/research/books": trail(RESEARCH, "만화·도서 판본", "Books"),
  "/research/open-data": trail(RESEARCH, "공개 데이터 창작실", "Open data"),
  "/creator-hub/references": trail(CREATOR_HUB, "창작 레퍼런스", "References"),
  "/story-lab": [HOME, { ko: "스토리 연구실", en: "Story lab" }],
  "/learn/recipes": [HOME, { ko: "웹툰 배우기", en: "Learn" }, { ko: "제작 레시피", en: "Recipes" }],
  "/ecosystem/education": [HOME, { ko: "생태계", en: "Ecosystem", href: "/ecosystem" }, { ko: "교육 허브", en: "Education" }],
  "/pricing": [HOME, { ko: "요금제", en: "Pricing" }],
};

/** 경로에 대한 브레드크럼 트레일을 돌려준다. 큐레이션에 없으면 빈 배열. */
export function resolveBreadcrumbTrail(pathname: string): AppBreadcrumbItem[] {
  const canonical = canonicalSitePath(pathname);
  return CURATED_TRAILS[canonical] ?? [];
}
