import {
  ArrowRight,
  CircleHelp,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";

import { SiteDirectoryPersonalized } from "./SiteDirectoryPersonalized";
import { SiteDirectorySearch } from "./SiteDirectorySearch";
import {
  PERSONAL_DESTINATIONS,
  SITEMAP_DIRECTORY_ENTRIES,
  SITEMAP_EXTENDED_DESTINATION_GROUPS,
} from "./site-directory-data";

import {
  SITE_NAVIGATION_GROUPS,
  siteNavigationLocale,
  siteNavigationText,
} from "@/shared/components/site-navigation";
import { Container } from "@/shared/components/section";
import { useI18n, useT } from "@/shared/lib/i18n";
import { resolveSiteRouteMetadata } from "@/shared/lib/site-route-metadata";
import Link from "@/compat/router-link";

const PAGE_COPY = {
  ko: {
    eyebrow: "TOONSTUDIO DIRECTORY",
    title: "하고 싶은 일에서\n바로 시작하세요.",
    description: "기능 이름을 찾기보다 만들기, 발견하기, 성장하기, 함께하기 중 지금의 목적을 고르세요. 전문 도구와 정책은 아래 보조 탐색에서 이어집니다.",
    search: "작품 검색",
    core: "핵심 작업 흐름",
    coreDescription: "자주 쓰는 목적지를 창작 여정에 맞춰 네 갈래로 정리했습니다.",
    personal: "내 공간과 환경",
    extended: "전체 기능과 페이지",
    extendedDescription: "직접 열 수 있는 제작·학습·관리·데이터·정책 페이지를 한곳에 모았습니다.",
    home: "메인으로 돌아가기",
  },
  en: {
    eyebrow: "TOONSTUDIO DIRECTORY",
    title: "Start with what\nyou want to do.",
    description: "Choose your current purpose—create, discover, grow or connect—instead of hunting for a feature name. Specialized tools and policies continue below.",
    search: "Search stories",
    core: "Core creative flow",
    coreDescription: "Frequent destinations are organized into four paths that follow the creative journey.",
    personal: "Your space and preferences",
    extended: "All features and pages",
    extendedDescription: "Browse every directly accessible creation, learning, management, data and policy page.",
    home: "Back to home",
  },
} as const;

function RouteConditionBadges({ href, locale }: { href: string; locale: "ko" | "en" }) {
  const metadata = resolveSiteRouteMetadata(href);
  const labels = locale === "ko"
    ? { beta: "베타", experimental: "실험", "sign-in": "로그인 필요", project: "프로젝트 필요", desktop: "데스크톱 권장" }
    : { beta: "Beta", experimental: "Experimental", "sign-in": "Sign-in required", project: "Project required", desktop: "Desktop recommended" };
  const badges = [
    metadata.maturity === "beta" ? { key: "beta", label: labels.beta, tone: "accent" } : null,
    metadata.maturity === "experimental" ? { key: "experimental", label: labels.experimental, tone: "warning" } : null,
    metadata.access === "sign-in" ? { key: "sign-in", label: labels["sign-in"], tone: "neutral" } : null,
    metadata.access === "project" ? { key: "project", label: labels.project, tone: "warning" } : null,
    metadata.device === "desktop-first" ? { key: "desktop", label: labels.desktop, tone: "neutral" } : null,
  ].filter((badge): badge is { key: string; label: string; tone: string } => badge !== null);
  if (!badges.length) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1" aria-label={locale === "ko" ? "사용 조건" : "Usage conditions"}>
      {badges.map((badge) => (
        <small
          key={badge.key}
          data-tone={badge.tone}
          className="inline-flex min-h-5 items-center rounded-full border border-line bg-panel px-2 text-[0.58rem] font-bold leading-none text-fg-3 data-[tone=accent]:border-accent/30 data-[tone=accent]:text-accent data-[tone=warning]:border-amber-500/35 data-[tone=warning]:text-amber-500"
        >
          {badge.label}
        </small>
      ))}
    </span>
  );
}

