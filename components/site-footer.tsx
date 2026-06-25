import { BUSINESS_INFO } from "@toonspectrum/core";

import { ToonSpectrumMark } from "./visual-marks";

import { spectrumGradient } from "@/lib/genre-color";
import Link from "@/src/compat/router-link";

// 약관·개인정보처리방침은 내부 페이지(/terms·/privacy)가 TermsDesk 게시 정본을 렌더한다.
// 문의는 내부 /support(desk-platform 공개 게시판)로 통합 — 외부 지원 보드 링크는 제거했다.

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "탐색",
    links: [
      { label: "통합 검색", href: "/search" },
      { label: "통합 랭킹", href: "/ranking" },
      { label: "연재 캘린더", href: "/calendar" },
      { label: "맞춤 추천", href: "/recommend" },
      { label: "장르 스펙트럼", href: "/explore" },
      { label: "태그로 찾기", href: "/tags" },
    ],
  },
  {
    title: "커뮤니티",
    links: [
      { label: "커뮤니티 허브", href: "/community" },
      { label: "장르 카페", href: "/community/cafes" },
      { label: "리뷰 피드", href: "/reviews" },
      { label: "작품 비교", href: "/compare" },
      { label: "트렌드 대시보드", href: "/insights" },
      { label: "의견 게시판", href: "/feedback" },
      { label: "내 서재", href: "/library" },
      { label: "취향 분석", href: "/library?tab=taste" },
    ],
  },
  {
    title: "툰스펙트럼",
    links: [
      { label: "웹툰·웹소설 소식", href: "/news" },
      { label: "서비스 소개", href: "/about" },
      { label: "랭킹 산정 방식", href: "/guide" },
      { label: "사이트맵", href: "/sitemap" },
      { label: "설정", href: "/settings" },
    ],
  },
  {
    title: "이용 안내",
    links: [
      { label: "문의", href: "/support" },
      { label: "이용약관", href: "/terms" },
      { label: "개인정보처리방침", href: "/privacy" },
      { label: "저작권·콘텐츠 안내", href: "/copyright" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-line/60 bg-gradient-to-b from-card/60 to-card/25">
      {/* 시그니처 스펙트럼 헤어라인 — 히어로 상단 스트립과 호응해 페이지를 양 끝에서 닫는다. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF", "스릴러", "드라마"], 90) }}
      />
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <ToonSpectrumMark className="size-7 rounded-[0.55rem] transition-transform duration-200 ease-out-expo group-hover:-rotate-6 group-hover:scale-105" />
            <span className="font-display text-lg font-bold transition-colors group-hover:text-accent">
              툰스펙트럼
            </span>
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-fg-2">
            네이버 웹툰·시리즈와 카카오웹툰을 가로지르는 웹툰·웹소설 통합 인덱스. 무엇을, 어디서,
            왜 봐야 하는지 한 곳에서 답합니다.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-fg-3">
            작품 메타데이터·표지는 <span className="text-fg-2">여러 국내 웹툰·웹소설 플랫폼의 공개 카탈로그에서
            수집한 실데이터</span>입니다. 네이버 웹툰의 별점은 실수집값이며, 조회·관심수는 네이버가 공개 집계를
            비공개로 전환해 추정값(≈)으로 표기합니다. 그 외 플랫폼의 평점·조회·평가 수·완독률 등 일부 지표는
            추정값(≈)으로 표기합니다.
          </p>
        </div>

        {COLS.map((col) => (
          <nav key={col.title} className="flex flex-col gap-3 rounded-xl border border-line/60 bg-card/20 p-4">
            <h4 className="eyebrow text-fg-3">{col.title}</h4>
            {col.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group/link inline-flex w-fit items-center gap-1.5 text-sm text-fg-2 transition-colors hover:text-accent"
              >
                {/* hover 시 좌→우로 자라나는 accent 틱 — 미세 마이크로 인터랙션. */}
                <span
                  aria-hidden
                  className="h-px w-0 origin-left rounded-full bg-accent/70 transition-all duration-200 ease-out-expo group-hover/link:w-3"
                />
                <span className="transition-transform duration-200 ease-out-expo group-hover/link:translate-x-0.5">
                  {l.label}
                </span>
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="border-t border-line/60">
        <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6 text-[11px] text-fg-3 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 leading-relaxed">
            {/* 사업자 표기 = @toonspectrum/core BUSINESS_INFO 단일 소스(토스 InfoPage와 공유) */}
            <div>
              <p className="font-semibold text-fg-2">상호: {BUSINESS_INFO.name}</p>
              <p>대표자: {BUSINESS_INFO.ceo} | 개인정보보호책임자: {BUSINESS_INFO.privacyOfficer}</p>
            </div>
            <div>
              <p>사업자등록번호: {BUSINESS_INFO.registrationNumber}</p>
              <p>주소: {BUSINESS_INFO.address}</p>
            </div>
            <div>
              <p>이메일: {BUSINESS_INFO.email}</p>
              <p>전화번호: {BUSINESS_INFO.phone}</p>
            </div>
            <div>
              <p>호스팅 서비스: {BUSINESS_INFO.hosting}</p>
              <p>플랫폼 형태: {BUSINESS_INFO.serviceType}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-line/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} 툰스펙트럼 (Beta). All rights reserved.</span>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-7 rounded-full"
                style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF"], 90) }}
              />
              <span className="eyebrow text-[0.6rem] text-fg-3">Type &amp; Spectrum</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
