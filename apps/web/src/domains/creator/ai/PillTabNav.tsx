import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export interface PillTabNavItem {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly active: boolean;
}

/**
 * 관련 화면 사이를 오가는 알약형 탭 막대(AI 화면·제작 도구 화면이 함께 쓴다).
 * 좁은 화면에서 가로로 넘치면 현재 탭이 가려지지 않도록 목록의 가로 스크롤만 옮긴다.
 * scrollIntoView는 페이지 세로 스크롤까지 움직일 수 있어 쓰지 않는다.
 */
export function PillTabNav({
  label,
  items,
  surface = "panel",
}: {
  readonly label: string;
  readonly items: readonly PillTabNavItem[];
  readonly surface?: "panel" | "canvas";
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeId = items.find((item) => item.active)?.id;

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[aria-current='page']");
    if (!list || !current) return;
    const listBox = list.getBoundingClientRect();
    const itemBox = current.getBoundingClientRect();
    if (itemBox.left >= listBox.left && itemBox.right <= listBox.right) return;
    list.scrollLeft += itemBox.left - listBox.left - Math.max(0, (listBox.width - itemBox.width) / 2);
  }, [activeId]);

  return (
    <nav aria-label={label} className="min-w-0">
      <ul
        ref={listRef}
        className={cn(
          "flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-line p-1 [scrollbar-width:none]",
          surface === "canvas" ? "bg-canvas/60" : "bg-panel/80",
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3.5",
                  item.active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon size={16} aria-hidden="true" className="max-sm:hidden" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
