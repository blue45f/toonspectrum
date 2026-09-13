import { ArrowRight, ArrowUpRight, BookOpen, Compass, Images, Store } from "lucide-react";
import { useId } from "react";
import { useLocation } from "react-router-dom";

import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { nextPublicDestinations } from "./public-site-destinations";

import "./public-site-experience.css";

const ICONS = { discover: Compass, learn: BookOpen, market: Store, make: ArrowRight, share: Images };

export function PublicSiteWayfinder() {
  const { pathname } = useLocation();
  const language = useI18n((state) => state.lang);
  const korean = language.toLowerCase().split(/[-_]/u)[0] === "ko";
  const headingId = useId();
  const destinations = nextPublicDestinations(pathname);
  if (destinations.length === 0) return null;
  return (
    <section className="public-wayfinder" aria-labelledby={headingId} data-public-wayfinder="">
      <div className="public-wayfinder__heading">
        <div>
          <p className="public-wayfinder__eyebrow">YOUR NEXT CHAPTER</p>
          <h2 id={headingId}>{korean ? "발견에서, 다음 장면으로." : "Make room for your next chapter."}</h2>
        </div>
        <Link href="/sitemap" className="public-wayfinder__all">{korean ? "전체 공간 둘러보기" : "Explore every space"}<ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="public-wayfinder__grid">
        {destinations.map((item) => {
          const Icon = ICONS[item.id];
          return (
            <Link key={item.id} href={item.href} className="public-wayfinder__card" data-destination={item.id}>
              <span className="public-wayfinder__icon"><Icon size={23} aria-hidden="true" /></span>
              <strong>{korean ? item.ko : item.en}</strong>
              <span>{korean ? item.koDescription : item.enDescription}</span>
              <ArrowUpRight className="public-wayfinder__arrow" size={19} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
