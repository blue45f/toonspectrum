import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarDays, Gift } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { useT } from "@/shared/lib/i18n";

import {
  resolveMarketingEventStatus,
  type EventStatus,
  type MarketingEvent,
} from "./event-catalog";
import { getEventCountdown } from "./event-countdown";
import { useMarketingEventText } from "./marketing-event-copy";

const STATUS_KEY: Record<EventStatus, string> = {
  active: "page.events.card.status.active",
  upcoming: "page.events.card.status.upcoming",
  ended: "page.events.card.status.ended",
};

/** 이벤트별 대표 이미지 — 카탈로그에 이미지가 생기면 이 매핑을 대체한다. */
const EVENT_IMAGES: Record<string, string> = {
  "beta-open-2026": "/images/section-community.webp",
};
const EVENT_IMAGE_FALLBACK = "/images/section-explore.webp";

/**
 * 시네마틱 이벤트 카드 — 호버 시 이미지 줌 + 오버레이 그라디언트 심화 + 정보 슬라이드업.
 * 마감 임박 이벤트에는 글로우 D-day 배지를 표시한다 (임박 시 펄스).
 *
 * reduced-motion 환경에서는 모든 모션 변형을 비활성화하고 정적 카드로 렌더한다.
 */
export function EventCard({ event }: { event: MarketingEvent }) {
  const text = useMarketingEventText();
  const t = useT();
  const prefersReducedMotion = useReducedMotion();
  const animated = !prefersReducedMotion;

  const status = resolveMarketingEventStatus(event);
  const countdown = getEventCountdown(event.endsAt);
  const image = EVENT_IMAGES[event.id] ?? EVENT_IMAGE_FALLBACK;

  return (
    <motion.article
      initial={animated ? { opacity: 0, y: 24 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="overflow-hidden rounded-[2rem] border border-line-strong bg-panel shadow-xl shadow-black/5"
    >
      <motion.div
        initial="rest"
        animate="rest"
        whileHover={animated ? "hover" : undefined}
        className="group"
      >
        <Link
          href={`/events/${event.slug}`}
          className="block rounded-[2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
        >
          <div className="relative overflow-hidden">
            <motion.img
              src={image}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="aspect-[21/9] w-full object-cover"
              variants={{ rest: { scale: 1 }, hover: { scale: 1.06 } }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
            {/* 오버레이 그라디언트 — 호버 시 심화 */}
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
              variants={{ rest: { opacity: 0.8 }, hover: { opacity: 1 } }}
              transition={{ duration: 0.4 }}
            />
            {/* 배지 행 — 상태 칩 + 카운트다운 글로우 배지 */}
            <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2 sm:left-6 sm:top-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                <Gift size={13} aria-hidden="true" />
                {t(STATUS_KEY[status])}
              </span>
              {countdown ? (
                <motion.span
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black text-white",
                    countdown.urgent
                      ? "bg-orange-500 shadow-[0_0_20px_3px_rgba(249,115,22,0.55)]"
                      : "border border-white/25 bg-black/55 backdrop-blur-sm",
                  )}
                  animate={
                    countdown.urgent && animated ? { scale: [1, 1.1, 1] } : undefined
                  }
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                >
                  {countdown.isToday
                    ? t("page.events.countdown.today")
                    : t("page.events.countdown.days", { days: countdown.daysLeft })}
                  {countdown.urgent && (
                    <span className="sr-only">
                      {t("page.events.countdown.urgentLabel")}
                    </span>
                  )}
                </motion.span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm">
                  <CalendarDays size={13} aria-hidden="true" />
                  {event.endsAt
                    ? t("page.events.card.limited")
                    : t("page.events.card.noEndDate")}
                </span>
              )}
            </div>
            {/* 이미지 위 타이틀 */}
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <p className="text-xs font-black tracking-[0.12em] text-white/80">
                {text(event.eyebrow)}
              </p>
              <h3 className="mt-2 font-display text-2xl font-black tracking-[-0.02em] text-white sm:text-4xl">
                {text(event.title)}
              </h3>
            </div>
          </div>
          {/* 정보 영역 — 호버 시 슬라이드업 */}
          <motion.div
            className="p-6 sm:p-8"
            variants={{ rest: { y: 0 }, hover: { y: -6 } }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <p className="text-sm leading-7 text-fg-2 sm:text-base">
              {text(event.summary)}
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-black text-accent">
              {t("page.events.card.view")}
              <motion.span
                aria-hidden="true"
                className="inline-flex"
                variants={{ rest: { x: 0 }, hover: { x: 5 } }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <ArrowRight size={16} />
              </motion.span>
            </p>
          </motion.div>
        </Link>
      </motion.div>
    </motion.article>
  );
}

export default EventCard;
