// 사업자 정보·법적 링크 단일 소스(웹 SiteFooter · 토스 InfoPage 공유).
// 웹과 토스가 같은 사업자 표기/약관 링크를 쓰도록 여기 한 곳에 둔다(중복·드리프트 방지).
// 표기 항목이 바뀌면 이 파일만 고치면 양쪽이 함께 갱신된다.

/** 운영 사이트(웹) 정본 origin — 토스 미니앱에서 약관/정책으로 아웃링크할 때 절대 URL의 베이스. */
export const SITE_URL = "https://toonspectrum.vercel.app" as const;

/** 통신판매·개인정보 관련 사업자 정보(전자상거래법/정보통신망법 표기 의무 항목). */
export const BUSINESS_INFO = {
  /** 상호. */
  name: "에이치준랩스",
  /** 대표자. */
  ceo: "김희준",
  /** 개인정보보호책임자(현재 대표와 동일). */
  privacyOfficer: "김희준",
  /** 사업자등록번호. */
  registrationNumber: "355-07-03473",
  /** 사업장 주소. */
  address: "서울특별시 송파구 가락로34길 13, 101호(방이동)",
  /** 대표 이메일. */
  email: "blue45f@gmail.com",
  /** 대표 전화번호. */
  phone: "010-3873-4197",
  /** 호스팅 사업자. */
  hosting: "Vercel (Frontend)",
  /** 서비스 형태 한 줄 설명. */
  serviceType: "웹툰·웹소설 통합 검색 및 분석 인덱스",
} as const;

/** 정책/약관 문서 — path 는 웹 라우트, url 은 토스 아웃링크용 절대 URL. */
export const LEGAL_LINKS = [
  { label: "이용약관", path: "/terms" },
  { label: "개인정보처리방침", path: "/privacy" },
  { label: "저작권·콘텐츠 안내", path: "/copyright" },
] as const;

/** path → 정본 사이트 절대 URL(토스 WebView 아웃링크/공유용). */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
