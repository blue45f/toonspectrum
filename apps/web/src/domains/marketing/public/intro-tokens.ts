/**
 * 소개·홍보 페이지가 함께 쓰는 클래스 토큰.
 * 컴포넌트 파일(.tsx)에는 컴포넌트만 두기 위해 상수는 이 파일에 모은다.
 */

/** 고정 머리글 아래로 숨지 않게 섹션 제목에 주는 스크롤 여백. */
export const INTRO_SCROLL_MARGIN = "scroll-mt-[calc(var(--site-header-sticky-offset,5rem)+1rem)]";

/** 구분선이 있는 본문 섹션의 위아래 여백. 모바일에서는 한 화면 안에 제목과 첫 내용이 함께 보이게 좁게 둔다. */
export const INTRO_SECTION = "border-t border-line/70 py-8 sm:py-12";

/** 소개 페이지 본문 폭(와이드 컨테이너)과 첫 화면 위아래 여백. */
export const INTRO_PAGE = "py-5 sm:py-8 lg:py-10";

/** 카드(링크) 공통 표면: 얇은 경계선 + 라운드 + 호버 시 보라 테두리 + 보이는 초점 링. */
export const INTRO_CARD =
  "rounded-2xl border border-line/70 bg-card/65 transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";
