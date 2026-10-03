import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode, SyntheticEvent } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * 공개 페이지 공통 접기(`<details>`) — 보조 설명·고급 설정·긴 안내를 "제목 한 줄"로 접어 두는 문법.
 *
 * 처음에는 제목(과 한 줄 요약)만 보이고, 누르면 펼쳐진다. 기능을 지우지 않고 옮기는 단순화의 기본 도구다.
 * 브라우저 기본 `details`라 키보드(Enter/Space)·화면 읽기 지원이 그대로 동작하고, 44px 이상의 눌림 영역과
 * 보이는 초점 링을 갖는다. 제어가 필요하면 `open`/`onToggle`로 상태를 소유한다.
 */
export interface SiteDisclosureProps {
  /** 접힌 줄의 제목. */
  readonly title: ReactNode;
  /** 제목 아래 한 줄 요약(접혀 있어도 보인다). */
  readonly summary?: ReactNode;
  readonly icon?: LucideIcon;
  /** 제목 줄 오른쪽 보조 표지(예: 개수·상태). */
  readonly badge?: ReactNode;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onToggle?: (open: boolean) => void;
  readonly id?: string;
  readonly className?: string;
  /** 본문 영역 클래스. */
  readonly bodyClassName?: string;
}

export function SiteDisclosure({
  title,
  summary,
  icon: Icon,
  badge,
  children,
  open,
  defaultOpen,
  onToggle,
  id,
  className,
  bodyClassName,
}: SiteDisclosureProps) {
  return (
    <details
      id={id}
      data-site-disclosure=""
      className={cn("group scroll-mt-24 rounded-2xl border border-line bg-panel/60", className)}
      open={open ?? defaultOpen}
      onToggle={onToggle ? (event: SyntheticEvent<HTMLDetailsElement>) => onToggle(event.currentTarget.open) : undefined}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
        {Icon ? (
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <Icon size={17} aria-hidden="true" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <strong className="block break-keep text-sm font-bold text-fg sm:text-base">{title}</strong>
          {summary != null ? <span className="mt-0.5 block text-pretty break-keep text-sm leading-normal text-fg-2">{summary}</span> : null}
        </span>
        {badge}
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-accent transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className={cn("border-t border-line p-4 sm:p-5", bodyClassName)}>{children}</div>
    </details>
  );
}
