import Link from "@/src/compat/router-link";
import { ToonSpectrumMark } from "./visual-marks";

const TERMSDESK_BASE = "https://termsdesk.vercel.app";
// 약관·개인정보처리방침은 내부 페이지(/terms·/privacy)가 TermsDesk 게시 정본을 렌더한다.
// 지원 보드만 외부(TermsDesk) 링크를 유지한다.
const SUPPORT_URL = `${TERMSDESK_BASE}/support/webtoon-index`;

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
      { label: "설정", href: "/settings" },
    ],
  },
  {
    title: "이용 안내",
    links: [
      { label: "이용약관", href: "/terms" },
      { label: "개인정보처리방침", href: "/privacy" },
      { label: "저작권·콘텐츠 안내", href: "/copyright" },
      { label: "지원", href: SUPPORT_URL },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line/60 bg-[linear-gradient(to_bottom,oklch(0.185_0.018_68/0.55),oklch(0.17_0.018_68/0.32))]">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <ToonSpectrumMark className="size-7 rounded-[0.55rem]" />
            <span className="font-display text-lg font-bold">툰스펙트럼</span>
          </div>
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
                target={l.href.startsWith(TERMSDESK_BASE) ? "_blank" : undefined}
                rel={l.href.startsWith(TERMSDESK_BASE) ? "noreferrer" : undefined}
                className="inline-flex items-center text-sm text-fg-2 transition-colors hover:text-accent"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="border-t border-line/60">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-1 px-4 py-5 text-xs text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2026 툰스펙트럼</span>
        </div>
      </div>
    </footer>
  );
}
