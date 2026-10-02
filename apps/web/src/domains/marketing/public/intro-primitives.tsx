import { ArrowLeft, ArrowRight, Check, CirclePlay, House, Info, PenTool, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import {
  ABOUT_JOURNEY_DETAILS,
  SERVICE_FLOW,
  type AboutJourneyHref,
  type ServiceFlowStep,
} from "../reference-home-content";
import { aboutJourneyNeighbors, serviceFlowNext, serviceFlowPrevious } from "./intro-journey";
import { INTRO_SCROLL_MARGIN } from "./intro-tokens";

/**
 * 서비스 소개·작업실 소개·제작 과정·제품 원칙·제품 투어가 함께 쓰는 공개 부품.
 * legal 도메인의 소개 페이지도 이 public 경계로만 가져온다(도메인 간 깊은 import 금지).
 * 탭·카드 레일은 사이트 공통 부품(`@/domains/legal/public/site-section-tabs`, `site-rail`)을 쓴다.
 */
const SCOPE = "domains.marketing.public.intro-primitives";

/* ───────────────────────── 섹션 제목 ───────────────────────── */

/** 눈썹(영문 대문자) → 제목 → (선택) 한 줄 설명. 제목은 건너뛰기 링크가 초점을 줄 수 있게 tabIndex=-1. */
export function IntroSectionHeading({ id, eyebrow, title, body, action, className }: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body?: string;
  /** 제목 오른쪽(넓은 화면)·아래(좁은 화면)에 붙는 보조 링크. */
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 max-w-3xl">
        <p className="eyebrow text-accent">{eyebrow}</p>
        <h2 id={id} tabIndex={-1} className={cx("mt-2 text-balance break-keep text-2xl font-bold tracking-tight text-fg sm:text-3xl", INTRO_SCROLL_MARGIN)}>{title}</h2>
        {body ? <p className="mt-3 max-w-[38rem] break-keep text-base leading-7 text-fg-2">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ───────────────────────── 히어로 행동 ───────────────────────── */

export interface IntroAction {
  readonly href: string;
  readonly label: string;
  readonly icon?: LucideIcon;
}

/** 모바일에서는 한 줄에 하나씩 꽉 차게, sm 이상에서는 내용 폭. 긴 라벨이 잘리지 않게 줄바꿈을 허용한다. */
const ACTION_CLASS = "w-full whitespace-normal text-center sm:w-auto";

/** 주요 행동(채움 버튼 + 화살표). */
export function IntroPrimaryLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass({ size: "lg", className: ACTION_CLASS })}>
      {children}
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  );
}

/** 보조 행동(윤곽선 버튼 + 선택 아이콘). */
export function IntroSecondaryLink({ href, icon: Icon, children }: {
  readonly href: string;
  readonly icon?: LucideIcon;
  readonly children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass({ variant: "outline", size: "lg", className: ACTION_CLASS })}>
      {Icon ? <Icon size={17} aria-hidden="true" /> : null}
      {children}
    </Link>
  );
}

/**
 * 첫 화면의 행동 쌍: 주요 행동 1개(채움) + 보조 행동 1개(윤곽선).
 * HeroBlock의 `actions` 슬롯에 그대로 넣을 수 있게 조각(fragment)으로 돌려준다.
 */
export function IntroActions({ primary, secondary }: { readonly primary: IntroAction; readonly secondary?: IntroAction }) {
  return (
    <>
      <IntroPrimaryLink href={primary.href}>{primary.label}</IntroPrimaryLink>
      {secondary ? <IntroSecondaryLink href={secondary.href} icon={secondary.icon}>{secondary.label}</IntroSecondaryLink> : null}
    </>
  );
}

/** 짧은 안내(role="note") 한 줄 + 선택 행동. 긴 설명 문단 대신 쓴다. */
export function IntroNote({ icon: Icon = Info, children, action, className }: {
  readonly icon?: LucideIcon;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div role="note" className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line/70 bg-panel/60 px-4 py-3 text-sm leading-6 text-fg-2", className)}>
      <Icon size={17} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 basis-56 break-keep">{children}</span>
      {action}
    </div>
  );
}

/* ───────────────────────── 단계 줄 ───────────────────────── */

export interface IntroStep {
  readonly id: string;
  /** 있으면 단계 카드가 그 화면으로 이어지는 링크가 되고, 없으면 설명만 하는 카드다. */
  readonly href?: string;
  readonly icon: LucideIcon;
  readonly title: string;
  /** 이 단계에서 남는 결과물이나 한 줄 설명. */
  readonly detail: string;
}

