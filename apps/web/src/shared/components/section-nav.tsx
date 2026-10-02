import { ChevronDown, type LucideIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { cn } from "@/shared/lib/utils";

/**
 * 공용 섹션 내비 — 셸·내비게이션 표준 S-2의 유일한 구현.
 *
 * 표준 문서: `~/workspace/goals/toonstudio-site-modernization/hidden_files/shell-nav-2026-10-02/nav-standard.md`
 *
 * - 데스크톱(≥1024px): 좌측 sticky 레일. 폭 13.5rem·sticky top 5.5rem·패널 배경·그룹 라벨·항목
 *   규격은 D-1 리서치 레일(`ResourceLayout`의 `.resource-sidenav`)과 같은 문법이다. 새 문법을
 *   만들지 말고 이 컴포넌트를 쓴다.
 * - 모바일: 같은 DOM이 상단 칩 줄로 변환된다(링크 모드=가로 스크롤, 탭 모드=4개 이하 분할 버튼).
 *   데스크톱/모바일 DOM을 따로 렌더링하지 않으므로 접근성 트리에 내비가 중복되지 않는다.
 * - 현재 위치: 링크 모드는 `aria-current="page"`, 탭 모드는 `aria-selected` + 같은 accent 채움.
 *   색만으로 전달하지 않는다(굵기 병행).
 * - 링크 모드의 그룹은 접을 수 있다(`collapsible`). 현재 항목이 든 그룹은 처음부터 접지 않는다.
 * - 탭 모드는 `SiteTabPanel`과 계약이 같다: 탭 id `${idPrefix}-tab-${id}`,
 *   패널 id `${idPrefix}-panel-${id}` (`site-tabs.ts`의 siteTabId/siteTabPanelId와 동일 형식).
 */

export interface SectionNavItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: LucideIcon;
  readonly badge?: ReactNode;
  /** 링크 모드 전용 — 라우트 경로 또는 `#앵커`. */
  readonly href?: string;
  /** 링크 모드 현재 위치 강제 지정. 없으면 현재 경로와 href를 비교한다. */
  readonly current?: boolean;
}

export interface SectionNavGroup {
  readonly id: string;
  /** 없으면 라벨 없는 평면 묶음. */
  readonly label?: ReactNode;
  readonly items: readonly SectionNavItem[];
  /** 링크 모드 전용 — 데스크톱 레일에서 그룹을 접을 수 있게 한다. */
  readonly collapsible?: boolean;
  readonly defaultCollapsed?: boolean;
}

export interface SectionNavProps {
  /** 내비의 접근 가능한 이름. */
  readonly label: string;
  readonly items?: readonly SectionNavItem[];
  readonly groups?: readonly SectionNavGroup[];
  readonly mode?: "links" | "tabs";
  /** 탭 모드 전용. */
  readonly value?: string;
  readonly onChange?: (id: string) => void;
  readonly idPrefix?: string;
  readonly className?: string;
}

const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);
/** 휴대폰 폭에서 라벨이 잘리지 않고 한 줄에 다 보이는 최대 탭 수 (SiteSectionTabs와 동일 기준). */
const MAX_SEGMENTED_TABS = 4;
const SEGMENTED_COLUMNS: Readonly<Record<number, string>> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** D-1 리서치 레일과 같은 수치의 레일 외형 — lg에서만 적용된다. */
const RAIL_CHROME =
  "lg:sticky lg:top-[5.5rem] lg:rounded-[0.65rem] lg:border lg:border-line lg:bg-panel lg:p-[0.85rem_0.8rem_1rem]";

const ITEM_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

function isCurrentHref(pathname: string, href: string): boolean {
  if (href.startsWith("#")) return false;
  const path = href.split(/[?#]/u)[0] ?? href;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function ItemBadge({ active, children }: { readonly active: boolean; readonly children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-xs tabular-nums sm:px-2",
        active ? "bg-accent/15" : "bg-raised text-fg-2",
      )}
    >
      {children}
    </span>
  );
}

function LinkItem({
  item,
  pathname,
}: {
  readonly item: SectionNavItem;
  readonly pathname: string;
}) {
  const current = item.current ?? (item.href ? isCurrentHref(pathname, item.href) : false);
  const Icon = item.icon;
  return (
    <Link
      to={item.href ?? "#"}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm transition-[background-color,border-color,color] duration-150",
        "lg:min-h-10 lg:w-full lg:whitespace-normal lg:rounded-[0.4rem] lg:px-[0.6rem] lg:py-[0.35rem] lg:text-[0.8rem]",
        ITEM_FOCUS,
        current
          ? "border-accent bg-accent-soft font-bold text-accent lg:border-accent"
          : "border-line bg-card/70 font-semibold text-fg-2 hover:border-accent/45 hover:text-fg lg:border-transparent lg:bg-transparent lg:font-[650] lg:hover:border-transparent lg:hover:bg-raised",
      )}
    >
      {Icon ? <Icon size={16} className="shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.badge != null ? <ItemBadge active={current}>{item.badge}</ItemBadge> : null}
    </Link>
  );
}

