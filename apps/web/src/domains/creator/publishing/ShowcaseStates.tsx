// 창작 갤러리·챌린지·시리즈 화면이 함께 쓰는 빈 상태, 연결 불가 상태, 단계 안내 카드.
// 색은 활성 테마의 의미 토큰(--color-accent 등)만 사용해 스타라이트(보라)와 잉크(주홍) 모두에서 어울리게 한다.
import { CloudOff, RefreshCw, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const ACCENT_GLOW = "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 34%, transparent), transparent 70%)";

/** 카드 상단의 은은한 광원. 장식이므로 보조기술에서 숨긴다. */
function AccentGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-2 size-32 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
      style={{ background: ACCENT_GLOW }}
    />
  );
}

function StateMedallion({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="relative mx-auto mb-4 grid size-14 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent"
    >
      {children}
    </span>
  );
}

/** 결과가 없을 때 "무엇을 하면 채워지는지"를 알려 주는 빈 상태. */
export function ShowcaseEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-dashed border-line bg-panel/40 px-6 py-12 text-center",
        className,
      )}
    >
      <AccentGlow />
      <StateMedallion>
        <Icon size={26} />
      </StateMedallion>
      <p className="relative text-base font-semibold text-fg">{title}</p>
      <p className="relative mx-auto mt-1.5 max-w-sm text-pretty text-[0.8125rem] leading-relaxed text-fg-2">
        {description}
      </p>
      {action ? <div className="relative mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * 서버에 닿지 못했을 때의 상태. 빨간 경고 대신 "잠시 기다리거나 지금 할 수 있는 일"을 함께 보여 준다.
 * 재시도와 다음 행동(만들기·다른 화면)을 같은 자리에 두어 막다른 길을 만들지 않는다.
 */
export function ShowcaseUnavailableState({
  title,
  description,
  detail,
  onRetry,
  actions,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  /** 요청 실패 원문(사용자용 문장). 원인 파악을 돕도록 작게 함께 보여 준다. */
  readonly detail?: string | null;
  readonly onRetry?: () => void;
  readonly actions?: ReactNode;
  readonly className?: string;
}) {
  const bt = useBilingual("ShowcaseStates");
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="showcase-unavailable"
      className={cn(
        "relative overflow-hidden rounded-3xl border border-line bg-panel/50 px-6 py-10 text-center",
        className,
      )}
    >
      <AccentGlow />
      <StateMedallion>
        <CloudOff size={26} />
      </StateMedallion>
      <p className="relative text-base font-semibold text-fg">{title}</p>
      <p className="relative mx-auto mt-1.5 max-w-md text-pretty text-[0.8125rem] leading-relaxed text-fg-2">
        {description ?? bt(
          "온라인 연결을 준비하고 있거나 네트워크가 잠시 불안정합니다. 잠시 후 다시 시도하거나, 그동안 내 작품을 만들어 보세요.",
          "The online connection is warming up or the network is unstable. Try again shortly, or start your own work meanwhile.",
        )}
      </p>
      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}
          >
            <RefreshCw size={15} aria-hidden />
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
        {actions}
      </div>
      {detail ? (
        <p className="relative mx-auto mt-4 max-w-md text-pretty text-xs leading-relaxed text-fg-3">
          {bt("연결 상태", "Connection status")}: {detail}
        </p>
      ) : null}
    </div>
  );
}

export interface ShowcaseStep {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
}

/** 번호가 매겨진 3단계 안내 카드(예: 주제 확인 → 참여 → 공유). */
export function ShowcaseStepStrip({
  label,
  steps,
  className,
}: {
  readonly label: string;
  readonly steps: readonly ShowcaseStep[];
  readonly className?: string;
}) {
  return (
    <ol aria-label={label} className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {steps.map(({ icon: Icon, title, description }, index) => (
        <li key={title} className="flex items-start gap-3 rounded-2xl border border-line bg-card/60 p-4">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon size={18} />
          </span>
          <span className="min-w-0">
            <span className="numeral block font-display text-[0.72rem] font-semibold tracking-[0.12em] text-accent">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-fg">{title}</span>
            <span className="mt-1 block text-pretty text-xs leading-relaxed text-fg-2">{description}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
