import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * 공개 페이지 공통 필터 칩 줄 — 카테고리·장르·종류처럼 "하나를 고르는" 필터를 한 줄로 보여 준다.
 *
 * 모바일에서는 가로로 넘기는 줄(스크롤바 숨김)이라 세로 공간을 쓰지 않고, 넓은 화면에서는 줄바꿈된다.
 * 이전의 `<select>` 대체 UI는 선택지가 숨어 있어 한눈에 고르기 어려웠다. 칩은 모든 선택지와 개수를
 * 바로 보여 주고, 선택 상태는 채움·테두리·굵기·체크 표시를 함께 써서 색만으로 전달하지 않는다.
 * 44px 터치 대상, 보이는 초점 링을 지킨다.
 */
export interface SiteFilterChip<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  /** 라벨 옆 개수(0도 그대로 보여 준다). */
  readonly count?: number;
}

export interface SiteFilterChipsProps<T extends string> {
  readonly chips: readonly SiteFilterChip<T>[];
  readonly value: T;
  readonly onChange: (next: T) => void;
  /** 그룹의 접근 가능한 이름. */
  readonly label: string;
  readonly className?: string;
}

export function SiteFilterChips<T extends string>({ chips, value, onChange, label, className }: SiteFilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      data-site-filter-chips=""
      className={cn(
        "-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
        className,
      )}
    >
      {chips.map((chip) => {
        const active = chip.id === value;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.id)}
            className={cn(
              "inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              active
                ? "border-accent bg-accent-soft font-bold text-accent"
                : "border-line bg-card/70 font-semibold text-fg-2 hover:border-accent/45 hover:text-fg",
            )}
          >
            {active ? <Check size={14} className="shrink-0" aria-hidden="true" /> : null}
            {chip.label}
            {chip.count != null ? (
              <span className={cn("numeral text-xs tabular-nums", active ? "text-accent" : "text-fg-2")}>{chip.count.toLocaleString("ko-KR")}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