function LinkGroup({
  group,
  pathname,
}: {
  readonly group: SectionNavGroup;
  readonly pathname: string;
}) {
  const hasCurrent = group.items.some(
    (item) => item.current ?? (item.href ? isCurrentHref(pathname, item.href) : false),
  );
  const [collapsed, setCollapsed] = useState(
    Boolean(group.collapsible && group.defaultCollapsed && !hasCurrent),
  );
  const collapsible = Boolean(group.collapsible);
  return (
    <div className="contents lg:mt-4 lg:block lg:first:mt-0">
      {group.label != null ? (
        collapsible ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
            className={cn(
              "mb-1 hidden w-full items-center justify-between px-[0.6rem] text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-fg-3 lg:flex",
              ITEM_FOCUS,
            )}
          >
            <span>{group.label}</span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn("transition-transform motion-reduce:transition-none", collapsed && "-rotate-90")}
            />
          </button>
        ) : (
          <p
            aria-hidden="true"
            className="mb-1 hidden px-[0.6rem] text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-fg-3 lg:block"
          >
            {group.label}
          </p>
        )
      ) : null}
      <div
        role={group.label != null && !collapsible ? "group" : undefined}
        aria-label={group.label != null && !collapsible && typeof group.label === "string" ? group.label : undefined}
        className={cn("contents lg:grid lg:gap-[0.15rem]", collapsed && "lg:hidden")}
      >
        {group.items.map((item) => (
          <LinkItem key={item.id} item={item} pathname={pathname} />
        ))}
      </div>
    </div>
  );
}

function LinksNav({
  label,
  groups,
  className,
}: {
  readonly label: string;
  readonly groups: readonly SectionNavGroup[];
  readonly className?: string;
}) {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label={label}
      data-section-nav="links"
      className={cn(
        "flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "lg:grid lg:items-stretch lg:gap-0 lg:overflow-visible lg:pb-0",
        RAIL_CHROME,
        className,
      )}
    >
      {groups.map((group) => (
        <LinkGroup key={group.id} group={group} pathname={pathname} />
      ))}
    </nav>
  );
}

function TabsNav({
  label,
  items,
  value,
  onChange,
  idPrefix,
  className,
}: {
  readonly label: string;
  readonly items: readonly SectionNavItem[];
  readonly value?: string;
  readonly onChange?: (id: string) => void;
  readonly idPrefix?: string;
  readonly className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const segmented = items.length <= MAX_SEGMENTED_TABS;

  const select = (next: string, moveFocus: boolean) => {
    onChange?.(next);
    const list = listRef.current;
    if (!list) return;
    if (moveFocus) {
      const index = items.findIndex((item) => item.id === next);
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
    }
    // 긴 패널 아래에서 탭을 바꾸면 새 패널의 머리가 화면 위로 사라지지 않게 탭 줄을 다시 보여 준다.
    if (list.getBoundingClientRect().top < 0 && typeof list.scrollIntoView === "function") {
      list.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!NAVIGATION_KEYS.has(event.key) || items.length === 0) return;
    event.preventDefault();
    const last = items.length - 1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : event.key === "ArrowRight"
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
    const next = items[nextIndex];
    if (next) select(next.id, true);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      data-section-nav="tabs"
      data-site-section-tabs={segmented ? "segmented" : "scroll"}
      className={cn(
        "scroll-mt-24",
        segmented
          ? cn("grid gap-1.5", SEGMENTED_COLUMNS[items.length])
          : "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "lg:flex lg:flex-col lg:gap-[0.15rem] lg:overflow-visible lg:pb-0",
        RAIL_CHROME,
        className,
      )}
    >
      {items.map((item, index) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.id}` : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => select(item.id, false)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "border text-sm transition-[background-color,border-color,color] duration-150",
              segmented
                ? "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center leading-tight"
                : "inline-flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full px-4",
              "lg:min-h-10 lg:w-full lg:flex-row lg:justify-start lg:gap-2 lg:rounded-[0.4rem] lg:px-[0.6rem] lg:py-[0.35rem] lg:text-left lg:text-[0.8rem]",
              ITEM_FOCUS,
              active
                ? "border-accent bg-accent-soft font-bold text-accent lg:border-accent"
                : "border-line bg-card/70 font-semibold text-fg-2 hover:border-accent/45 hover:text-fg lg:border-transparent lg:bg-transparent lg:font-[650] lg:hover:border-transparent lg:hover:bg-raised",
            )}
          >
            {Icon ? <Icon size={16} className="shrink-0" aria-hidden="true" /> : null}
            <span className="inline-flex min-w-0 flex-wrap items-center justify-center gap-1 break-keep lg:flex-nowrap lg:justify-start lg:gap-2">
              {item.label}
              {item.badge != null ? <ItemBadge active={active}>{item.badge}</ItemBadge> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SectionNav({
  label,
  items,
  groups,
  mode = "links",
  value,
  onChange,
  idPrefix,
  className,
}: SectionNavProps) {
  if (mode === "tabs") {
    return (
      <TabsNav
        label={label}
        items={items ?? []}
        value={value}
        onChange={onChange}
        idPrefix={idPrefix}
        className={className}
      />
    );
  }
  const resolvedGroups = groups ?? [{ id: "default", items: items ?? [] }];
  return <LinksNav label={label} groups={resolvedGroups} className={className} />;
}
