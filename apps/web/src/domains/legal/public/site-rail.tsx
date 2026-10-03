import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * 공개 페이지 공통 카드 레일 — 모바일에서는 가로로 넘기는 scroll-snap 줄, `sm` 이상에서는 격자.
 *
 * 세로로 쌓이면 한 화면을 넘기는 카드 묶음(학습 경로·추천 조합·다음 행동 등)을 모바일에서
 * 한 줄로 접어 페이지 길이를 줄인다. 다음 카드가 살짝 보이는 폭(peek)으로 넘길 수 있음을 알리고,
 * 카드 안의 링크로 탭 이동하면 브라우저가 해당 카드를 화면 안으로 스크롤한다.
 * 컨테이너 좌우 여백(px-4)만큼 바깥으로 번져 화면 끝까지 넘기되 페이지 가로 넘침은 만들지 않는다.
 */
export interface SiteRailProps {
  /** 목록의 접근 가능한 이름. */
  readonly label: string;
  readonly children: ReactNode;
  /** `sm` 이상 격자 열 수(Tailwind 클래스). */
  readonly columns?: string;
  readonly className?: string;
  /** 각 항목(li) 클래스 — 모바일 카드 폭을 바꿀 때. */
  readonly itemClassName?: string;
  /** 순서가 의미 있는 묶음(5컷 비트·단계)은 `<ol>`로 읽히게 한다. */
  readonly ordered?: boolean;
}

/**
 * 줄이 실제로 가로로 넘칠 때만 키보드 초점을 받게 한다 — 링크가 없는 카드 줄도 화살표 키로 넘길 수 있고,
 * 격자로 펼쳐진 넓은 화면에는 쓸모없는 탭 정지점이 생기지 않는다.
 */
function useScrollableTabStop(node: HTMLElement | null): boolean {
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    if (!node) return undefined;
    const measure = () => setScrollable(node.scrollWidth > node.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return scrollable;
}

export function SiteRail({
  label,
  children,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
  className,
  itemClassName,
  ordered = false,
}: SiteRailProps) {
  const List = ordered ? "ol" : "ul";
  const [node, setNode] = useState<HTMLElement | null>(null);
  const scrollable = useScrollableTabStop(node);
  return (
    <List
      ref={setNode}
      aria-label={label}
      data-site-rail=""
      tabIndex={scrollable ? 0 : undefined}
      className={cn(
        "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        "sm:mx-0 sm:grid sm:snap-none sm:overflow-visible sm:px-0 sm:pb-0",
        columns,
        className,
      )}
    >
      {Children.map(children, (child) =>
        isValidElement(child) ? (
          <li className={cn("flex w-[min(80vw,19rem)] shrink-0 snap-start sm:w-auto", itemClassName)}>{child}</li>
        ) : null,
      )}
    </List>
  );
}

/** "더 보기" 버튼 — 남은 개수를 라벨에 함께 적어 누르기 전에 분량을 알 수 있게 한다. */
export function SiteShowMoreButton({
  remaining,
  onClick,
  label,
  className,
}: {
  readonly remaining: number;
  readonly onClick: () => void;
  /** 예: `더 보기 · 12개 남음`. */
  readonly label: ReactNode;
  readonly className?: string;
}) {
  if (remaining <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-site-show-more=""
      className={cn(
        "mx-auto mt-4 flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-full border border-line bg-card/80 px-5 text-sm font-bold text-fg transition-colors hover:border-accent/50 hover:text-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        className,
      )}
    >
      {label}
    </button>
  );
}
