import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock3,
  FlaskConical,
  LayoutGrid,
  Presentation,
} from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { AboutSectionNav } from "../AboutSectionNav";
import {
  ENGINEERING_PAGES,
  ENGINEERING_PAGE_GROUPS,
  ENGINEERING_PATH_PAGES,
  engineeringPageForPath,
  findEngineeringPage,
  type EngineeringPageEntry,
  type EngineeringPageId,
} from "./engineering-tech-pages";
import { ENGINEERING_STATUS_META, type EngineeringStatus } from "./engineering-story-content";

import Link from "@/shared/navigation/router-link";
import { usePathname } from "@/shared/navigation/navigation";
import { Container } from "@/shared/components/section";
import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringStoryUi", ko, en);

/* ── 상태 배지 ─────────────────────────────────────────────── */

/** 상태 색은 테마의 의미 토큰(good/warn/bad/cool/accent)만 사용한다. 글자 라벨로도 상태를 전달한다. */
const STATUS_STYLES: Record<EngineeringStatus, string> = {
  live: "border-good/40 bg-good/12 text-good",
  configured: "border-accent/40 bg-accent-soft text-accent",
  experimental: "border-warn/40 bg-warn/12 text-warn",
  documented: "border-line-strong bg-raised text-fg-2",
  planned: "border-cool/40 bg-cool/12 text-cool",
  retired: "border-bad/40 bg-bad/12 text-bad",
  "reference-only": "border-line bg-card text-fg-3",
};

const STATUS_ICONS = {
  live: CheckCircle2,
  configured: CircleDot,
  experimental: FlaskConical,
  documented: BookOpen,
  planned: CircleDashed,
  retired: CircleDashed,
  "reference-only": CircleDot,
} as const;

export function EngineeringStatusBadge({
  status,
  className,
}: {
  readonly status: EngineeringStatus;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const Icon = STATUS_ICONS[status];
  const meta = ENGINEERING_STATUS_META[status];

  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-display text-[0.66rem] font-bold",
        STATUS_STYLES[status],
        className,
      )}
      title={bi(meta.description.ko, meta.description.en)}
    >
      <Icon size={12} aria-hidden="true" />
      {bi(meta.label.ko, meta.label.en)}
    </span>
  );
}

/* ── 하위 탭 메뉴 ──────────────────────────────────────────── */

function StepMark({ step, active }: { readonly step: number; readonly active: boolean }) {
  return (
    <span
      className={cx(
        "grid size-6 shrink-0 place-items-center rounded-full font-display text-[0.7rem] font-black",
        active ? "bg-accent text-on-accent" : "bg-accent-soft text-accent",
      )}
      aria-hidden="true"
    >
      {step}
    </span>
  );
}

/**
 * 기술 소개 하위 메뉴. 핵심(발표 동선 1~4)·발표·자료로 묶고, 라벨은 항상 한 줄로 유지한다.
 * 좁은 화면에서는 가로로 넘겨 보며, 현재 항목이 보이도록 가로 위치만 맞춘다(세로 스크롤은 건드리지 않음).
 */
