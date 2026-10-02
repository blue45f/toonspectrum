import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

/**
 * 공개 페이지 공통 이동 카드 — 아이콘 · 제목 · 한 줄 설명 · 열기 행동.
 *
 * 탐색 허브의 도구 카드, 내 공간 바로가기, 도움말 주제, 커뮤니티 입구처럼 "다음 화면으로
 * 이어지는" 카드를 같은 라운드·경계·호버로 맞춘다. 카드 전체가 하나의 링크라 키보드와
 * 터치 모두 한 번에 이동하고, 초점 링이 항상 보인다.
 *
 * - `default`: 세로형(아이콘 위, 설명·행동 아래).
 * - `compact`: 한 줄 가로형(아이콘 왼쪽, 화살표 오른쪽).
 * - `tile`: 휴대폰에서는 "아이콘 + 짧은 이름"만 보이는 작은 타일(2열 격자용), `sm` 이상에서는
 *   설명까지 보이는 세로 카드. 설명은 화면 읽기 프로그램에는 항상 읽힌다. 주제가 8개 안팎인 목록이
 *   모바일에서 세로로 길게 늘어지지 않게 한다.
 */
export interface SiteLinkCardProps {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** 카드 하단 행동 라벨(예: "열기"). 없으면 화살표만 둔다. */
  readonly cta?: ReactNode;
  /** 제목 옆 작은 상태 배지(예: 베타, 로그인 필요). */
  readonly badge?: ReactNode;
  readonly layout?: "default" | "compact" | "tile";
  readonly className?: string;
}

const LAYOUT_CLASS = {
  default: "min-h-36 flex-col",
  compact: "min-h-20 items-center gap-3.5",
  tile: "min-h-24 flex-col gap-2.5 p-3.5 sm:min-h-36 sm:gap-0 sm:p-4",
} as const;

export function SiteLinkCard({
  href,
  icon: Icon,
  title,
  description,
  cta,
  badge,
  layout = "default",
  className,
}: SiteLinkCardProps) {
  const compact = layout === "compact";
  const tile = layout === "tile";
  const showCta = !compact && cta != null;
  return (
    <Link
      href={href}
      data-site-link-card={layout}
      className={cn(
        "group relative flex rounded-2xl border border-line bg-card/70 p-4 transition-[border-color,background-color,transform] duration-200",
        "hover:border-accent/45 hover:bg-raised motion-safe:hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        LAYOUT_CLASS[layout],
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-accent transition-colors group-hover:border-accent/40 group-hover:bg-accent-soft">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col", !compact && !tile && "mt-4", tile && "sm:mt-4")}>
        <span className="flex flex-wrap items-center gap-1.5">
          <strong className={cn("break-keep font-bold text-fg", tile ? "text-sm leading-snug sm:text-base" : "text-sm")}>{title}</strong>
          {badge}
        </span>
        <span
          className={cn(
            "mt-1.5 flex-1 text-pretty break-keep text-sm leading-6 text-fg-2",
            tile && "sr-only sm:not-sr-only sm:block",
          )}
        >
          {description}
        </span>
        {showCta ? (
          <span className={cn("mt-3 inline-flex items-center gap-1 text-sm font-bold text-accent", tile && "hidden sm:inline-flex")}>
            {cta}
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        ) : null}
      </span>
      {compact ? (
        <ArrowRight
          size={16}
          className="shrink-0 text-fg-3 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-accent"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}
