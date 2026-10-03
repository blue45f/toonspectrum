// 단계 탭 줄 — 긴 작업대를 "한 번에 한 단계"로 나눈다. WAI-ARIA 탭 패턴(←/→/Home/End 이동, 선택된 탭만 Tab 순서).
// 좁은 화면에서는 줄이 가로로 스크롤되고, 선택한 탭이 줄 가운데에 오도록 가로로만 옮긴다(세로 스크롤은 건드리지 않는다).
// 패널은 호출하는 쪽이 그린다: 탭마다 패널을 하나씩 두고 선택되지 않은 패널은 hidden으로 두면 입력 초안이 사라지지 않는다.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import type { SectionTab } from "./section-tabs";

import { cn } from "@/shared/lib/utils";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function SectionTabs<TId extends string>({
  label,
  tabs,
  active,
  onSelect,
  tabId,
  panelId,
  numbered = false,
  countLabel,
  className,
}: {
  readonly label: string;
  readonly tabs: readonly SectionTab<TId>[];
  readonly active: TId;
  readonly onSelect: (id: TId) => void;
  readonly tabId: (id: TId) => string;
  readonly panelId: (id: TId) => string;
  /** 탭 앞에 01·02… 순번을 붙인다(순서대로 진행하는 작업대). */
  readonly numbered?: boolean;
  /** 개수 배지를 화면낭독기에 읽어 줄 문구(예: " · 항목 "). */
  readonly countLabel?: string;
  readonly className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<TId, HTMLButtonElement | null>>>({});

  // 좁은 화면에서 탭 줄이 가로로 넘치면, 선택한 탭이 줄 가운데에 오도록 가로로만 옮긴다.
  useEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current[active];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const delta = tab.getBoundingClientRect().left - list.getBoundingClientRect().left - (list.clientWidth - tab.offsetWidth) / 2;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    list.scrollBy?.({ left: delta, behavior: reduceMotion ? "auto" : "smooth" });
  }, [active]);

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0
          : event.key === "End" ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onSelect(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <div className={cn("sticky top-[var(--site-header-sticky-offset,5rem)] z-20 rounded-2xl border border-line bg-card/95 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85", className)}>
      <div ref={listRef} role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto [scrollbar-width:thin] lg:flex-wrap">
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => moveFocus(event, index)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold transition-colors",
                FOCUS,
                selected ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              {numbered ? (
                <span aria-hidden className={cn("text-xs tabular-nums", selected ? "text-on-accent/80" : "text-fg-3")}>
                  {String(index + 1).padStart(2, "0")}
                </span>
              ) : null}
              <Icon size={15} aria-hidden />
              {tab.label}
              {tab.count ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                    selected ? "bg-on-accent/20 text-on-accent" : "bg-accent-soft text-fg",
                  )}
                >
                  {countLabel ? <span className="sr-only">{countLabel}</span> : null}
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 단계 아래의 이전·다음 이동 — 위에서부터 차례로 진행하는 흐름을 탭에서도 이어 간다. */
export function SectionTabsFooter<TId extends string>({
  label,
  tabs,
  active,
  onSelect,
  previousLabel,
  nextLabel,
  className,
}: {
  readonly label: string;
  /** 순서대로 나열한 단계(이동 버튼에는 이름만 쓴다). */
  readonly tabs: readonly Pick<SectionTab<TId>, "id" | "label">[];
  readonly active: TId;
  readonly onSelect: (id: TId) => void;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly className?: string;
}) {
  const index = tabs.findIndex((tab) => tab.id === active);
  const previous = index > 0 ? tabs[index - 1] : undefined;
  const next = index >= 0 && index < tabs.length - 1 ? tabs[index + 1] : undefined;
  const base = cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors", FOCUS);
  return (
    <nav aria-label={label} className={cn("mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5", className)}>
      {previous ? (
        <button type="button" className={cn(base, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")} onClick={() => onSelect(previous.id)}>
          <ChevronLeft size={16} aria-hidden />
          {previousLabel} · {previous.label}
        </button>
      ) : <span />}
      {next ? (
        <button type="button" className={cn(base, "border-accent/40 bg-card text-fg hover:bg-raised")} onClick={() => onSelect(next.id)}>
          {nextLabel} · {next.label}
          <ChevronRight size={16} aria-hidden />
        </button>
      ) : null}
    </nav>
  );
}