export function SitemapPage() {
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const copy = PAGE_COPY[locale];
  const t = useT();

  return (
    <Container size="wide" className="py-6 sm:py-10 lg:py-14">
      <section
        className="relative overflow-hidden rounded-[1.75rem] border border-line/70 bg-gradient-to-br from-panel via-card to-raised/70 p-6 shadow-lg sm:p-9 lg:p-12"
        aria-labelledby="sitemap-title"
      >
        <span aria-hidden="true" className="absolute -right-20 -top-24 size-72 rounded-full border border-accent/20" />
        <span aria-hidden="true" className="absolute -right-6 -top-8 size-40 rounded-full border border-line-strong/45" />
        <div className="relative max-w-3xl">
          <p className="flex items-center gap-2 font-display text-[0.66rem] font-bold uppercase tracking-[0.16em] text-accent">
            <Sparkles size={14} aria-hidden="true" />{copy.eyebrow}
          </p>
          <h1
            id="sitemap-title"
            className="mt-4 whitespace-pre-line font-display text-[clamp(2.35rem,7vw,4.75rem)] font-bold leading-[0.98] tracking-[-0.06em] text-fg [text-wrap:balance]"
          >
            {copy.title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">
            {copy.description}
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href="/search"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-fg bg-fg px-4 py-2.5 text-sm font-bold text-canvas shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <Search size={17} aria-hidden="true" />{copy.search}
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-card/80 px-4 py-2.5 text-sm font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
            >
              {copy.home}<ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <SiteDirectorySearch entries={SITEMAP_DIRECTORY_ENTRIES} locale={locale} />
      <SiteDirectoryPersonalized entries={SITEMAP_DIRECTORY_ENTRIES} locale={locale} />

      <section className="mt-12 sm:mt-16" aria-labelledby="sitemap-core-title">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">01 · PRIMARY PATHS</p>
            <h2 id="sitemap-core-title" className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
              {copy.core}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-3">{copy.coreDescription}</p>
          </div>
          <span className="hidden font-display text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-fg-3 sm:block">
            Create · Share · Discover
          </span>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {SITE_NAVIGATION_GROUPS.map((group, groupIndex) => (
            <section
              key={group.id}
              className="rounded-3xl border border-line/70 bg-panel/45 p-4 shadow-sm sm:p-5"
              aria-labelledby={`sitemap-${group.id}`}
            >
              <div className="flex items-start gap-3 px-1 pb-4 sm:px-2">
                <span aria-hidden="true" className="pt-0.5 font-display text-[0.62rem] font-bold tracking-[0.14em] text-accent">
                  0{groupIndex + 1}
                </span>
                <div>
                  <h3 id={`sitemap-${group.id}`} className="font-display text-lg font-bold text-fg">
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
          <p className="font-display text-[0.64rem] font-bold uppercase tracking-[0.15em] text-accent">02 · COMPLETE DIRECTORY</p>
          <h2 id="sitemap-extended-title" className="mt-2 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
            {copy.extended}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-3">{copy.extendedDescription}</p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {SITEMAP_EXTENDED_DESTINATION_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section
                key={group.id}
                className="rounded-3xl border border-line/70 bg-panel/35 p-4 sm:p-5"
                aria-labelledby={`sitemap-extended-${group.id}`}
              >
                <div className="flex items-start gap-3 px-1 pb-4 sm:px-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-3">
                    <GroupIcon size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 id={`sitemap-extended-${group.id}`} className="font-display text-base font-bold text-fg">
                      {siteNavigationText(group.label, locale)}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-fg-3">
                      {siteNavigationText(group.description, locale)}
                    </p>
                  </div>
                </div>
                <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-raised/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                      >
                        <span aria-hidden="true" className="h-px w-2.5 shrink-0 rounded-full bg-line-strong transition-all group-hover:w-4 group-hover:bg-accent" />
                        <span className="min-w-0">
                          <strong className="block truncate text-sm font-semibold text-fg-2 transition-colors group-hover:text-accent">
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
              </section>
            );
          })}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-line/70 bg-card/55 p-5 sm:flex-row sm:items-center sm:justify-between" aria-label={t("footer.link.support")}>
        <div className="flex items-start gap-3">
          <CircleHelp size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="max-w-2xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "원하는 메뉴를 찾기 어렵거나 기능 제안이 있다면 이용 문의와 제보·제안에서 바로 알려주세요."
              : "When a destination is hard to find or you have an idea, reach us through Support or Feedback."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/support" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-panel px-4 py-2 text-sm font-bold text-fg-2 hover:text-accent">
            {locale === "ko" ? "이용 문의" : "Support"}
          </Link>
          <Link href="/feedback" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fg bg-fg px-4 py-2 text-sm font-bold text-canvas">
            {locale === "ko" ? "제보·제안" : "Feedback"}<ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </Container>
  );
}
