import {
  
  translateCurrentStaticSourceText,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowUpRight, BookOpen, Boxes, Compass, FolderKanban, Images, PackageCheck, Palette, Sparkles, Store, Workflow } from "lucide-react";
import { useEffect, useRef } from "react";

import { activePublicJourney, PUBLIC_JOURNEY } from "./public-site-destinations";
import { useSiteExperience } from "./site-experience/site-experience-context";

import Link from "@/compat/router-link";

import "./public-site-shell.css";
import "./public-site-vibrance.css";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("public-site-journey", ko, en);

const ICONS = { discover: Compass, learn: BookOpen, market: Store, make: Palette, share: Images };
const PRODUCTION_ICONS = { production: Workflow, projects: FolderKanban, make: Palette, assets: Boxes, publish: PackageCheck };
const PRODUCTION_JOURNEY = [
  { id: "production", href: "/production", ko: "제작 관리", en: "Production" },
  { id: "projects", href: "/studio/projects", ko: "내 프로젝트", en: "Projects" },
  { id: "make", href: "/studio/new", ko: "새 작품", en: "New work" },
  { id: "assets", href: "/studio/assets", ko: "작품 재료", en: "Assets" },
  { id: "publish", href: "/studio/publish", ko: "검수·내보내기", en: "Review & export" },
] as const;

/** The active step stays visible in the mobile rail without scrolling the page. */
export function PublicSiteJourney({ pathname, locale: _locale }: { pathname: string; locale: "ko" | "en" }) {
  useBilingualI18nRevision();
  const railRef = useRef<HTMLElement>(null);
  const isProductionHome = pathname === "/";
  const active = isProductionHome ? undefined : activePublicJourney(pathname);
  const journey = isProductionHome ? PRODUCTION_JOURNEY : PUBLIC_JOURNEY;
  const settings = useSiteExperience();
  useEffect(() => {
    const rail = railRef.current;
    const item = rail?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!rail || !item) return;
    const container = rail.getBoundingClientRect();
    const bounds = item.getBoundingClientRect();
    // Scroll ONLY the rail, never the page or its focused content.
    if (bounds.left < container.left || bounds.right > container.right) {
      rail.scrollLeft += bounds.left - container.left - (container.width - bounds.width) / 2;
    }
  }, [active]);
  return (
    <div className="public-site-journey">
      <div className="public-site-journey__inner">
        <span className="public-site-journey__label">{isProductionHome ? "WEBTOON PRODUCTION WORKSPACE" : "THE DIGITAL ATELIER"}</span>
        <nav ref={railRef} aria-label={bi(isProductionHome ? "제작 기능 바로가기" : "창작 단계별 바로가기", isProductionHome ? "Production shortcuts" : "Creative journey")} className="public-site-journey__routes">
          {journey.map(({ id, href, ko, en }, index) => {
            const Icon = isProductionHome
              ? PRODUCTION_ICONS[id as keyof typeof PRODUCTION_ICONS]
              : ICONS[id as keyof typeof ICONS];
            return (
              <Link key={href} href={href} data-phase={id === "market" || id === "assets" ? translateCurrentStaticSourceText("shared.components.public.site.journey", "en", "resources") : id === "make" ? translateCurrentStaticSourceText("shared.components.public.site.journey", "en", "create") : id} aria-current={active === id ? translateCurrentStaticSourceText("shared.components.public.site.journey", "en", "step") : undefined} data-active={active === id || undefined}>
                <span aria-hidden="true" className="public-site-journey__step">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={13} aria-hidden="true" />
                <span>{bi(ko, en)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="public-site-journey__utilities">
          <Link href="/about" className="public-site-journey__about">{bi(isProductionHome ? "제품 소개" : "작업실 소개", isProductionHome ? "About ToonStudio" : "About the atelier")}<ArrowUpRight size={13} aria-hidden="true" /></Link>
          {settings ? <button type="button" className="site-experience-toggle site-experience-toggle--compact"
            aria-label={bi("차분한 화면", "Calm appearance")} aria-pressed={settings.mode === "calm"}
            title={bi("차분한 화면 전환", "Toggle calm appearance")}
            onClick={() => settings.setMode(settings.mode === "vivid" ? "calm" : "vivid")}><Sparkles size={16} aria-hidden="true" /></button> : null}
        </div>
      </div>
    </div>
  );
}
