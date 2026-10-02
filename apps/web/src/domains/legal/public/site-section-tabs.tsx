import type { LucideIcon } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { prefersReducedMotion, siteTabId, siteTabPanelId } from "./site-tabs";

/**
 * 공개 페이지 공통 섹션 탭 — 긴 세로 나열을 "한 번에 한 묶음"으로 바꾸는 WAI-ARIA 탭.
 *
 * 학습 홈·리서치 데스크·오늘의 영감처럼 기능이 많은 허브가 모바일에서 20화면 넘게 길어지지 않도록,
 * 같은 무게의 섹션을 탭으로 묶는다. 기능은 지우지 않고 옮기는 것이 원칙이라 각 패널은 처음 열 때
 * 마운트한 뒤에는 숨김만 바꿔 입력 중인 값과 스크롤 위치를 잃지 않는다.
 *
 * - 44px 터치 대상, 보이는 초점 링, ←/→·Home·End 키보드 이동(자동 선택).
 * - 좁은 화면: 탭이 4개 이하면 모두 한눈에 보이는 분할 버튼(아이콘 위·라벨 아래),
 *   그보다 많으면 가로로 흐르는 알약 줄(스크롤바 숨김). 넓은 화면에서는 줄바꿈되는 알약 줄.
 * - 선택 상태는 채움·테두리·굵기로 함께 표시해 색만으로 전달하지 않는다.
 */
export interface SiteSectionTab<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly icon?: LucideIcon;
  /** 라벨 옆 보조 텍스트(예: 저장 개수). 화면 읽기에도 그대로 읽힌다. */
  readonly badge?: ReactNode;
}

export interface SiteSectionTabsProps<T extends string> {
  readonly tabs: readonly SiteSectionTab<T>[];
  readonly value: T;
  readonly onChange: (next: T) => void;
  /** 탭 목록의 접근 가능한 이름. */
  readonly label: string;
  /** 탭·패널 id 접두사 — 한 페이지에 탭 묶음이 둘 이상이어도 겹치지 않게 한다. */
  readonly idPrefix: string;
  readonly className?: string;
}

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);
/** 휴대폰 폭(390px)에서 라벨이 잘리지 않고 한 줄에 다 보이는 최대 탭 수. */
const MAX_SEGMENTED_TABS = 4;
const SEGMENTED_COLUMNS: Readonly<Record<number, string>> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function SiteSectionTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  className,
}: SiteSectionTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  const select = (next: T, moveFocus: boolean) => {
    onChange(next);
    const list = listRef.current;
    if (!list) return;
    if (moveFocus) {
      const index = tabs.findIndex((tab) => tab.id === next);
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
    }
    // 긴 패널 아래에서 탭을 바꾸면 새 패널의 머리가 화면 위로 사라지지 않게 탭 줄을 다시 보여 준다.
    if (list.getBoundingClientRect().top < 0 && typeof list.scrollIntoView === "function") {
      list.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!NAVIGATION_KEYS.has(event.key) || tabs.length === 0) return;
    event.preventDefault();
    const last = tabs.length - 1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (next) select(next.id, true);
  };

  const segmented = tabs.length <= MAX_SEGMENTED_TABS;

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      data-site-section-tabs={segmented ? "segmented" : "scroll"}
      className={cn(
        "scroll-mt-24",
        segmented
          ? cn("grid gap-1.5 sm:flex sm:flex-wrap sm:gap-2", SEGMENTED_COLUMNS[tabs.length])
          : "-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            id={siteTabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={siteTabPanelId(idPrefix, tab.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => select(tab.id, false)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "border text-sm transition-[background-color,border-color,color] duration-150",
              segmented
                ? "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center leading-tight sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-0"
                : "inline-flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full px-4",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              active
                ? "border-accent bg-accent-soft font-bold text-accent"
                : "border-line bg-card/70 font-semibold text-fg-2 hover:border-accent/45 hover:text-fg",
            )}
          >
            {Icon ? <Icon size={16} className="shrink-0" aria-hidden="true" /> : null}
            <span className="inline-flex min-w-0 flex-wrap items-center justify-center gap-1 break-keep sm:flex-nowrap sm:gap-2">
              {tab.label}
              {tab.badge != null ? (
                <span className={cn("rounded-full px-1.5 py-0.5 text-xs tabular-nums sm:px-2", active ? "bg-accent/15" : "bg-raised text-fg-2")}>
                  {tab.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface SiteTabPanelProps {
  readonly idPrefix: string;
  readonly id: string;
  readonly active: boolean;
  /** 한 번 연 패널을 숨긴 채 유지할지 — 기본은 활성일 때만 렌더링. */
  readonly mounted?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function SiteTabPanel({ idPrefix, id, active, mounted = active, children, className }: SiteTabPanelProps) {
  if (!mounted && !active) return null;
  return (
    <div
      role="tabpanel"
      id={siteTabPanelId(idPrefix, id)}
      aria-labelledby={siteTabId(idPrefix, id)}
      hidden={!active}
      tabIndex={0}
      className={cn("focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas", className)}
    >
      {children}
    </div>
  );
}
