import { formatI18nTemplate, translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  CircleHelp,
  FolderOpen,
  Palette,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";

import { SiteDirectoryPersonalized } from "./SiteDirectoryPersonalized";
import { SiteDirectorySearch } from "./SiteDirectorySearch";
import {
  PERSONAL_DESTINATIONS,
  SITEMAP_CORE_DESTINATION_GROUPS,
  SITEMAP_DIRECTORY_ENTRIES,
  SITEMAP_EXTENDED_DESTINATION_GROUPS,
} from "./site-directory-data";

import {
  siteNavigationLocale,
  siteNavigationText,
} from "@/shared/components/site-navigation";
import { Container } from "@/shared/components/section";
import { useI18n, useT } from "@/shared/lib/i18n";
import { resolveSiteRouteMetadata } from "@/shared/lib/site-route-metadata";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("SitemapPage", ko, en);

const PAGE_COPY = {
  ko: {
    eyebrow: "TOONSTUDIO DIRECTORY",
    title: "서비스 전체를\n한눈에 찾으세요.",
    description: "새 프로젝트를 시작하는 순간부터 드로잉·3D·AI·소재·학습·공유·커뮤니티·지원까지, 하고 싶은 일 기준으로 가장 가까운 화면부터 찾을 수 있게 다시 정리했습니다.",
    newProject: "새 프로젝트",
    projects: "프로젝트 목록",
    brandFilm: "전체 제품 투어 보기",
    search: "작품 검색",
    core: "목적별 빠른 시작",
    coreDescription: "제작 시작, 배우고 준비하기, 작품 발견, 함께하고 관리하기 네 흐름으로 자주 쓰는 목적지를 먼저 모았습니다.",
    personal: "내 공간과 환경",
    extended: "전체 기능과 페이지",
    extendedDescription: "직접 열 수 있는 제작·3D·AI·학습·에셋·리서치·데이터·지원 페이지를 역할별로 나눠 빠르게 훑을 수 있습니다.",
  },
  en: {
    eyebrow: "TOONSTUDIO DIRECTORY",
    title: "See the whole service\nat a glance.",
    description: "From starting a project to drawing, 3D, AI, assets, learning, sharing, community and support, the directory is organized around what you want to do next.",
    newProject: "New project",
    projects: "Project list",
    brandFilm: "Watch full product tour",
    search: "Search stories",
    core: "Start by purpose",
    coreDescription: "Frequent destinations are grouped into four flows: create, prepare, discover, and connect or manage.",
    personal: "Your space and preferences",
    extended: "All features and pages",
    extendedDescription: "Scan every directly accessible creation, 3D, AI, learning, asset, research, data and support page by role.",
  },
} as const;

function RouteConditionBadges({ href, locale: _locale }: { href: string; locale: "ko" | "en" }) {
  useBilingualI18nRevision();
  const metadata = resolveSiteRouteMetadata(href);
  const labels = bi({ beta: "베타", experimental: "실험", "sign-in": "로그인 필요", project: "프로젝트 필요", desktop: "데스크톱 권장" }, { beta: "Beta", experimental: "Experimental", "sign-in": "Sign-in required", project: "Project required", desktop: "Desktop recommended" });
  const badges = [
    metadata.maturity === "beta" ? { key: "beta", label: labels.beta, tone: "accent" } : null,
    metadata.maturity === "experimental" ? { key: "experimental", label: labels.experimental, tone: "warning" } : null,
    metadata.access === "sign-in" ? { key: "sign-in", label: labels["sign-in"], tone: "neutral" } : null,
    metadata.access === "project" ? { key: "project", label: labels.project, tone: "warning" } : null,
    metadata.device === "desktop-first" ? { key: "desktop", label: labels.desktop, tone: "neutral" } : null,
  ].filter((badge): badge is { key: string; label: string; tone: string } => badge !== null);
  if (!badges.length) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1" aria-label={bi("사용 조건", "Usage conditions")}>
      {badges.map((badge) => (
        <small
          key={badge.key}
          data-tone={badge.tone}
          className="inline-flex min-h-5 items-center rounded-full border border-line bg-panel px-2 text-[0.58rem] font-bold leading-none text-fg-3 data-[tone=accent]:border-accent/30 data-[tone=accent]:text-accent data-[tone=warning]:border-warn/40 data-[tone=warning]:bg-warning-soft data-[tone=warning]:text-fg"
        >
          {badge.label}
        </small>
      ))}
    </span>
  );
}

