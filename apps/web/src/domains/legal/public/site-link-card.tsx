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
  /** compact: 한 줄 가로형(아이콘 왼쪽), default: 세로형. */
  readonly layout?: "default" | "compact";
  readonly className?: string;
}

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
  return (
    <Link
      href={href}
      data-site-link-card={layout}
      className={cn(
        "group relative flex rounded-2xl border border-line bg-card/70 p-4 transition-[border-color,background-color,transform] duration-200",
        "hover:border-accent/45 hover:bg-raised motion-safe:hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        compact ? "min-h-20 items-center gap-3.5" : "min-h-36 flex-col",
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-accent transition-colors group-hover:border-accent/40 group-hover:bg-accent-soft">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col", !compact && "mt-4")}>
        <span className="flex flex-wrap items-center gap-1.5">
          <strong className="break-keep text-sm font-bold text-fg">{title}</strong>
          {badge}
        </span>
        <span className="mt-1.5 flex-1 text-pretty break-keep text-xs leading-5 text-fg-2">{description}</span>
        {!compact && cta != null ? (
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
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
