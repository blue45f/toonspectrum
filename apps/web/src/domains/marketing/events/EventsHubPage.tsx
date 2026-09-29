import { CalendarDays, Megaphone, ShieldCheck } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { PageShell, SectionContainer, HeroBlock } from "@/shared/components/layout";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { FanCafePanel } from "@/domains/community/components/fan-cafe-panel";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { useT } from "@/shared/lib/i18n";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

import { MARKETING_EVENTS } from "./event-catalog";
import { EventCard } from "./EventCard";
import { useMarketingEventText } from "./marketing-event-copy";

const GUIDE_CARDS = [
  {
    icon: Megaphone,
    titleKey: "page.events.guide.1.title",
    bodyKey: "page.events.guide.1.body",
  },
  {
    icon: CalendarDays,
    titleKey: "page.events.guide.2.title",
    bodyKey: "page.events.guide.2.body",
  },
  {
    icon: ShieldCheck,
    titleKey: "page.events.guide.3.title",
    bodyKey: "page.events.guide.3.body",
  },
] as const;

export function EventsHubPage() {
  const text = useMarketingEventText();
  const t = useT();
  const title = t("page.events.hero.title");
  const description = t("page.events.hero.lede");

  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/events", title, description });

  const firstEvent = MARKETING_EVENTS[0];

  return (
    <PageShell
      hero={
        <HeroBlock
          eyebrow={t("page.events.hero.eyebrow")}
          title={title}
          lede={description}
          actions={
            <>
              {firstEvent ? (
                <Link
                  href={`/events/${firstEvent.slug}`}
                  className={buttonClass({ className: "min-h-12" })}
                >
                  {t("page.events.hero.primary")}
                </Link>
              ) : null}
              <Link
                href="/community/events"
                className={buttonClass({ variant: "quiet", className: "min-h-12" })}
              >
                {t("page.events.hero.secondary")}
              </Link>
            </>
          }
        />
      }
    >
      <CampusObjectSource objects={MARKETING_EVENTS.map((event) => ({
        id: event.id,
        title: text(event.title),
        href: `/events/${encodeURIComponent(event.slug)}`,
        kind: "event",
        exposure: "public",
      }))} />

      <SectionContainer id="guide" title={t("page.events.guide.title")} spacing="compact">
        <div className="grid gap-4 md:grid-cols-3">
          {GUIDE_CARDS.map(({ icon: Icon, titleKey, bodyKey }) => (
            <article key={titleKey} className="rounded-2xl border border-line bg-panel p-5">
              <Icon size={20} className="text-accent" aria-hidden="true" />
              <h3 className="mt-3 font-black text-fg">{t(titleKey)}</h3>
              <p className="mt-2 text-sm leading-6 text-fg-2">{t(bodyKey)}</p>
            </article>
          ))}
        </div>
      </SectionContainer>

      <SectionContainer id="board" title={t("page.events.board.title")}>
        <h3 className="text-lg font-black tracking-tight text-fg">
          {t("page.events.board.official")}
        </h3>
        <div className="mt-5 grid gap-5">
          {MARKETING_EVENTS.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>

        <h3 className="mt-12 text-lg font-black tracking-tight text-fg">
          {t("page.events.board.community")}
        </h3>
        <div className="mt-5">
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
        </div>
      </SectionContainer>
    </PageShell>
  );
}

export default EventsHubPage;
