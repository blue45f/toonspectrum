import { ArrowRight, CalendarDays, Gift, Megaphone, ShieldCheck } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { FanCafePanel } from "@/domains/community/components/fan-cafe-panel";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { useI18n, useT } from "@/shared/lib/i18n";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

import { EVENT_STATUS_I18N_KEY, MARKETING_EVENTS, resolveMarketingEventStatus } from "./event-catalog";
import { EventCard } from "./EventCard";
import { useMarketingEventText } from "./marketing-event-copy";

import "../marketing-page.css";
import "./events-hub.css";

const GUIDE_CARDS = [
  { icon: Megaphone, titleKey: "page.events.guide.1.title", bodyKey: "page.events.guide.1.body" },
  { icon: CalendarDays, titleKey: "page.events.guide.2.title", bodyKey: "page.events.guide.2.body" },
  { icon: ShieldCheck, titleKey: "page.events.guide.3.title", bodyKey: "page.events.guide.3.body" },
] as const;

/** 대표 이벤트 이미지. 카탈로그에 이미지 필드가 생기면 EventCard의 매핑과 함께 옮긴다. */
const FEATURED_IMAGE = "/images/section-community.webp";

/**
 * /events — 소개·영상 페이지(.mk-page)와 같은 히어로 문법(눈썹 → 제목 → 리드 → 행동)을 쓴다.
 * 공식 이벤트 카드와 커뮤니티 게시판은 기존 구성요소를 그대로 재사용한다.
 */
export function EventsHubPage() {
  const text = useMarketingEventText();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const title = t("page.events.hero.title");
  const description = t("page.events.hero.lede");

  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/events", title, description });

  const featured = MARKETING_EVENTS[0];
  const featuredHref = featured ? `/events/${encodeURIComponent(featured.slug)}` : "/community/events";

  return (
    <div className="mk-page events-hub" lang={language}>
      <header className="mk-shell events-hub__hero">
        <div className="events-hub__hero-copy">
          <p className="mk-eyebrow"><CalendarDays size={15} aria-hidden="true" />{t("page.events.hero.eyebrow")}</p>
          <h1 className="mk-title">{title}</h1>
          <p className="mk-lead">{description}</p>
          <div className="mk-actions">
            <Link className="mk-button mk-button--primary" href={featuredHref}>
              {t("page.events.hero.primary")}<ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="mk-button" href="/community/events">{t("page.events.hero.secondary")}</Link>
          </div>
        </div>
        {featured ? (
          <Link className="events-hub__featured" href={featuredHref}>
            <img src={FEATURED_IMAGE} alt="" width={1280} height={720} decoding="async" fetchPriority="high" />
            <span className="events-hub__featured-copy">
              <span className="mk-badge"><Gift size={13} aria-hidden="true" />{t(EVENT_STATUS_I18N_KEY[resolveMarketingEventStatus(featured)])}</span>
              <small>{text(featured.eyebrow)}</small>
              <strong>{text(featured.title)}</strong>
              <span className="events-hub__featured-cta">{t("page.events.card.view")}<ArrowRight size={15} aria-hidden="true" /></span>
            </span>
          </Link>
        ) : null}
      </header>

      <CampusObjectSource objects={MARKETING_EVENTS.map((event) => ({
        id: event.id,
        title: text(event.title),
        href: `/events/${encodeURIComponent(event.slug)}`,
        kind: "event",
        exposure: "public",
      }))} />

      <section id="guide" className="mk-shell events-hub__section" aria-labelledby="events-guide-title">
        <div className="mk-section-head">
          <div>
            <p className="mk-eyebrow">EVENT GUIDE</p>
            <h2 id="events-guide-title" className="mk-h2">{t("page.events.guide.title")}</h2>
          </div>
        </div>
        <ol className="events-hub__guide mk-rail">
          {GUIDE_CARDS.map(({ icon: Icon, titleKey, bodyKey }, index) => (
            <li key={titleKey} className="events-hub__guide-card mk-card">
              <span className="events-hub__guide-step" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <Icon size={20} aria-hidden="true" />
              <h3>{t(titleKey)}</h3>
              <p>{t(bodyKey)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="board" className="mk-shell events-hub__section" aria-labelledby="events-board-title">
        <div className="mk-section-head">
          <div>
            <p className="mk-eyebrow">EVENTS</p>
            <h2 id="events-board-title" className="mk-h2">{t("page.events.board.title")}</h2>
          </div>
        </div>
        <h3 className="events-hub__subhead">{t("page.events.board.official")}</h3>
        <div className="events-hub__cards">
          {MARKETING_EVENTS.map((event) => <EventCard key={event.id} event={event} />)}
        </div>

        <h3 className="events-hub__subhead events-hub__subhead--spaced">{t("page.events.board.community")}</h3>
        <FanCafePanel
          scope="pencafe"
          targetId="events-hub"
          targetLabel={title}
          initialKind="event"
          compact
          emptyGuide={{
            icon: CalendarDays,
            title: t("page.events.empty.title"),
            description: t("page.events.empty.body"),
            primary: { href: "#fan-cafe-composer", label: t("page.events.empty.primary") },
            secondary: { href: "/community/events", label: t("page.events.empty.secondary") },
          }}
        />
      </section>
    </div>
  );
}

export default EventsHubPage;
