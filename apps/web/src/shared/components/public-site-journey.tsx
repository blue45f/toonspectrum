import { ArrowUpRight, BookOpen, Compass, Images, Palette, Store } from "lucide-react";

import Link from "@/compat/router-link";
import { DISCOVER_PURPOSE_PREFIXES } from "./site-public-routes";

import "./public-site-shell.css";

const JOURNEY = [
  { href: "/discover", ko: "영감 찾기", en: "Discover", icon: Compass, paths: [...DISCOVER_PURPOSE_PREFIXES, "/research", "/now"] },
  { href: "/learn", ko: "기법 익히기", en: "Learn", icon: BookOpen, paths: ["/learn", "/help"] },
  { href: "/market", ko: "재료 고르기", en: "Resources", icon: Store, paths: ["/market"] },
  { href: "/make", ko: "장면 그리기", en: "Create", icon: Palette, paths: ["/make"] },
  { href: "/showcase", ko: "작품 나누기", en: "Share", icon: Images, paths: ["/showcase", "/community", "/reviews"] },
] as const;

/** A connected creation journey for public pages. Never mounted on /studio. */
export function PublicSiteJourney({ pathname, locale }: { pathname: string; locale: "ko" | "en" }) {
  return (
    <div className="public-site-journey">
      <div className="public-site-journey__inner">
        <span className="public-site-journey__label">THE DIGITAL ATELIER</span>
        <nav aria-label={locale === "ko" ? "창작 단계별 바로가기" : "Creative journey"} className="public-site-journey__routes">
          {JOURNEY.map(({ href, ko, en, icon: Icon, paths }, index) => (
            <Link key={href} href={href} data-active={paths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) || undefined}>
              <span aria-hidden="true" className="public-site-journey__step">{String(index + 1).padStart(2, "0")}</span>
              <Icon size={13} aria-hidden="true" />
              <span>{locale === "ko" ? ko : en}</span>
            </Link>
          ))}
        </nav>
        <Link href="/about" className="public-site-journey__about">
          {locale === "ko" ? "작업실 소개" : "About the atelier"}<ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
