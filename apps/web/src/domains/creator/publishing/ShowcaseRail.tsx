// 좁은 화면에서는 가로로 넘기는 카드 레일(scroll-snap), sm 이상에서는 격자로 바뀌는 목록.
// 세로로 길게 쌓이던 추천 카드 묶음을 모바일에서 한 줄로 줄여 페이지 길이를 줄인다.
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export function ShowcaseRail<T>({
  label,
  items,
  itemKey,
  renderItem,
  gridClassName,
  itemClassName = "w-[44%] min-[480px]:w-[30%]",
}: {
  readonly label: string;
  readonly items: readonly T[];
  readonly itemKey: (item: T) => string;
  readonly renderItem: (item: T) => ReactNode;
  /** sm 이상에서 쓸 격자 열 수(예: "sm:grid-cols-3 lg:grid-cols-5"). */
  readonly gridClassName: string;
  /** 모바일 레일에서 카드 한 장의 너비. 다음 카드가 살짝 보이게 해 넘길 수 있음을 알린다. */
  readonly itemClassName?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin]",
        "sm:grid sm:overflow-visible sm:pb-0",
        gridClassName,
      )}
    >
      {items.map((item) => (
        <li key={itemKey(item)} className={cn("shrink-0 snap-start sm:w-auto", itemClassName)}>
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
