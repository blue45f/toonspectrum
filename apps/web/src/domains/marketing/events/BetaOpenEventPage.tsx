import { SITE_URL } from "@toonspectrum/core/business";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Brush,
  CalendarClock,
  Gift,
  Infinity as InfinityIcon,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { requestAuthModalOpen } from "@/compat/auth-modal-intent";
import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";

import { BETA_OPEN_EVENT } from "./event-catalog";
import { useMarketingEventText } from "./marketing-event-copy";

const BENEFIT_ICONS = [InfinityIcon, UserPlus, Brush] as const;

export function BetaOpenEventPage() {
  const text = useMarketingEventText();
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const signupMonths = BETA_OPEN_EVENT.signupFreeMonths;
  const creatorMonths = BETA_OPEN_EVENT.publicCreatorFreeMonths;
  const publicContentCount = BETA_OPEN_EVENT.minimumPublicContentCount;
  const publicDays = BETA_OPEN_EVENT.minimumPublicDays;
  const pageTitle = text({ ko: "베타 오픈 · 최대 1년 무료", en: "Beta Open · Up to 1 year free" });
  const description = text(BETA_OPEN_EVENT.summary);

  useDocumentTitle(pageTitle);
  useMetaDescription(description);
  usePageSocialMeta({
    canonicalPath: "/events/beta-open",
    title: pageTitle,
    description,
  });
  useJsonLd({
    "@context": "https://schema.org",
    "@type": "Event",
    name: text(BETA_OPEN_EVENT.title),
    description,
    startDate: BETA_OPEN_EVENT.startsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: {
      "@type": "VirtualLocation",
      url: `${SITE_URL}/events/beta-open`,
    },
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "KRW",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/events/beta-open`,
    },
  });

  const openSignup = () => {
    requestAuthModalOpen({
      reason: "beta-event",
      source: "beta-event-page",
      mode: "signup",
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[oklch(0.145_0.025_270)] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,oklch(0.8_0.16_75/0.20),transparent_28%),radial-gradient(circle_at_86%_18%,oklch(0.72_0.19_318/0.18),transparent_31%),radial-gradient(circle_at_50%_100%,oklch(0.68_0.15_235/0.14),transparent_36%)]" />
      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 sm:pb-28">
        <nav className="flex items-center justify-between gap-3" aria-label={text({ ko: "이벤트 탐색", en: "Event navigation" })}>
          <Link href="/events" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-white/75 hover:bg-white/8 hover:text-white">
            <ArrowLeft size={16} aria-hidden />{text({ ko: "전체 이벤트", en: "All events" })}
          </Link>
          <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[0.68rem] font-black tracking-[0.15em] text-white/80">BETA OPEN 2026</span>
        </nav>

        <section className="grid min-h-[72vh] items-center gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-1.5 text-xs font-black tracking-[0.13em] text-amber-100">
              <Sparkles size={14} aria-hidden /> {text(BETA_OPEN_EVENT.eyebrow)}
            </p>
            <h1 className="mt-6 max-w-5xl font-display text-[clamp(3rem,7vw,6.8rem)] font-black leading-[0.92] tracking-[-0.065em] text-white">
              {text(BETA_OPEN_EVENT.title)}
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-white/68 sm:text-xl">{description}</p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {authenticated ? (
                <Link href="/studio/new" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-black shadow-2xl shadow-black/30 transition-transform hover:-translate-y-0.5">
                  {text(BETA_OPEN_EVENT.secondaryCta)}<ArrowRight size={17} aria-hidden />
                </Link>
              ) : (
                <button type="button" onClick={openSignup} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-black shadow-2xl shadow-black/30 transition-transform hover:-translate-y-0.5">
                  {text(BETA_OPEN_EVENT.primaryCta)}<ArrowRight size={17} aria-hidden />
                </button>
              )}
              <a href="#benefits" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/18 bg-white/7 px-6 text-sm font-bold text-white hover:bg-white/12">
                {text({ ko: "혜택 자세히 보기", en: "Explore benefits" })}
              </a>
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-white/48">
              <CalendarClock size={14} aria-hidden />
              {text({ ko: "베타 종료일은 추후 안내합니다. 확정된 무료 이용 기간은 그대로 보장합니다.", en: "The beta end date will be announced later. Confirmed free periods remain honored." })}
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div aria-hidden className="absolute -inset-6 rounded-[3rem] bg-white/5 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/15 bg-white/8 p-6 shadow-2xl shadow-black/35 backdrop-blur-2xl sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.14em] text-white/45">{text({ ko: "베타 가입자 혜택", en: "BETA MEMBER BENEFIT" })}</p>
                  <p className="mt-2 font-display text-5xl font-black tracking-[-0.05em]">{creatorMonths}</p>
                  <p className="mt-1 text-sm font-bold text-white/65">{text({ ko: "개월 · 최대 무료 이용", en: "months · maximum free access" })}</p>
                </div>
                <span className="grid size-16 place-items-center rounded-3xl border border-white/12 bg-white/8"><Gift size={30} aria-hidden /></span>
              </div>
              <div className="mt-8 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/12 p-4">
                  <p className="text-xs font-bold text-white/48">{text({ ko: "회원가입", en: "Create an account" })}</p>
                  <p className="mt-1 text-xl font-black">
                    {text({
                      ko: `${signupMonths}개월 전 서비스 무료`,
                      en: `${signupMonths} months of every service free`,
                    })}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200/20 bg-amber-100/10 p-4">
                  <p className="text-xs font-bold text-amber-100/65">
                    {text({
                      ko: `+ 공개 작품 ${publicContentCount}개 · ${publicDays}일 유지`,
                      en: `+ ${publicContentCount} public work · keep it public ${publicDays} days`,
                    })}
                  </p>
                  <p className="mt-1 text-xl font-black text-amber-50">{text({ ko: "최대 1년으로 확대", en: "Extended to up to 1 year" })}</p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-white/40">{text({ ko: "6개월 + 1년을 합산하지 않습니다. 조건 충족 시 가입일 기준 최대 1년으로 확대됩니다.", en: "Benefits do not stack. Meeting the creator condition extends access to a maximum of one year from signup." })}</p>
            </div>
          </div>
        </section>

        <section id="benefits" aria-labelledby="benefits-title" className="scroll-mt-28 border-t border-white/10 py-16 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-black tracking-[0.16em] text-white/45">FOUNDING CREATOR BENEFITS</p>
            <h2 id="benefits-title" className="mt-3 font-display text-3xl font-black tracking-[-0.035em] sm:text-5xl">
              {text({ ko: "베타에 먼저 온 사람에게 더 오래.", en: "More time for the creators who arrive first." })}
            </h2>
          </div>
          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {BETA_OPEN_EVENT.benefits.map((benefit, index) => {
              const Icon = BENEFIT_ICONS[index] ?? BadgeCheck;
              return (
                <article key={benefit.id} className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-sm sm:p-7">
                  <span className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/8"><Icon size={20} aria-hidden /></span>
                  <p className="mt-6 text-xs font-black tracking-[0.1em] text-amber-100/80">{text(benefit.emphasis)}</p>
                  <h3 className="mt-2 font-display text-2xl font-black tracking-[-0.025em]">{text(benefit.title)}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/58">{text(benefit.body)}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 border-t border-white/10 py-16 lg:grid-cols-[0.7fr_1.3fr] lg:py-20" aria-labelledby="event-notice-title">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-white/45">FAIR & CLEAR</p>
            <h2 id="event-notice-title" className="mt-3 font-display text-3xl font-black tracking-[-0.035em]">
              {text({ ko: "무료 혜택, 이렇게 운영합니다.", en: "How the free benefit works." })}
            </h2>
          </div>
          <ul className="grid gap-3">
            {BETA_OPEN_EVENT.notices.map((notice) => (
              <li key={notice.ko} className="flex gap-3 rounded-2xl border border-white/9 bg-white/[0.045] p-4 text-sm leading-7 text-white/62">
                <BadgeCheck size={18} className="mt-1 shrink-0 text-emerald-300" aria-hidden />
                <span>{text(notice)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[2.5rem] border border-white/12 bg-white/[0.075] p-7 text-center shadow-2xl shadow-black/20 sm:p-12">
          <p className="text-xs font-black tracking-[0.15em] text-amber-100/75">START DURING BETA</p>
          <h2 className="mx-auto mt-3 max-w-4xl font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
            {text({ ko: "지금은 무료. 시작하기 가장 좋은 때입니다.", en: "It is free now. This is the best time to begin." })}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/58">{description}</p>
          <div className="mt-7 flex justify-center">
            {authenticated ? (
              <Link href="/studio/new" className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-black">
                {text(BETA_OPEN_EVENT.secondaryCta)}<ArrowRight size={17} aria-hidden />
              </Link>
            ) : (
              <button type="button" onClick={openSignup} className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-black">
                {text(BETA_OPEN_EVENT.primaryCta)}<ArrowRight size={17} aria-hidden />
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default BetaOpenEventPage;
