import Link from "next/link";
import { spectrumGradient } from "@/lib/genre-color";

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "탐색",
    links: [
      { label: "통합 검색", href: "/search" },
      { label: "통합 랭킹", href: "/ranking" },
      { label: "연재 캘린더", href: "/calendar" },
      { label: "맞춤 추천", href: "/recommend" },
      { label: "장르 스펙트럼", href: "/explore" },
    ],
  },
  {
    title: "커뮤니티",
    links: [
      { label: "리뷰 피드", href: "/reviews" },
      { label: "트렌드 대시보드", href: "/insights" },
      { label: "내 서재", href: "/library" },
      { label: "취향 분석", href: "/library?tab=taste" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-panel/40">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <span
              className="size-7 rounded-[0.5rem] ring-1 ring-white/10"
              style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF"], 135) }}
            />
            <span className="font-display text-lg font-bold tracking-[-0.02em]">WEBDEX</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-fg-3">
            네이버·카카오·리디·문피아·노벨피아를 가로지르는 웹툰·웹소설 통합 인덱스. 무엇을, 어디서,
            왜 봐야 하는지 한 곳에서 답합니다.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-fg-3/70">
            작품 메타데이터와 조회·관심·별점은 <span className="text-fg-2">네이버 웹툰·시리즈에서 수집한
            실데이터</span>입니다. 평가 수·분포·완독률 등 일부 보조 지표와 리뷰는 데모용 추정·예시입니다.
          </p>
        </div>

        {COLS.map((col) => (
          <nav key={col.title} className="flex flex-col gap-3">
            <h4 className="eyebrow text-fg-3">{col.title}</h4>
            {col.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-fg-2 transition-colors hover:text-fg"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-1 px-4 py-5 text-xs text-fg-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2025 WEBDEX · 포트폴리오 데모</span>
          <span className="font-display tracking-wide">활자와 스펙트럼 · TYPE & SPECTRUM</span>
        </div>
      </div>
    </footer>
  );
}
