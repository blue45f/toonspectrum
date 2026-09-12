import { ArrowUpRight, BookOpen, Compass, Images, Palette, Store } from "lucide-react";
import { useEffect, useRef } from "react";

import Link from "@/compat/router-link";
import { activePublicJourney, PUBLIC_JOURNEY } from "./public-site-destinations";

import "./public-site-shell.css";

const ICONS = { discover: Compass, learn: BookOpen, market: Store, make: Palette, share: Images };

/** A connected creation journey for public pages. Never mounted on /studio. */
export function PublicSiteJourney({ pathname, locale }: { pathname: string; locale: "ko" | "en" }) {
  const railRef = useRef<HTMLElement>(null);
  const active = activePublicJourney(pathname);
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
  }, [active, locale]);
  return (
    <div className="public-site-journey">
      <div className="public-site-journey__inner">
        <span className="public-site-journey__label">THE DIGITAL ATELIER</span>
        <nav ref={railRef} aria-label={locale === "ko" ? "창작 단계별 바로가기" : "Creative journey"} className="public-site-journey__routes">
          {PUBLIC_JOURNEY.map(({ id, href, ko, en }, index) => {
            const Icon = ICONS[id];
            return (
              <Link key={href} href={href} aria-current={active === id ? "step" : undefined} data-active={active === id || undefined}>
                <span aria-hidden="true" className="public-site-journey__step">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={13} aria-hidden="true" />
                <span>{locale === "ko" ? ko : en}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/about" className="public-site-journey__about">
          {locale === "ko" ? "작업실 소개" : "About the atelier"}<ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
