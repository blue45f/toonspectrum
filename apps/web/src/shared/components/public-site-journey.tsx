import { ArrowUpRight, BookOpen, Compass, Images, Palette, Store } from "lucide-react";
import { useEffect, useRef } from "react";

import { PUBLIC_JOURNEY, publicJourneyPhase } from "./public-site-pathways";

import Link from "@/compat/router-link";

import "./public-site-shell.css";
import "./public-site-vibrance.css";

const ICONS = { discover: Compass, learn: BookOpen, resources: Store, create: Palette, share: Images };

/** The active step stays visible in the mobile rail without scrolling the page. */
export function PublicSiteJourney({ pathname, locale }: { pathname: string; locale: "ko" | "en" }) {
  const navigationRef = useRef<HTMLElement>(null);
  const phase = publicJourneyPhase(pathname);

  useEffect(() => {
    const rail = navigationRef.current;
    const active = rail?.querySelector<HTMLElement>('a[aria-current="step"]');
    if (!rail || !active) return;
    const bounds = rail.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < bounds.left) rail.scrollLeft -= bounds.left - item.left + 8;
    else if (item.right > bounds.right) rail.scrollLeft += item.right - bounds.right + 8;
  }, [phase]);

  return (
    <div className="public-site-journey">
      <div className="public-site-journey__inner">
        <span className="public-site-journey__label">THE DIGITAL ATELIER</span>
        <nav ref={navigationRef} aria-label={locale === "ko" ? "창작 단계별 바로가기" : "Creative journey"} className="public-site-journey__routes">
          {PUBLIC_JOURNEY.map(({ id, href, ko, en }, index) => {
            const Icon = ICONS[id];
            const active = phase === id;
            return (
              <Link key={id} href={href} data-phase={id} data-active={active || undefined} aria-current={active ? "step" : undefined}>
                <span aria-hidden="true" className="public-site-journey__step">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={14} aria-hidden="true" />
                <span>{locale === "ko" ? ko : en}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/about" className="public-site-journey__about">
          {locale === "ko" ? "작업실 소개" : "About the atelier"}<ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