export function SitemapPage() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const copy = bi((PAGE_COPY).ko, (PAGE_COPY).en);
  const t = useT();

  return (
    <Container size="wide" className="py-6 sm:py-10 lg:py-14">
      <section
        className="relative overflow-hidden rounded-[1.75rem] border border-line/70 bg-gradient-to-br from-panel via-card to-raised/70 p-6 shadow-lg sm:p-9 lg:p-12"
        aria-labelledby="sitemap-title"
      >
        <span aria-hidden="true" className="absolute -right-20 -top-24 size-72 rounded-full border border-accent/20" />
        <span aria-hidden="true" className="absolute -right-6 -top-8 size-40 rounded-full border border-line-strong/45" />
        <div className="relative max-w-4xl">
          <p className="flex items-center gap-2 font-display text-[0.66rem] font-bold uppercase tracking-[0.16em] text-accent">
            <Sparkles size={14} aria-hidden="true" />{copy.eyebrow}
          </p>
          <h1
            id="sitemap-title"
            className="mt-4 whitespace-pre-line font-display text-[clamp(2.35rem,7vw,4.75rem)] font-bold leading-[0.98] tracking-[-0.06em] text-fg [text-wrap:balance]"
          >
            {copy.title}
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
            {copy.description}
          </p>
          <div className="mt-7 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <Link
              href="/studio/new"
              className="group inline-flex min-h-14 items-center gap-3 rounded-2xl border border-fg bg-fg px-4 py-3 text-sm font-bold text-canvas shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <Palette size={18} aria-hidden="true" />
              <span>{copy.newProject}</span>
              <ArrowRight size={15} className="ml-auto transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="/studio"
              className="group inline-flex min-h-14 items-center gap-3 rounded-2xl border border-line-strong bg-card/80 px-4 py-3 text-sm font-bold text-fg-2 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
            >
              <FolderOpen size={18} aria-hidden="true" />
              <span>{copy.projects}</span>
              <ArrowRight size={15} className="ml-auto transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="/product-tour"
              className="group inline-flex min-h-14 items-center gap-3 rounded-2xl border border-accent/35 bg-accent-soft/70 px-4 py-3 text-sm font-bold text-accent transition-all hover:-translate-y-0.5 hover:border-accent/60"
            >
              <Sparkles size={18} aria-hidden="true" />
              <span>{copy.brandFilm}</span>
              <ArrowRight size={15} className="ml-auto transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link
              href="/search"
              className="group inline-flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-panel/75 px-4 py-3 text-sm font-bold text-fg-2 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:text-fg"
            >
              <Search size={18} aria-hidden="true" />
              <span>{copy.search}</span>
              <ArrowRight size={15} className="ml-auto transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <SiteDirectorySearch entries={SITEMAP_DIRECTORY_ENTRIES} locale={locale} />
      <SiteDirectoryPersonalized entries={SITEMAP_DIRECTORY_ENTRIES} locale={locale} />

      <section className="mt-12 sm:mt-16" aria-labelledby="sitemap-core-title">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">{translateCurrentStaticSourceText("domains.legal.SitemapPage", "en", "01 · START HERE")}</p>
            <h2 id="sitemap-core-title" className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
              {copy.core}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-3">{copy.coreDescription}</p>
          </div>
          <span className="hidden font-display text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-fg-3 sm:block">
            {translateCurrentStaticSourceText("domains.legal.SitemapPage", "en", "Create · Learn · Discover · Connect")}</span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {SITEMAP_CORE_DESTINATION_GROUPS.map((group, groupIndex) => (
            <section
              key={group.id}
              className="rounded-3xl border border-line/70 bg-panel/45 p-4 shadow-sm sm:p-5"
              aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.SitemapPage", "en", "sitemap-{v0}"), { v0: String(group.id) })}
            >
              <div className="flex items-start gap-3 px-1 pb-4 sm:px-2">
                <span aria-hidden="true" className="pt-0.5 font-display text-[0.62rem] font-bold tracking-[0.14em] text-accent">
                  {String(groupIndex + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.SitemapPage", "en", "sitemap-{v0}"), { v0: String(group.id) })} className="font-display text-lg font-bold text-fg">
                    {siteNavigationText(group.label, locale)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-fg-3">
                    {siteNavigationText(group.description, locale)}
                  </p>
                </div>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="group flex min-h-[6.25rem] h-full items-start gap-3 rounded-2xl border border-line bg-card/75 p-3.5 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/30 group-hover:text-accent">
                          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 pt-0.5">
                          <strong className="block text-sm font-bold text-fg transition-colors group-hover:text-accent">
                            {siteNavigationText(item.label, locale)}
                          </strong>
                          <span className="mt-1 block text-xs leading-5 text-fg-3">
                            {siteNavigationText(item.description, locale)}
                          </span>
                          <RouteConditionBadges href={item.href} locale={locale} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section
        className="mt-6 rounded-3xl border border-line/70 bg-gradient-to-r from-accent-soft/70 via-panel/70 to-panel/40 p-4 sm:p-5"
        aria-labelledby="sitemap-personal-title"
      >
        <div className="mb-4 flex items-center gap-3 px-1 sm:px-2">
          <span className="grid size-9 place-items-center rounded-xl border border-accent/25 bg-card/70 text-accent">
            <UserRound size={17} aria-hidden="true" />
          </span>
          <h2 id="sitemap-personal-title" className="font-display text-base font-bold text-fg">{copy.personal}</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PERSONAL_DESTINATIONS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                title={siteNavigationText(item.description, locale)}
                className="group flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-card/75 px-4 py-3 text-sm font-bold text-fg-2 transition-colors hover:border-line-strong hover:bg-card hover:text-fg"
              >
                <Icon size={17} className="text-fg-3 transition-colors group-hover:text-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block">{siteNavigationText(item.label, locale)}</span>
                  <RouteConditionBadges href={item.href} locale={locale} />
                </span>
                <ArrowRight size={15} className="ml-auto text-fg-3" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-12 border-t border-line/70 pt-12 sm:mt-16 sm:pt-16" aria-labelledby="sitemap-extended-title">
        <div>
          <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">{translateCurrentStaticSourceText("domains.legal.SitemapPage", "en", "02 · COMPLETE DIRECTORY")}</p>
          <h2 id="sitemap-extended-title" className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
            {copy.extended}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-3">{copy.extendedDescription}</p>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {SITEMAP_EXTENDED_DESTINATION_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const titleId = formatI18nTemplate(
              translateCurrentStaticSourceText("domains.legal.SitemapPage", "en", "sitemap-extended-{v0}"),
              { v0: String(group.id) },
            );
            return (
              <details
                key={group.id}
                className="group rounded-3xl border border-line/70 bg-panel/35 open:bg-panel/55"
              >
                <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 rounded-3xl px-4 py-4 outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-3 transition-colors group-open:border-accent/35 group-open:text-accent">
                    <GroupIcon size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong id={titleId} className="block font-display text-base font-bold text-fg">
                      {siteNavigationText(group.label, locale)}
                    </strong>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-fg-3">
                      {siteNavigationText(group.description, locale)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-bold text-fg-3 group-open:border-accent/30 group-open:text-accent">
                    {group.items.length}
                  </span>
                  <span aria-hidden="true" className="text-lg text-fg-3 transition-transform group-open:rotate-45 group-open:text-accent">＋</span>
                </summary>
                <div className="border-t border-line/70 px-3 pb-4 pt-3 sm:px-5 sm:pb-5">
                  <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2" aria-labelledby={titleId}>
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="group/link flex min-h-[4.25rem] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                        >
                          <span aria-hidden="true" className="h-px w-2.5 shrink-0 rounded-full bg-line-strong transition-all group-hover/link:w-4 group-hover/link:bg-accent" />
                          <span className="min-w-0">
                            <strong className="block truncate text-sm font-semibold text-fg-2 transition-colors group-hover/link:text-accent">
                              {siteNavigationText(item.label, locale)}
                            </strong>
                            <span className="mt-0.5 line-clamp-1 block text-[0.69rem] leading-5 text-fg-3">
                              {siteNavigationText(item.description, locale)}
                            </span>
                            <RouteConditionBadges href={item.href} locale={locale} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-line/70 bg-card/55 p-5 sm:flex-row sm:items-center sm:justify-between" aria-label={t("footer.link.support")}>
        <div className="flex items-start gap-3">
          <CircleHelp size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="max-w-2xl text-sm leading-6 text-fg-2">
            {bi("원하는 메뉴를 찾기 어렵거나 기능 제안이 있다면 이용 문의와 제보·제안에서 바로 알려주세요.", "When a destination is hard to find or you have an idea, reach us through Support or Feedback.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/support" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-panel px-4 py-2 text-sm font-bold text-fg-2 hover:text-accent">
            {bi("이용 문의", "Support")}
          </Link>
          <Link href="/feedback" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fg bg-fg px-4 py-2 text-sm font-bold text-canvas">
            {bi("제보·제안", "Feedback")}<ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </Container>
  );
}