export function EngineeringTechNav({ className }: { readonly className?: string }) {
  useBilingualI18nRevision();
  const pathname = usePathname();
  const current = engineeringPageForPath(pathname);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !active || scroller.scrollWidth <= scroller.clientWidth) return;
    const offset = active.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    scroller.scrollLeft = Math.max(0, offset - (scroller.clientWidth - active.offsetWidth) / 2);
  }, [pathname]);

  return (
    <nav
      aria-label={bi("기술 문서 메뉴", "Engineering documents")}
      className={cx("rounded-3xl border border-line/70 bg-panel/70 shadow-sm backdrop-blur-xl", className)}
    >
      <div ref={scrollerRef} className="flex snap-x gap-1 overflow-x-auto overscroll-x-contain p-2 [scrollbar-width:thin]">
        {ENGINEERING_PAGE_GROUPS.map((group, groupIndex) => {
          const pages = ENGINEERING_PAGES.filter((page) => page.group === group.id);
          const labelId = `engineering-nav-group-${group.id}`;
          return (
            <div
              key={group.id}
              role="group"
              aria-labelledby={labelId}
              className={cx("flex shrink-0 items-center gap-1", groupIndex > 0 && "border-l border-line/70 pl-2")}
            >
              <span id={labelId} className="px-2 font-display text-[0.68rem] font-black uppercase tracking-[0.12em] text-fg-3">
                {bi(group.label.ko, group.label.en)}
              </span>
              {pages.map((page) => {
                const active = current?.id === page.id;
                const Icon = page.icon;
                return (
                  <Link
                    key={page.id}
                    href={page.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group inline-flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-2xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "border-accent/45 bg-card text-fg shadow-sm"
                        : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
                    )}
                  >
                    {"step" in page ? (
                      <StepMark step={page.step} active={active} />
                    ) : (
                      <Icon size={15} aria-hidden="true" className={active ? "text-accent" : "text-fg-3 group-hover:text-accent"} />
                    )}
                    {bi(page.label.ko, page.label.en)}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/* ── 페이지 머리말 ─────────────────────────────────────────── */

function PageMeta({ page }: { readonly page: EngineeringPageEntry }) {
  if (page.readingMinutes) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Clock3 size={13} aria-hidden="true" />
        {formatI18nTemplate(String(bi("읽기 약 {value0}분", "About {value0} min read")), { value0: page.readingMinutes })}
      </span>
    );
  }
  if (page.talkMinutes) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Presentation size={13} aria-hidden="true" />
        {formatI18nTemplate(String(bi("발표 {value0}분", "{value0}-minute talk")), { value0: page.talkMinutes })}
      </span>
    );
  }
  return null;
}

export function EngineeringPageIntro({
  eyebrow,
  title,
  description,
  aside,
  pageId,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly aside?: ReactNode;
  /** 지정하면 발표 동선 단계와 읽기 시간을 함께 보여준다. */
  readonly pageId?: EngineeringPageId;
}) {
  useBilingualI18nRevision();
  const page = pageId ? findEngineeringPage(pageId) : undefined;
  return (
    <header className="grid gap-7 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {page?.step ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
              {formatI18nTemplate(String(bi("발표 동선 {value0}/5", "Talk path {value0}/5")), { value0: page.step })}
            </span>
          ) : null}
          <p className="eyebrow text-accent">{eyebrow}</p>
        </div>
        <h1 className="mt-4 max-w-4xl text-balance break-keep text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base sm:leading-8">{description}</p>
        {page ? (
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-fg-3">
            <PageMeta page={page} />
            <span>{bi(page.purpose.ko, page.purpose.en)}</span>
          </p>
        ) : null}
      </div>
      {aside ? <div className="lg:max-w-sm">{aside}</div> : null}
    </header>
  );
}

/* ── 하단 이어보기 ─────────────────────────────────────────── */

function PagerCard({
  page,
  direction,
}: {
  readonly page: EngineeringPageEntry;
  readonly direction: "previous" | "next";
}) {
  const Icon = page.icon;
  const next = direction === "next";
  return (
    <Link
      href={page.href}
      className={cx(
        "group flex min-h-24 flex-col justify-center gap-1.5 rounded-3xl border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        next
          ? "border-accent/40 bg-accent-soft/25 text-right hover:border-accent sm:items-end"
          : "border-line/70 bg-card/60 hover:border-accent/40",
      )}
    >
      <span className={cx("inline-flex items-center gap-2 text-xs font-bold text-fg-3", next && "sm:flex-row-reverse")}>
        {next ? <ArrowRight size={14} aria-hidden="true" /> : <ArrowLeft size={14} aria-hidden="true" />}
        {next ? bi("다음 단계", "Next step") : bi("이전 단계", "Previous step")}
      </span>
      <span className={cx("inline-flex items-center gap-2 text-lg font-black text-fg group-hover:text-accent", next && "sm:flex-row-reverse")}>
        {page.step ? <StepMark step={page.step} active={next} /> : <Icon size={18} aria-hidden="true" />}
        {bi(page.label.ko, page.label.en)}
      </span>
      <span className="text-sm leading-6 text-fg-2">{bi(page.purpose.ko, page.purpose.en)}</span>
    </Link>
  );
}

/** 발표 동선(1→5) 기준 이전·다음 페이지. 자료 페이지는 허브와 발표 모드로 이어준다. */
function EngineeringPathPager({ current, className }: { readonly current: EngineeringPageId; readonly className?: string }) {
  useBilingualI18nRevision();
  const pathIndex = ENGINEERING_PATH_PAGES.findIndex((page) => page.id === current);
  const previous = pathIndex > 0 ? ENGINEERING_PATH_PAGES[pathIndex - 1] : undefined;
  const next = pathIndex >= 0 ? ENGINEERING_PATH_PAGES[pathIndex + 1] : findEngineeringPage("deck");

  const hasNext = Boolean(next && next.id !== current);

  return (
    <nav aria-label={bi("기술 문서 이어보기", "Continue through the engineering documents")} className={cx("mt-14 grid gap-3 sm:grid-cols-2", className)}>
      {previous ? <PagerCard page={previous} direction="previous" /> : <HubCard />}
      {next && hasNext ? <PagerCard page={next} direction="next" /> : null}
      {previous && !hasNext ? <HubCard alignEnd /> : null}
    </nav>
  );
}

/** 기술 허브로 돌아가는 카드. 동선의 처음(이전 없음)과 끝(다음 없음)에 둔다. */
function HubCard({ alignEnd = false }: { readonly alignEnd?: boolean }) {
  return (
    <Link
      href="/about/technology"
      className={cx(
        "group flex min-h-24 flex-col justify-center gap-1.5 rounded-3xl border border-line/70 bg-card/60 p-5 transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        alignEnd && "sm:items-end sm:text-right",
      )}
    >
      <span className="inline-flex items-center gap-2 text-xs font-bold text-fg-3">
        <LayoutGrid size={14} aria-hidden="true" />
        {bi("기술 허브", "Engineering hub")}
      </span>
      <span className="text-lg font-black text-fg group-hover:text-accent">{bi("발표 동선 한눈에 보기", "See the whole talk path")}</span>
      <span className="text-sm leading-6 text-fg-2">{bi("다섯 단계와 자료실을 한 화면에서 고릅니다.", "Pick any of the five steps and resources on one screen.")}</span>
    </Link>
  );
}

/* ── 공통 페이지 틀 ────────────────────────────────────────── */

/** 기술 하위 페이지 공통 틀: 소개 메뉴(간결형) → 기술 메뉴 → 본문 → 이어보기. */
export function EngineeringPageFrame({
  pageId,
  children,
  className,
  pager = true,
}: {
  readonly pageId: EngineeringPageId;
  readonly children: ReactNode;
  readonly className?: string;
  readonly pager?: boolean;
}) {
  return (
    <Container size="wide" className={cx("py-6 sm:py-8 lg:py-10", className)}>
      <AboutSectionNav variant="compact" />
      <EngineeringTechNav className="mt-2" />
      {children}
      {pager ? <EngineeringPathPager current={pageId} /> : null}
    </Container>
  );
}
