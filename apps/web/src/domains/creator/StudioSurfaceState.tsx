import {
  Ban,
  CircleAlert,
  CircleCheck,
  Info,
  Loader2,
  SearchX,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export type StudioSurfaceStateKind =
  | "empty"
  | "loading"
  | "error"
  | "blocked"
  | "success"
  | "info";

export type StudioSurfaceStateAnnouncement = "none" | "polite" | "assertive";

const STATE_ICON: Readonly<Record<StudioSurfaceStateKind, LucideIcon>> = {
  empty: SearchX,
  loading: Loader2,
  error: CircleAlert,
  blocked: Ban,
  success: CircleCheck,
  info: Info,
};

const STATE_TONE: Readonly<Record<StudioSurfaceStateKind, string>> = {
  empty: "border-line/80 bg-panel/45 text-fg-3",
  loading: "border-cool/35 bg-cool/5 text-cool",
  error: "border-bad/40 bg-bad/5 text-bad",
  blocked: "border-warn/40 bg-warn/5 text-warn",
  success: "border-good/40 bg-good/5 text-good",
  info: "border-accent/35 bg-accent-soft/20 text-accent",
};

const DEFAULT_ANNOUNCEMENT: Readonly<
  Record<StudioSurfaceStateKind, StudioSurfaceStateAnnouncement>
> = {
  // Empty results frequently appear after search/filter input, so preserve the polite announcement.
  // Callers rendering a permanently static empty card can explicitly opt out with announce="none".
  empty: "polite",
  info: "none",
  blocked: "none",
  loading: "polite",
  success: "polite",
  error: "assertive",
};

export interface StudioSurfaceStateProps {
  state: StudioSurfaceStateKind;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** Static cards can opt out; newly appeared states can choose polite or assertive. */
  announce?: StudioSurfaceStateAnnouncement;
  compact?: boolean;
  className?: string;
}

/**
 * Studio의 빈 상태·로딩·오류·잠금·완료 안내를 하나의 시각/접근성 문법으로 통일한다.
 * 검색·필터 결과처럼 동적으로 바뀌는 빈 상태는 공지하고, 정적 안내는 호출부가 끌 수 있다.
 */
export function StudioSurfaceState({
  state,
  title,
  description,
  icon,
  action,
  secondaryAction,
  announce = DEFAULT_ANNOUNCEMENT[state],
  compact = false,
  className,
}: StudioSurfaceStateProps): ReactElement {
  const Icon = STATE_ICON[state];
  const live = announce === "none" ? undefined : announce;
  const role = announce === "assertive" ? "alert" : announce === "polite" ? "status" : undefined;

  return (
    <section
      role={role}
      aria-live={live}
      aria-atomic={live ? "true" : undefined}
      aria-busy={state === "loading" ? true : undefined}
      data-studio-surface-state={state}
      data-studio-empty-state={state === "empty" ? "true" : undefined}
      data-studio-surface-announcement={announce}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border text-center",
        "shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.04)]",
        compact ? "px-3 py-4" : "px-4 py-8",
        STATE_TONE[state],
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-45"
        style={{
          backgroundImage:
            "radial-gradient(currentColor 0.55px, transparent 0.7px)",
          backgroundSize: "12px 12px",
        }}
      />
      <div
        className={cn(
          "mx-auto grid place-items-center rounded-2xl border border-current/20 bg-card/75 shadow-sm",
          compact ? "mb-2 size-9" : "mb-2.5 size-12",
        )}
      >
        {icon ?? (
          <Icon
            size={compact ? 17 : 21}
            aria-hidden
            className={cn(
              state === "loading" &&
                "animate-spin motion-reduce:animate-none",
            )}
          />
        )}
      </div>
      <h3
        className={cn(
          "font-bold tracking-tight text-fg text-pretty",
          compact ? "text-[0.72rem]" : "text-xs",
        )}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            "mx-auto mt-1.5 max-w-[36ch] leading-relaxed text-fg-3 text-pretty",
            compact ? "text-[0.65rem]" : "text-[0.7rem]",
          )}
        >
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}
