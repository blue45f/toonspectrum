import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * 공개 페이지 공통 헤더 — "아이브로 · 제목 · 한 줄 설명 · 주요 행동" 문법을 한곳에서 고정한다.
 *
 * 탐색·커뮤니티·마켓·계정·도움말처럼 서로 다른 도메인의 페이지가 같은 위계와 간격으로
 * 시작하도록 만든 표현 전용 컴포넌트다. 도메인 사이에서는 `domains/legal/public` 경계로만
 * 가져다 쓰며, 여러 앱 영역이 쓰게 되면 `shared/components/layout`으로 승격할 후보다.
 *
 * - `size="hero"`: 허브(탐색·마켓 홈·학습 홈 등) 첫 화면용 큰 제목.
 * - `surface="plain"`: 카드 배경 없이 하단 구분선만 두는 작업형 페이지 헤더.
 * - `aside`: lg 이상에서 오른쪽에 두는 보조 요소(모바일에서는 본문 아래로 내려간다).
 */
export interface SitePageHeaderProps {
  /** 영역을 알려 주는 짧은 라벨(영문 대문자 권장). */
  readonly eyebrow: ReactNode;
  /** 아이브로 앞 아이콘. */
  readonly icon?: LucideIcon;
  /** 페이지 제목(h1). */
  readonly title: ReactNode;
  /** 제목 아래 한두 줄 설명. */
  readonly description?: ReactNode;
  /** 주요 행동 1개와 선택적 보조 행동. */
  readonly actions?: ReactNode;
  /** 설명 아래에 두는 입력·상태 요소(검색 폼, 필터 요약 등). */
  readonly children?: ReactNode;
  /** 오른쪽 보조 영역. */
  readonly aside?: ReactNode;
  /** 보조 영역 래퍼 클래스(예: 모바일에서 숨기기 `hidden sm:block`). */
  readonly asideClassName?: string;
  /** 보조 영역 폭 — `wide`는 대표 작품 카드처럼 큰 아트를 둘 때(lg 이상 최대 32rem). */
  readonly asideSize?: "default" | "wide";
  readonly titleId?: string;
  readonly className?: string;
  readonly surface?: "panel" | "plain";
  readonly size?: "default" | "hero";
}

const ASIDE_COLUMNS = {
  default: "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,24rem)]",
  wide: "lg:grid-cols-[minmax(0,1fr)_minmax(20rem,32rem)]",
} as const;

const TITLE_SIZE = {
  default: "text-[clamp(1.75rem,5.4vw,2.5rem)] leading-[1.15] tracking-[-0.03em]",
  hero: "text-[clamp(2rem,6vw,3.25rem)] leading-[1.1] tracking-[-0.045em]",
} as const;

export function SitePageHeader({
  eyebrow,
  icon: Icon,
  title,
  description,
  actions,
  children,
  aside,
  asideClassName,
  asideSize = "default",
  titleId,
  className,
  surface = "panel",
  size = "default",
}: SitePageHeaderProps) {
  const panel = surface === "panel";
  return (
    <header
      data-site-page-header={surface}
      className={cn(
        "relative isolate",
        panel
          ? "overflow-hidden rounded-3xl border border-line bg-panel/60 p-5 sm:p-7 lg:p-8"
          : "border-b border-line pb-6 sm:pb-8",
        className,
      )}
    >
      {panel ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"
        />
      ) : null}
      <div
        className={cn(
          "grid gap-6",
          aside != null && cn(ASIDE_COLUMNS[asideSize], "lg:items-center"),
        )}
      >
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
            {eyebrow}
          </p>
          <h1
            id={titleId}
            className={cn("mt-2.5 text-balance break-keep font-bold text-fg", TITLE_SIZE[size])}
          >
            {title}
          </h1>
          {description != null ? (
            <p className="mt-3 max-w-2xl text-balance break-keep text-sm leading-relaxed text-fg-2 sm:text-base">
              {description}
            </p>
          ) : null}
          {children != null ? <div className="mt-5">{children}</div> : null}
          {actions != null ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {aside != null ? <div className={cn("min-w-0", asideClassName)}>{aside}</div> : null}
      </div>
    </header>
  );
}
