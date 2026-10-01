/**
 * 모바일 시트 머리글의 탭(프리셋 · 정밀 조절 · 보기). 방향키로 옮기면 선택도 함께 바뀐다
 * (자동 활성화). 시트를 펼치는 일은 부모가 `onSelect`에서 맡는다.
 */
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import type { KeyboardEvent } from "react";

import { cn } from "@/shared/lib/utils";

const TAB_BUTTON = cn(
  "min-h-11 flex-1 rounded-lg text-[0.75rem] font-semibold transition-colors motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

export interface CharacterShaperSheetTab<T extends string> {
  readonly id: T;
  readonly label: string;
}

export function CharacterShaperSheetTabs<T extends string>({ tabs, active, idBase, onSelect }: {
  readonly tabs: readonly CharacterShaperSheetTab<T>[];
  readonly active: T;
  /** 탭 id는 `${idBase}-${tab}`, 패널 id는 `${idBase}-panel`이다. */
  readonly idBase: string;
  readonly onSelect: (id: T) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === active);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    onSelect(next.id);
    event.currentTarget.ownerDocument.getElementById(`${idBase}-${next.id}`)?.focus({ preventScroll: true });
  };
  return (
    <div role="tablist" aria-label="시트 내용" className="flex min-w-0 flex-1 gap-1">
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            id={`${idBase}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={handleKeyDown}
            className={cn(TAB_BUTTON, selected ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
