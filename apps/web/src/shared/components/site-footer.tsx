import { ArrowRight, Sparkles } from "lucide-react";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  siteNavigationLocale,
  siteNavigationText,
} from "./site-navigation";
import { ToonSpectrumMark } from "./visual-marks";

import Link from "@/compat/router-link";
import { spectrumGradient } from "@/shared/lib/genre-color";
import { useI18n, useT } from "@/shared/lib/i18n";

const META_LINKS = [
  { key: "footer.link.about", href: "/about" },
  { key: "footer.link.guide", href: "/guide" },
  { key: "footer.link.sitemap", href: "/sitemap" },
  { key: "footer.link.support", href: "/support" },
] as const;

const POLICY_LINKS = [
  { key: "footer.link.terms", href: "/terms" },
  { key: "footer.link.privacy", href: "/privacy" },
  { key: "footer.link.copyright", href: "/copyright" },
] as const;

export function SiteFooter() {
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const year = new Date().getFullYear();
  const siteBrand = t("app.name");
  const studio = SITE_NAVIGATION_ITEMS.studio;
  const research = SITE_NAVIGATION_ITEMS.research;

  // Older translations can still include the former product name. Navigation labels
  // always resolve to the canonical brand without touching user or policy content.
  const navigationLabel = (key: string) =>
    t(key).replaceAll(/ToonSpectrum|툰스펙트럼/g, () => siteBrand);

  return (
    <footer
      data-site-chrome="footer"
      className="relative mt-24 overflow-hidden border-t border-line/60 bg-gradient-to-b from-card/55 via-panel/45 to-canvas pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF", "스릴러", "드라마"], 90) }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute -right-24 top-10 size-80 rounded-full border border-line/35 opacity-55" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 top-28 size-44 rounded-full border border-accent/20 opacity-60" />

      <div className="relative mx-auto max-w-[1320px] px-4 pt-10 sm:px-6 sm:pt-14">
        <section className="grid gap-6 rounded-3xl border border-line/70 bg-panel/72 p-6 shadow-lg backdrop-blur-xl md:grid-cols-[1fr_auto] md:items-center md:p-8" aria-labelledby="footer-creative-title">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 font-display text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent">
              <Sparkles size={14} aria-hidden="true" />
              {locale === "ko" ? "YOUR NEXT SCENE" : "YOUR NEXT SCENE"}
            </p>
            <h2 id="footer-creative-title" className="mt-3 font-display text-2xl font-bold tracking-[-0.035em] text-fg sm:text-3xl">
              {locale === "ko" ? "떠올리고, 조사하고, 만드는 흐름을 한곳에서." : "Spark, research and make in one connected flow."}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-fg-2">
              {locale === "ko"
                ? "빈 캔버스에서 막히지 않도록, 지금 필요한 다음 행동으로 바로 연결합니다."
                : "Move directly to the next action you need, without getting stuck at a blank canvas."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Link
              href={research.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2.5 text-sm font-bold text-fg-2 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:text-accent"
            >
              {siteNavigationText(research.label, locale)}<ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link
              href={studio.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fg bg-fg px-4 py-2.5 text-sm font-bold text-canvas shadow-sm transition-all hover:-translate-y-0.5"
            >
              {siteNavigationText(studio.label, locale)}<ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <div className="grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))] lg:gap-6 lg:py-14">
          <div className="max-w-sm sm:col-span-2 lg:col-span-1">
            <Link href="/" className="group inline-flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl border border-line bg-card shadow-sm transition-transform duration-200 ease-out-expo group-hover:-rotate-3 group-hover:scale-105">
                <ToonSpectrumMark className="size-7" />
              </span>
              <span>
                <h2 className="font-display text-lg font-bold text-fg transition-colors group-hover:text-accent">
                  {siteBrand}
                </h2>
                <span className="block font-display text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-fg-3">
                  Create · Share · Discover
                </span>
              </span>
            </Link>
            <p className="mt-5 text-sm leading-7 text-fg-2">{t("footer.description.primary")}</p>
            <p className="mt-3 text-xs leading-6 text-fg-3">{t("footer.description.secondary")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {SITE_UTILITY_NAVIGATION.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-card/65 px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg"
                  >
                    <Icon size={14} className="text-fg-3" aria-hidden="true" />
                    {siteNavigationText(item.label, locale)}
                  </Link>
                );
              })}
            </div>
          </div>

          {SITE_NAVIGATION_GROUPS.map((group, index) => (
            <nav key={group.id} aria-labelledby={`footer-nav-${group.id}`} className="min-w-0">
              <div className="mb-4 flex items-start gap-2.5">
                <span aria-hidden="true" className="pt-0.5 font-display text-[0.6rem] font-bold tracking-[0.13em] text-accent">
                  0{index + 1}
                </span>
                <div>
                  <h2 id={`footer-nav-${group.id}`} className="font-display text-sm font-bold text-fg">
                    {siteNavigationText(group.label, locale)}
                  </h2>
                  <p className="mt-1 hidden text-[0.68rem] leading-5 text-fg-3 xl:block">
                    {siteNavigationText(group.description, locale)}
                  </p>
                </div>
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={siteNavigationText(item.description, locale)}
                      className="group/link flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg-2 transition-colors hover:bg-raised/65 hover:text-accent"
                    >
                      <span aria-hidden="true" className="h-px w-0 rounded-full bg-accent transition-all duration-200 group-hover/link:w-2.5" />
                      <span className="truncate">{siteNavigationText(item.label, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="relative border-t border-line/60 bg-canvas/35">
        <div className="mx-auto max-w-[1320px] px-4 py-6 text-[0.7rem] text-fg-3 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {META_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="transition-colors hover:text-fg">
                  {navigationLabel(link.key)}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {POLICY_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className="transition-colors hover:text-fg">
                    {navigationLabel(link.key)}
                  </Link>
                ))}
              </div>
              <span className="hidden h-3 w-px bg-line sm:block" aria-hidden="true" />
              <span>{t("footer.copyrightLine").replace("{year}", String(year))}</span>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 border-t border-line/45 pt-4">
            <span
              aria-hidden="true"
              className="h-1.5 w-8 rounded-full"
              style={{ background: spectrumGradient(["로맨스", "판타지", "액션", "SF"], 90) }}
            />
            <span className="font-display text-[0.57rem] font-bold uppercase tracking-[0.15em] text-fg-3">{t("footer.logoTag")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
