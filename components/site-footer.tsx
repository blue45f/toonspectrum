import { ToonSpectrumMark } from "./visual-marks";

import { spectrumGradient } from "@/lib/genre-color";
import { useT } from "@/lib/i18n";
import Link from "@/src/compat/router-link";

// 약관·개인정보처리방침은 내부 페이지(/terms·/privacy)가 TermsDesk 게시 정본을 렌더한다.
// 문의는 내부 /support(desk-platform 공개 게시판)로 통합 — 외부 지원 보드 링크는 제거했다.

const COLS: { titleKey: string; links: { key: string; href: string }[] }[] = [
  {
    titleKey: "footer.section.browse",
    links: [
      { key: "footer.link.search", href: "/search" },
      { key: "footer.link.ranking", href: "/ranking" },
      { key: "footer.link.calendar", href: "/calendar" },
      { key: "footer.link.recommend", href: "/recommend" },
      { key: "footer.link.explore", href: "/explore" },
      { key: "footer.link.tags", href: "/tags" },
    ],
  },
  {
    titleKey: "footer.section.community",
    links: [
      { key: "footer.link.community", href: "/community" },
      { key: "footer.link.pencafes", href: "/community/cafes" },
      { key: "footer.link.reviews", href: "/reviews" },
      { key: "footer.link.compare", href: "/compare" },
      { key: "footer.link.dashboard", href: "/insights" },
      { key: "footer.link.feedback", href: "/feedback" },
      { key: "footer.link.library", href: "/library" },
      { key: "footer.link.taste", href: "/library?tab=taste" },
    ],
  },
  {
    // 창작 표면(/create·/studio·/shaper·/market)은 사이트맵 색인과 같은 이유로 푸터에서도 빠지지 않는다.
    titleKey: "footer.section.create",
    links: [
      { key: "footer.link.create", href: "/create" },
      { key: "footer.link.studio", href: "/studio" },
      { key: "footer.link.shaper", href: "/shaper" },
      { key: "footer.link.market", href: "/market" },
    ],
  },
  {
    titleKey: "footer.section.brand",
    links: [
      { key: "footer.link.news", href: "/news" },
      { key: "footer.link.about", href: "/about" },
      { key: "footer.link.guide", href: "/guide" },
      { key: "footer.link.sitemap", href: "/sitemap" },
      { key: "footer.link.settings", href: "/settings" },
    ],
  },
  {
    titleKey: "footer.section.help",
    links: [
      { key: "footer.link.support", href: "/support" },
      { key: "footer.link.terms", href: "/terms" },
      { key: "footer.link.privacy", href: "/privacy" },
      { key: "footer.link.copyright", href: "/copyright" },
    ],
  },
];

export function SiteFooter() {
  const t = useT();
  const year = new Date().getFullYear();

  return (
    <footer
      data-site-chrome="footer"
      className="relative mt-24 border-t border-line/60 bg-gradient-to-b from-card/60 to-card/25 pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0"
    >
      {/* 시그니처 스펙트럼 헤어라인 — 히어로 상단 스트립과 호응해 페이지를 양 끝에서 닫는다. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF", "스릴러", "드라마"], 90) }}
      />
      {/* 다섯 개 링크 칼럼 — md 에서는 3열(브랜드 + 2/3열), xl 부터 한 줄에 펼친다(칼럼당 ≥ 8rem 유지). */}
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-3 xl:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr] xl:gap-8">
        <div className="max-w-sm">
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <ToonSpectrumMark className="size-7 rounded-[0.55rem] transition-transform duration-200 ease-out-expo group-hover:-rotate-6 group-hover:scale-105" />
            <span className="font-display text-lg font-bold transition-colors group-hover:text-accent">
              {t("footer.brand")}
            </span>
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-fg-2">{t("footer.description.primary")}</p>
          <p className="mt-4 text-xs leading-relaxed text-fg-3">
            <span className="text-fg-2">{t("footer.description.secondary")}</span>
          </p>
        </div>

        {COLS.map((col) => (
          <nav
            key={col.titleKey}
            className="flex flex-col gap-3 rounded-xl border border-line/60 bg-card/20 p-4"
          >
            <h2 className="eyebrow text-fg-3">{t(col.titleKey)}</h2>
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
                  {t(l.key)}
                </span>
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="border-t border-line/60">
        <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 text-[11px] text-fg-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("footer.copyrightLine").replace("{year}", String(year))}</span>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-7 rounded-full"
                style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF"], 90) }}
              />
              <span className="eyebrow text-[0.6rem] text-fg-3">{t("footer.logoTag")}</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