const STEP_CARD = "flex w-full flex-col gap-2 rounded-2xl border border-line/70 bg-panel/60 p-4";

const STEP_COLUMNS: Readonly<Record<number, string>> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/**
 * 순서가 있는 짧은 흐름(작동 방식·역할 인수인계). 모바일은 가로로 넘기는 한 줄,
 * sm은 2열, lg는 한 줄 격자에 단계 사이 화살표. 각 단계는 실제 화면으로 이어진다.
 */
export function IntroStepStrip({ steps, label, className }: {
  readonly steps: readonly IntroStep[];
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={cx(
        "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0",
        STEP_COLUMNS[steps.length],
        className,
      )}
    >
      {steps.map((step, index) => {
        const Icon = step.icon;
        const body = (
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="grid size-9 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="font-display text-xs font-bold tracking-[0.14em] text-accent" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            </span>
            <span className="break-keep text-base font-bold text-fg">{step.title}</span>
            <span className="break-keep text-sm leading-6 text-fg-2">{step.detail}</span>
          </>
        );
        return (
          <li key={step.id} className="relative flex w-[min(64vw,15rem)] shrink-0 snap-start sm:w-auto">
            {step.href ? (
              <Link href={step.href} className={cx(STEP_CARD, "group transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70")}>{body}</Link>
            ) : (
              <div className={STEP_CARD}>{body}</div>
            )}
            {index < steps.length - 1 ? (
              <ArrowRight size={16} className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-accent p-0.5 text-on-accent lg:block" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────── 소개 이전·다음 ───────────────────────── */

const PAGER_CARD = "group flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-2xl border px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:px-5";

/**
 * 소개 페이지 끝의 이전·다음. rel="prev"/"next"로 문서 순서를 브라우저·보조기술에도 알린다.
 * - `card`(기본): 소개 흐름의 마지막 행동인 페이지(작업실·제작 과정·원칙)에서 크게 보여 준다.
 * - `quiet`: 이미 '다음 행동' 카드(ServiceFlowNext)가 있는 페이지(서비스 소개)에서는 한 줄 링크로 낮춰 행동이 둘로 갈리지 않게 한다.
 */
export function AboutJourneyPager({ current, variant = "card", className }: {
  readonly current: AboutJourneyHref;
  readonly variant?: "card" | "quiet";
  readonly className?: string;
}) {
  const bi = useBilingualLocalizer(SCOPE);
  const { index, total, previous, next } = aboutJourneyNeighbors(current);
  if (index < 0) return null;
  const step = (n: number) => bi(`소개 ${n}/${total}`, `${n} of ${total}`);
  const label = bi("소개 페이지 이어 읽기", "Continue the introduction");

  if (variant === "quiet") {
    return (
      <nav aria-label={label} className={cx("flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line/60 pt-2", className)}>
        {previous ? (
          <Link href={previous.href} rel="prev" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-2 hover:text-fg">
            <ArrowLeft size={15} aria-hidden="true" />{bi(previous.ko, previous.en)}
          </Link>
        ) : <span aria-hidden="true" />}
        {next ? (
          <Link href={next.href} rel="next" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-2 hover:text-fg">
            <span className="text-xs font-bold tracking-[0.08em] text-fg-3">{step(index + 2)}</span>{bi(next.ko, next.en)}<ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </nav>
    );
  }

  return (
    <nav aria-label={label} className={cx("grid gap-3 sm:grid-cols-2", className)}>
      {previous ? (
        <Link href={previous.href} rel="prev" className={cx(PAGER_CARD, "border-line/70 bg-panel/55 hover:border-accent/40")}>
          <ArrowLeft size={18} className="shrink-0 text-fg-3 transition-transform group-hover:-translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-xs font-bold tracking-[0.08em] text-fg-2">{bi("이전", "Previous")} · {step(index)}</span>
            <span className="mt-0.5 block break-keep font-bold text-fg">{bi(previous.ko, previous.en)}</span>
            <span className="mt-0.5 block truncate text-sm text-fg-2">{bi(ABOUT_JOURNEY_DETAILS[previous.href].ko, ABOUT_JOURNEY_DETAILS[previous.href].en)}</span>
          </span>
        </Link>
      ) : <span className="hidden sm:block" aria-hidden="true" />}
      {next ? (
        <Link href={next.href} rel="next" className={cx(PAGER_CARD, "justify-end border-accent/35 bg-accent-soft text-right hover:border-accent/60")}>
          <span className="min-w-0">
            <span className="block text-xs font-bold tracking-[0.08em] text-accent">{bi("다음", "Next")} · {step(index + 2)}</span>
            <span className="mt-0.5 block break-keep font-bold text-fg">{bi(next.ko, next.en)}</span>
            <span className="mt-0.5 block truncate text-sm text-fg-2">{bi(ABOUT_JOURNEY_DETAILS[next.href].ko, ABOUT_JOURNEY_DETAILS[next.href].en)}</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-accent transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      ) : (
        <Link href="/studio/new" className={cx(PAGER_CARD, "justify-end border-accent/35 bg-accent-soft text-right hover:border-accent/60")}>
          <span className="min-w-0">
            <span className="block text-xs font-bold tracking-[0.08em] text-accent">{step(total)} · {bi("이제 시작하기", "Start now")}</span>
            <span className="mt-0.5 block break-keep font-bold text-fg">{bi("새 작품 시작하기", "Start a new work")}</span>
            <span className="mt-0.5 block truncate text-sm text-fg-2">{bi("웹툰·일러스트·캔버스 중 하나를 골라 바로 시작", "Pick a webtoon, illustration or canvas and begin")}</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-accent transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}

/* ───────────────────────── 처음 둘러보는 순서(시연 동선) ───────────────────────── */

const FLOW_ICONS: Readonly<Record<ServiceFlowStep, LucideIcon>> = {
  home: House,
  about: Sparkles,
  tour: CirclePlay,
  start: PenTool,
};

/**
 * 홈 → 서비스 소개 → 제품 투어 → 첫 작품 시작을 한 줄로 보여 주고 '다음' 행동 하나를 크게 둔다.
 * 처음 방문한 사람과 발표 시연이 같은 순서로 이어지며, 한 단계 전으로 돌아가는 링크도 함께 둔다.
 */
export function ServiceFlowNext({ current, title, className }: {
  readonly current: Exclude<ServiceFlowStep, "start">;
  readonly title?: string;
  readonly className?: string;
}) {
  const bi = useBilingualLocalizer(SCOPE);
  const next = serviceFlowNext(current);
  const previous = serviceFlowPrevious(current);
  const currentIndex = SERVICE_FLOW.findIndex((step) => step.id === current);
  return (
    <nav
      aria-label={bi("처음 둘러보는 순서", "Suggested first visit")}
      data-service-flow={current}
      className={cx(
        "grid gap-4 rounded-[1.75rem] border border-accent/30 bg-gradient-to-br from-accent-soft via-panel/80 to-panel p-4 shadow-sm sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6",
        className,
      )}
    >
      {/* 홈 대시보드(.reference-dashboard)와 옛 래퍼는 p·ol 여백을 요소 규칙으로 0으로 덮으므로 간격은 margin이 아니라 gap으로 만든다. */}
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-bold text-fg">{title ?? bi("처음이라면 이 순서로 둘러보세요", "New here? Follow this order")}</p>
          {previous ? (
            <Link href={previous.href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-fg">
              <ArrowLeft size={14} aria-hidden="true" />{bi("이전", "Back")}: {bi(previous.ko, previous.en)}
            </Link>
          ) : null}
        </div>
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {SERVICE_FLOW.map((step, index) => {
            const Icon = FLOW_ICONS[step.id];
            const active = step.id === current;
            const done = index < currentIndex;
            return (
              <li key={step.id} className="min-w-0">
                <Link
                  href={step.href}
                  aria-current={active ? "step" : undefined}
                  className={cx(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3",
                    active ? "border-accent bg-card font-bold text-fg" : done ? "border-line/70 bg-card/60 text-fg-2 hover:text-fg" : "border-line/70 bg-panel/50 text-fg-2 hover:border-accent/40 hover:text-fg",
                  )}
                >
                  <span className={cx("grid size-6 shrink-0 place-items-center rounded-full text-xs font-black", active ? "bg-accent text-on-accent" : done ? "bg-accent-soft text-accent" : "bg-raised text-fg-2")} aria-hidden="true">
                    {active ? <Icon size={13} /> : done ? <Check size={13} /> : index + 1}
                  </span>
                  <span className="max-w-full break-keep text-[0.8125rem] leading-tight sm:text-sm">{bi(step.ko, step.en)}</span>
                  {active ? <span className="sr-only">{bi("(지금 보는 단계)", "(current step)")}</span> : null}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
      {next ? (
        <Link href={next.href} className={buttonClass({ size: "lg", className: "w-full whitespace-normal text-center lg:w-auto" })}>
          {bi("다음", "Next")}: {bi(next.ko, next.en)}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
