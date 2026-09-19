import { ArrowRight, CalendarDays, Gift, Sparkles } from "lucide-react";

import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";

import {
  MARKETING_EVENTS,
  resolveMarketingEventStatus,
  type EventStatus,
} from "./event-catalog";
import { useMarketingEventText } from "./marketing-event-copy";

const STATUS_COPY: Record<EventStatus, { ko: string; en: string }> = {
  active: { ko: "진행 중", en: "Live" },
  upcoming: { ko: "예정", en: "Upcoming" },
  ended: { ko: "종료", en: "Ended" },
};

export function EventsHubPage() {
  const text = useMarketingEventText();
  const title = text({ ko: "이벤트", en: "Events" });
  const description = text({
    ko: "툰스펙트럼의 베타 오픈, 창작자 혜택과 앞으로 진행될 이벤트를 확인하세요.",
    en: "Explore ToonSpectrum beta opening benefits, creator rewards, and future events.",
  });

  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/events", title, description });

  return (
    <div className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] bg-canvas px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-black tracking-[0.14em] text-accent">
            <Sparkles size={14} aria-hidden /> EVENTS
          </p>
          <h1 className="mt-5 font-display text-4xl font-black tracking-[-0.04em] text-fg sm:text-6xl">
            {text({ ko: "창작을 시작하기 좋은 순간.", en: "A better moment to start creating." })}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-fg-2 sm:text-lg">{description}</p>
        </header>

        <section aria-label={title} className="mt-10 grid gap-5">
          {MARKETING_EVENTS.map((event) => {
            const status = resolveMarketingEventStatus(event);
            return (
              <article key={event.id} className="group relative overflow-hidden rounded-[2rem] border border-line-strong bg-panel p-6 shadow-xl shadow-black/5 sm:p-9">
                <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,oklch(0.75_0.16_70/0.12),transparent_30%),radial-gradient(circle_at_10%_90%,oklch(0.7_0.18_315/0.10),transparent_35%)]" />
                <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-bold text-fg-2">
                        <Gift size={13} aria-hidden /> {text(STATUS_COPY[status])}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-3">
                        <CalendarDays size={13} aria-hidden />
                        {event.endsAt ? text({ ko: "기간 한정", en: "Limited time" }) : text({ ko: "종료일 추후 안내", en: "End date to be announced" })}
                      </span>
                    </div>
                    <p className="mt-5 text-sm font-black tracking-[0.12em] text-accent">{text(event.eyebrow)}</p>
                    <h2 className="mt-2 max-w-4xl font-display text-3xl font-black tracking-[-0.035em] text-fg sm:text-5xl">{text(event.title)}</h2>
                    <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">{text(event.summary)}</p>
                  </div>
                  <Link href={`/events/${event.slug}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-fg px-5 text-sm font-black text-canvas transition-transform hover:-translate-y-0.5">
                    {text({ ko: "이벤트 보기", en: "View event" })}<ArrowRight size={16} aria-hidden />
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}

export default EventsHubPage;
