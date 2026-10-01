import { ArrowUp, ChevronDown, ChevronsDownUp, ChevronsUpDown, ListTree, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import "./engineering-surfaces.css";

import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLongform", ko, en);

/**
 * 긴 기술 문서(스토리·플레이북·가이드·심화 노트) 공통 읽기 도구.
 * - 핵심 요약, 스크롤 위치를 따라가는 목차, 모두 펼치기/접기, 읽기 진행률, 맨 위로.
 * - 접기 상태는 네이티브 <details>를 그대로 사용한다(키보드·스크린 리더 기본 지원, 재렌더 없음).
 */

const DISCLOSURE_SELECTOR = "details[data-eng-disclosure]";

/* ── 핵심 요약 ─────────────────────────────────────────────── */

export function EngineeringKeySummary({
  points,
  meta,
  className,
}: {
  readonly points: readonly string[];
  readonly meta?: ReactNode;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  return (
    <section
      aria-labelledby="engineering-key-summary-title"
      className={cx(
        "relative overflow-hidden rounded-3xl border border-accent/30 bg-card/70 p-5 shadow-sm sm:p-6",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-gradient-to-b before:from-accent before:to-accent-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="engineering-key-summary-title" className="flex items-center gap-2 text-sm font-black text-fg">
          <Sparkles size={16} className="text-accent" aria-hidden="true" />
          {bi("핵심 요약", "Key summary")}
        </h2>
        {meta ? <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-fg-3">{meta}</div> : null}
      </div>
      <ul className="mt-4 grid gap-2.5">
        {points.map((point) => (
          <li key={point} className="flex gap-3 text-sm leading-7 text-fg-2 sm:text-[0.95rem]">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent-2" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EngineeringMetaChip({ children }: { readonly children: ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1">
      {children}
    </span>
  );
}

/* ── 접기 블록 ─────────────────────────────────────────────── */

export function EngineeringDisclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  bodyClassName,
}: {
  readonly summary: ReactNode;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly bodyClassName?: string;
}) {
  return (
    <details
      data-eng-disclosure=""
      open={defaultOpen || undefined}
      className={cx("group/disclosure rounded-3xl border border-line/70 bg-card/45 open:bg-card/70", className)}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-3xl px-5 py-3 text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">{summary}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-accent">
          <span className="group-open/disclosure:hidden">{bi("펼치기", "Expand")}</span>
          <span className="hidden group-open/disclosure:inline">{bi("접기", "Collapse")}</span>
          <ChevronDown size={16} className="transition-transform group-open/disclosure:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      </summary>
      <div className={cx("border-t border-line/70 p-5", bodyClassName)}>{children}</div>
    </details>
  );
}

function setAllDisclosures(root: HTMLElement | null, open: boolean): void {
  root?.querySelectorAll<HTMLDetailsElement>(DISCLOSURE_SELECTOR).forEach((element) => {
    element.open = open;
  });
}

/** 잘못 인코딩된 주소(#%E0 등)에서도 예외 없이 앵커 id를 읽는다. */
function hashTargetId(hash: string): string {
  const raw = hash.slice(1);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 주소의 #앵커가 가리키는 항목의 접힌 내용을 열어 링크로 들어온 사람이 바로 읽게 한다. */
function useOpenDisclosureForHash(bodyId: string): void {
  useEffect(() => {
    const openTarget = (): void => {
      const id = hashTargetId(window.location.hash);
      if (!id) return;
      const target = document.getElementById(id);
      const body = document.getElementById(bodyId);
      if (!target || !body?.contains(target)) return;
      // 대상 자체가 접기 블록(장애 기록 카드 등)이면 그것을, 아니면 안쪽 첫 접기 블록을 연다.
      const own = target instanceof HTMLDetailsElement && target.matches(DISCLOSURE_SELECTOR)
        ? target
        : target.querySelector<HTMLDetailsElement>(DISCLOSURE_SELECTOR);
      if (own) own.open = true;
      let ancestor = target.parentElement?.closest<HTMLDetailsElement>(DISCLOSURE_SELECTOR) ?? null;
      let openedAncestor = false;
      while (ancestor) {
        if (!ancestor.open) {
          ancestor.open = true;
          openedAncestor = true;
        }
        ancestor = ancestor.parentElement?.closest<HTMLDetailsElement>(DISCLOSURE_SELECTOR) ?? null;
      }
      if (openedAncestor) target.scrollIntoView({ block: "start" });
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, [bodyId]);
}

/* ── 스크롤 추적 ───────────────────────────────────────────── */

/** 화면 위쪽 20~40% 띠에 걸친 첫 섹션을 현재 위치로 본다. 섹션 사이 빈 곳에서는 직전 값을 유지한다. */
function useScrollSpy(idsKey: string): string | null {
  const [active, setActive] = useState<string | null>(() => idsKey.split("|")[0] || null);
  useEffect(() => {
    const ids = idsKey.split("|").filter(Boolean);
    if (typeof IntersectionObserver === "undefined" || ids.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const first = ids.find((id) => visible.has(id));
      if (first) setActive(first);
    }, { rootMargin: "-20% 0px -60% 0px" });
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [idsKey]);
  return active;
}

/** 본문 영역 기준 읽기 진행률(0~100, 정수). 스크롤마다 한 프레임에 한 번만 계산한다. */
function useReadingProgress(bodyId: string): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const body = document.getElementById(bodyId);
      if (!body) return;
      const rect = body.getBoundingClientRect();
      const travel = rect.height - window.innerHeight * 0.6;
      const value = travel <= 0 ? 100 : Math.round(Math.min(1, Math.max(0, -rect.top / travel)) * 100);
      setProgress((current) => (current === value ? current : value));
    };
    const schedule = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [bodyId]);
  return progress;
}

/* ── 목차 ──────────────────────────────────────────────────── */

export interface EngineeringTocItem {
  readonly id: string;
  readonly label: string;
  readonly marker?: string;
}

export interface EngineeringTocGroup {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly EngineeringTocItem[];
}

function scrollToTop(): void {
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  // 전역 맨 위로 버튼과 같이 본문 시작 랜드마크로 포커스를 옮긴다.
  document.getElementById("main-content")?.focus({ preventScroll: true });
}

function TocList({
  groups,
  activeId,
  onNavigate,
}: {
  readonly groups: readonly EngineeringTocGroup[];
  readonly activeId: string | null;
  readonly onNavigate?: () => void;
}) {
  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <div key={group.id}>
          {group.label ? (
            <p className="px-3 pb-1 pt-1 font-display text-[0.62rem] font-black uppercase tracking-[0.14em] text-fg-3">{group.label}</p>
          ) : null}
          <ol className="grid gap-0.5">
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "location" : undefined}
                    className={cx(
                      "flex min-h-11 items-start gap-2.5 rounded-xl border-l-2 px-3 py-2.5 text-xs leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "border-accent bg-accent-soft/40 font-bold text-fg"
                        : "border-transparent text-fg-3 hover:bg-raised hover:text-fg",
                    )}
                  >
                    {item.marker ? <span className="mt-px shrink-0 font-display font-black tabular-nums text-accent">{item.marker}</span> : null}
                    <span className="min-w-0">{item.label}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function CollapseControls({ bodyId, className }: { readonly bodyId: string; readonly className?: string }) {
  const buttonClass = "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  return (
    <div className={cx("flex gap-2", className)}>
      <button type="button" className={buttonClass} onClick={() => setAllDisclosures(document.getElementById(bodyId), true)}>
        <ChevronsUpDown size={14} aria-hidden="true" />
        {bi("모두 펼치기", "Expand all")}
      </button>
      <button type="button" className={buttonClass} onClick={() => setAllDisclosures(document.getElementById(bodyId), false)}>
        <ChevronsDownUp size={14} aria-hidden="true" />
        {bi("모두 접기", "Collapse all")}
      </button>
    </div>
  );
}

function ProgressBar({ value, label }: { readonly value: number; readonly label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-line/70"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span
        className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/**
 * 긴 문서 배치: 넓은 화면은 왼쪽 고정 목차, 좁은 화면은 상단 고정 목차 막대.
 * 목차 항목 id는 본문 요소의 id와 같아야 한다.
 */
export function EngineeringLongformLayout({
  groups,
  bodyId,
  tocLabel,
  children,
  collapsible = true,
}: {
  readonly groups: readonly EngineeringTocGroup[];
  readonly bodyId: string;
  readonly tocLabel: string;
  readonly children: ReactNode;
  readonly collapsible?: boolean;
}) {
  useBilingualI18nRevision();
  const ids = groups.flatMap((group) => group.items.map((item) => item.id));
  const activeId = useScrollSpy(ids.join("|"));
  const progress = useReadingProgress(bodyId);
  const mobileRef = useRef<HTMLDetailsElement>(null);
  useOpenDisclosureForHash(bodyId);
  const activeLabel = groups.flatMap((group) => group.items).find((item) => item.id === activeId)?.label ?? "";
  const progressLabel = formatI18nTemplate(String(bi("읽기 진행 {value0}%", "{value0}% read")), { value0: progress });

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[16.5rem_minmax(0,1fr)] xl:items-start xl:gap-8">
      <div className="hidden xl:sticky xl:top-[calc(var(--site-header-height,5rem)+1rem)] xl:block">
        <nav aria-label={tocLabel} className="grid gap-3 rounded-3xl border border-line/70 bg-panel/80 p-3 shadow-sm backdrop-blur-xl">
          <div className="grid gap-2 px-2 pt-1">
            <p className="flex items-center justify-between gap-2 text-xs font-black text-fg">
              <span className="inline-flex items-center gap-1.5"><ListTree size={14} className="text-accent" aria-hidden="true" />{bi("이 페이지", "On this page")}</span>
              <span className="font-display tabular-nums text-fg-3">{progress}%</span>
            </p>
            <ProgressBar value={progress} label={progressLabel} />
          </div>
          <div className="max-h-[calc(100dvh-var(--site-header-height,5rem)-15rem)] overflow-y-auto overscroll-contain pr-1">
            <TocList groups={groups} activeId={activeId} />
          </div>
          {collapsible ? <CollapseControls bodyId={bodyId} /> : null}
          <button
            type="button"
            onClick={scrollToTop}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-fg-3 transition-colors hover:bg-raised hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowUp size={14} aria-hidden="true" />
            {bi("맨 위로", "Back to top")}
          </button>
        </nav>
      </div>

      <details
        ref={mobileRef}
        className="group/toc sticky top-[calc(var(--site-header-height,4rem)+0.5rem)] z-30 rounded-2xl border border-line/70 bg-panel/95 shadow-sm backdrop-blur-xl xl:hidden"
      >
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <ListTree size={16} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.68rem] font-bold text-fg-3">{tocLabel} · {progress}%</span>
            <span className="block truncate text-sm font-black text-fg">{activeLabel}</span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-accent transition-transform group-open/toc:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <nav aria-label={tocLabel} className="grid max-h-[60dvh] gap-3 overflow-y-auto overscroll-contain border-t border-line/70 p-3">
          <TocList groups={groups} activeId={activeId} onNavigate={() => mobileRef.current?.removeAttribute("open")} />
          {collapsible ? <CollapseControls bodyId={bodyId} /> : null}
        </nav>
        <div className="px-4 pb-2"><ProgressBar value={progress} label={progressLabel} /></div>
      </details>

      <div id={bodyId} className="min-w-0">
        {children}
      </div>
    </div>
  );
}
