import { ArrowRight } from "lucide-react";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_NAVIGATION_ITEMS,
  SITE_UTILITY_NAVIGATION,
  siteNavigationLocale,
  siteNavigationText,
  type SiteNavigationText,
} from "./site-navigation";
import { ToonStudioBrand } from "./toonstudio-brand";

import { useI18n, useT } from "@/shared/lib/i18n";
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import "./site-footer.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("site-footer", ko, en);

const META_LINKS = [
  { key: "footer.link.about", href: "/about" },
  { key: "footer.link.guide", href: "/guide" },
  { key: "footer.link.sitemap", href: "/sitemap" },
  { key: "footer.link.support", href: "/help" },
] as const;

const POLICY_LINKS = [
  { key: "footer.link.terms", href: "/terms" },
  { key: "footer.link.privacy", href: "/privacy" },
  { key: "footer.link.copyright", href: "/copyright" },
] as const;

/** "별빛 관측소" 세계관은 /fortune 페이지 내부에 두고, 내비 라벨은 사이트 톤에 맞춘다. */
const FORTUNE_NAV_LABEL: SiteNavigationText = { ko: "운세", en: "Fortune" };
const FORTUNE_NAV_DESCRIPTION: SiteNavigationText = {
  ko: "오늘의 운세와 타로를 가볍게 확인",
  en: "Check today's fortune and tarot, lightly",
};

export function SiteFooter() {
  useBilingualI18nRevision();
  const language = useI18n((state) => state.lang);
  const locale = siteNavigationLocale(language);
  const t = useT();
  const year = new Date().getFullYear();
  const make = SITE_NAVIGATION_ITEMS.make;
  const research = SITE_NAVIGATION_ITEMS.research;

  return (
    <footer data-site-chrome="footer" className="site-footer pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0">
      <div className="site-footer__inner">
        <div className="site-footer__story-band">
          <Link href="/" className="site-footer__brand" aria-label={bi("ToonStudio 홈", "ToonStudio home")}>
            <ToonStudioBrand wordmarkClassName="site-footer__wordmark" />
          </Link>
          <p className="site-footer__story">
            <span>{bi("그리는 순간, 이야기가 살아납니다.", "The moment you draw, your story comes alive.")}</span>
            <em lang="en">Stories Come to Life</em>
          </p>
          <Link href={make.href} className="site-footer__create">
            {siteNavigationText(make.label, locale)}<ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="site-footer__navigation">
          <div className="site-footer__introduction">
            <p>{bi("상상에서 첫 장면으로, 첫 장면에서 완성한 작품으로.", "From an idea to your first scene, and from a scene to a finished story.")}</p>
            <p className="site-footer__description">{t("footer.description.secondary")}</p>
            <Link href={research.href} className="site-footer__research">
              {siteNavigationText(research.label, locale)}<ArrowRight size={15} aria-hidden="true" />
            </Link>
            <nav className="site-footer__utilities" aria-label={bi("계정과 환경 설정", "Account and preferences")}>
              {SITE_UTILITY_NAVIGATION.map((item) => {
                const Icon = item.icon;
                return <Link key={item.id} href={item.href}>
                  <Icon size={15} aria-hidden="true" />{siteNavigationText(item.label, locale)}
                </Link>;
              })}
            </nav>
          </div>

          {SITE_NAVIGATION_GROUPS.map((group) => (
            <nav key={group.id} aria-labelledby={`footer-nav-${group.id}`} className="site-footer__group">
              <h2 id={`footer-nav-${group.id}`}>{siteNavigationText(group.label, locale)}</h2>
              <ul>
                {group.items.filter((item) => item.id !== "technology").map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      title={siteNavigationText(
                        item.id === "fortune" ? FORTUNE_NAV_DESCRIPTION : item.description,
                        locale
                      )}
                    >
                      {siteNavigationText(
                        item.id === "fortune" ? FORTUNE_NAV_LABEL : item.label,
                        locale
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="site-footer__meta">
          <nav aria-label={bi("도움과 서비스 안내", "Help and service information")}>
            <Link href="/about/principles">{bi("제품 원칙", "Product principles")}</Link>
            {META_LINKS.map((link) => <Link key={link.href} href={link.href}>{t(link.key)}</Link>)}
            {/* /pricing 페이지는 routes 팀이 제공. 푸터에서 요금제 진입점을 유지한다. */}
            <Link href="/pricing">{bi("요금제", "Pricing")}</Link>
          </nav>
          <nav aria-label={bi("이용 정책", "Policies")}>
            {POLICY_LINKS.map((link) => <Link key={link.href} href={link.href}>{t(link.key)}</Link>)}
          </nav>
          <small>{t("footer.copyrightLine").replace("{year}", String(year))}</small>
        </div>
      </div>
    </footer>
  );
}
