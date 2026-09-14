import { ArrowUpRight, BookOpen, CalendarDays, Compass, Images, Library, MessageCircle, PenTool, Search, Sparkles, Store } from "lucide-react";
import { useId } from "react";
import { useLocation } from "react-router-dom";

import { SiteAtelierChapter } from "./SiteAtelierChapter";
import { DESTINATION_ART } from "./site-atelier-content";
import { useSiteExperience } from "./site-experience-context";
import { EXPERIENCE_DESTINATIONS, nextExperienceDestinations } from "./site-experience-model";
import Link from "@/compat/router-link";
import { useI18n } from "@/shared/lib/i18n";

const ICONS = { discover: Compass, research: Search, learn: BookOpen, market: Store, showcase: Images, community: MessageCircle, calendar: CalendarDays, library: Library };

/** Illustrated, contextual exits keep discoveries connected to actual drawing. */
export function SiteNextSteps() {
  const { pathname } = useLocation();
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const headingId = useId();
  const settings = useSiteExperience();
  const destinations = nextExperienceDestinations(pathname);
  if (!settings || !destinations.length) return null;
  return (
    <section className="site-next-steps" aria-labelledby={headingId} data-testid="site-next-steps">
      <SiteAtelierChapter pathname={pathname} locale={locale} />
      <div className="site-next-steps__heading">
        <div>
          <p className="site-next-steps__eyebrow"><Sparkles size={14} aria-hidden="true" /> YOUR NEXT CHAPTER</p>
          <h2 id={headingId}>{locale === "ko" ? "영감을, 다음 장면으로." : "Turn inspiration into your next scene."}</h2>
          <p>{locale === "ko" ? "지금의 발견을 학습과 재료, 새로운 작품으로 이어가세요." : "Connect your discoveries with techniques, materials and new stories."}</p>
        </div>
        <button type="button" className="site-experience-toggle" aria-pressed={settings.mode === "calm"}
          onClick={() => settings.setMode(settings.mode === "vivid" ? "calm" : "vivid")}
          title={locale === "ko" ? "배경과 장식 효과를 줄입니다. 시스템의 모션 감소 설정도 존중합니다." : "Reduce decorative effects. System reduced-motion settings are always respected."}>
          <Sparkles size={15} aria-hidden="true" />{locale === "ko" ? "차분한 화면" : "Calm appearance"}
        </button>
      </div>
      <nav className="site-next-steps__grid" aria-label={locale === "ko" ? "다음 활동 추천" : "Suggested next destinations"}>
        {destinations.map((id, index) => {
          const destination = EXPERIENCE_DESTINATIONS[id];
          const Icon = ICONS[destination.icon];
          const [title, description] = destination[locale];
          return (
            <Link href={destination.href} className="site-next-steps__card" key={id} data-tone={index}>
              <span className="site-next-steps__art" aria-hidden="true"><img src={`/brand/atelier-${DESTINATION_ART[id]}.webp`} alt="" width={1536} height={1024} loading="lazy" decoding="async" /><span>0{index + 1} / {id.toUpperCase()}</span></span>
              <span className="site-next-steps__icon"><Icon size={21} aria-hidden="true" /></span>
              <span className="site-next-steps__copy"><strong>{title}</strong><span>{description}</span></span>
              <ArrowUpRight className="site-next-steps__arrow" size={19} aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
      <div className="site-next-steps__drawing">
        <div><span>MADE FOR PEOPLE WHO DRAW.</span><p>{locale === "ko" ? "영감을 모았다면, 이제 당신의 선으로 그려 보세요." : "You have the inspiration. Make your own mark."}</p></div>
        <Link href="/studio"><PenTool size={17} aria-hidden="true" />{locale === "ko" ? "전문 드로잉 작업실 열기" : "Open the drawing studio"}<ArrowUpRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
