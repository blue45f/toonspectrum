import {
  resolveUiLocale,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, Sparkles } from "lucide-react";
import { useId } from "react";

import { SiteAtelierChapter } from "./site-experience/SiteAtelierChapter";
import { artworkSourcesForPath } from "./site-experience/site-art-direction";
import { publicSiteNextSteps } from "./public-site-pathways";
import { isPublicCreativeRoute } from "./site-public-routes";

import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";

import "./public-site-vibrance.css";

/** A small, contextual onward journey, not another home hero or account promotion. */
export function PublicSiteNextSteps({ pathname }: { pathname: string }) {
  const language = useI18n((state) => state.lang);
  const headingId = useId();
  if (pathname === "/" || !isPublicCreativeRoute(pathname)) return null;
  const korean = language.toLowerCase().split(/[-_]/u)[0] === "ko";
  const destinations = publicSiteNextSteps(pathname);
  return (
    <section className="public-site-next" aria-labelledby={headingId} data-public-wayfinder="">
      <div className="public-site-next__heading">
        <div>
          <p className="public-site-next__eyebrow"><Sparkles size={15} aria-hidden="true" />{translateCurrentStaticSourceText("shared.components.public.site.next.steps", "en", "YOUR NEXT CHAPTER")}</p>
          <h2 id={headingId}>{korean ? translateCurrentStaticSourceText("shared.components.public.site.next.steps", "ko", "좋은 영감은, 다음 행동으로.") : translateCurrentStaticSourceText("shared.components.public.site.next.steps", "en", "A good idea deserves a next step.")}</h2>
          <p>{korean ? translateCurrentStaticSourceText("shared.components.public.site.next.steps", "ko", "발견한 것을 배우고, 나의 재료로 바꾸고, 하나의 이야기로 이어가세요.") : translateCurrentStaticSourceText("shared.components.public.site.next.steps", "en", "Learn from what you discover, make it your own and carry your story forward.")}</p>
        </div>
        <Link className="public-site-next__directory" href="/sitemap">{korean ? translateCurrentStaticSourceText("shared.components.public.site.next.steps", "ko", "전체 작업 지도") : translateCurrentStaticSourceText("shared.components.public.site.next.steps", "en", "Explore the directory")}<ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className="public-site-next__grid">
        {destinations.map((destination) => (
          <Link key={destination.href} href={destination.href} className="public-site-next__card" data-phase={destination.phase}>
            <div className="public-site-next__art" aria-hidden="true"><img src={destination.image} srcSet={artworkSourcesForPath(destination.image)} sizes="(max-width: 767px) 90vw, 380px" alt="" width={1536} height={1024} loading="lazy" decoding="async" /></div>
            <div className="public-site-next__copy">
              <span className="public-site-next__tag">{destination.tag}</span>
              <h3>{korean ? destination.ko : destination.en}</h3>
              <p>{korean ? destination.bodyKo : destination.bodyEn}</p>
              <span className="public-site-next__action">{korean ? translateCurrentStaticSourceText("shared.components.public.site.next.steps", "ko", "이어서 둘러보기") : translateCurrentStaticSourceText("shared.components.public.site.next.steps", "en", "Explore this next")}<ArrowRight size={17} aria-hidden="true" /></span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** New composition preserves the existing onward-card component contract. */
export function PublicSiteAtelierJourney({ pathname }: { pathname: string }) {
  const language = useI18n((state) => state.lang);
  if (pathname === "/" || !isPublicCreativeRoute(pathname)) return null;
  const locale = resolveUiLocale(language);
  return <>
    <div className="public-site-atelier"><SiteAtelierChapter pathname={pathname} locale={locale} /></div>
    <PublicSiteNextSteps pathname={pathname} />
  </>;
}
