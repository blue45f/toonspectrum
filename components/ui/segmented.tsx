"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useId } from "react";

export interface SegItem<T extends string> {
  value: T;
  label: React.ReactNode;
  hint?: string;
}

// WAI-ARIA 탭 키보드 패턴 — ←/→(·↑/↓)·Home·End로 탭 이동(자동 선택 + 포커스 이동).
function handleTabKeys<T extends string>(
  e: React.KeyboardEvent<HTMLButtonElement>,
  items: SegItem<T>[],
  value: T,
  onChange: (v: T) => void
) {
  const idx = items.findIndex((it) => it.value === value);
  let next = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % items.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + items.length) % items.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  else return;
  e.preventDefault();
  onChange(items[next].value);
  const list = e.currentTarget.closest('[role="tablist"]');
  list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}

// 세그먼티드 컨트롤 — 알약형. active 뒤로 슬라이딩 인디케이터.
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  className,
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const groupId = useId();
  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-full border border-line bg-panel p-1",
        className
      )}
      role="tablist"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            aria-label={typeof it.label === "string" ? undefined : it.hint}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => handleTabKeys(e, items, value, onChange)}
            title={it.hint}
            className={cn(
              "relative z-10 rounded-full font-medium transition-colors duration-150",
              size === "sm" ? "px-3 py-1 text-[0.8rem]" : "px-3.5 py-1.5 text-sm",
              active ? "text-on-accent" : "text-fg-2 hover:text-fg"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                className="absolute inset-0 -z-10 rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// 언더라인 탭 (텍스트 내비) — 하단 악센트 바 슬라이딩
export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const groupId = useId();
  return (
    <div className={cn("flex items-center gap-1 border-b border-line", className)} role="tablist">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => handleTabKeys(e, items, value, onChange)}
            className={cn(
              "relative px-3 py-2.5 text-sm font-medium transition-colors duration-150",
              active ? "text-fg" : "text-fg-3 hover:text-fg-2"
            )}
          >
            {it.label}
            {active && (
              <motion.span
                layoutId={`tab-${groupId}`}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
