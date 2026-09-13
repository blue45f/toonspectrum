import { ArrowUpRight, BookOpen, Compass, Images, Palette, Sparkles, Store } from "lucide-react";
import { useEffect, useRef } from "react";

import { useSiteExperience } from "./site-experience/site-experience-context";
import { DISCOVER_PURPOSE_PREFIXES } from "./site-public-routes";

import Link from "@/compat/router-link";

import "./public-site-shell.css";

const JOURNEY = [
  { href: "/discover", ko: "영감 찾기", en: "Discover", icon: Compass, paths: [...DISCOVER_PURPOSE_PREFIXES, "/research", "/now"] },
  { href: "/learn", ko: "기법 익히기", en: "Learn", icon: BookOpen, paths: ["/learn", "/help"] },
  { href: "/market", ko: "재료 고르기", en: "Resources", icon: Store, paths: ["/market"] },
  { href: "/make", ko: "장면 그리기", en: "Create", icon: Palette, paths: ["/make"] },
  { href: "/showcase", ko: "작품 나누기", en: "Share", icon: Images, paths: ["/showcase", "/create", "/community", "/reviews", "/pencafe"] },
] as const;

/** A connected creation journey for public pages. Never mounted on /studio. */
export function PublicSiteJourney({ pathname, locale }: { pathname: string; locale: "ko" | "en" }) {
  const routesRef = useRef<HTMLElement>(null);
  const settings = useSiteExperience();
  useEffect(() => {
    const routes = routesRef.current;
    const active = routes?.querySelector<HTMLElement>("[data-active]");
    if (!routes || !active) return;
    // Only move the navigation scroller, never the document or browser history position.
    const left = active.getBoundingClientRect().left - routes.getBoundingClientRect().left + routes.scrollLeft;
    if (left < routes.scrollLeft || left + active.offsetWidth > routes.scrollLeft + routes.clientWidth) {
      routes.scrollTo({ left: Math.max(0, left - (routes.clientWidth - active.offsetWidth) / 2), behavior: "instant" });
    }
  }, [pathname]);
  return (
    <div className="public-site-journey">
      <div className="public-site-journey__inner">
        <span className="public-site-journey__label">THE DIGITAL ATELIER</span>
        <nav ref={routesRef} aria-label={locale === "ko" ? "창작 단계별 바로가기" : "Creative journey"} className="public-site-journey__routes">
          {JOURNEY.map(({ href, ko, en, icon: Icon, paths }, index) => {
            const active = paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
            return (
              <Link key={href} href={href} data-active={active || undefined} aria-current={active ? (pathname === href ? "page" : "location") : undefined}>
                <span aria-hidden="true" className="public-site-journey__step">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={13} aria-hidden="true" /><span>{locale === "ko" ? ko : en}</span>
              </Link>
            );
          })}
        </nav>
        <div className="public-site-journey__utilities">
          <Link href="/about" className="public-site-journey__about">{locale === "ko" ? "작업실 소개" : "About the atelier"}<ArrowUpRight size={13} aria-hidden="true" /></Link>
          {settings ? <button type="button" className="site-experience-toggle site-experience-toggle--compact"
            aria-label={locale === "ko" ? "차분한 화면" : "Calm appearance"} aria-pressed={settings.mode === "calm"}
            title={locale === "ko" ? "차분한 화면 전환" : "Toggle calm appearance"}
            onClick={() => settings.setMode(settings.mode === "vivid" ? "calm" : "vivid")}><Sparkles size={16} aria-hidden="true" /></button> : null}
        </div>
      </div>
    </div>
  );
}
