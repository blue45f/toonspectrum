import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, CircleHelp, Users, X } from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  EMPTY_STATE_GUIDES,
  PRODUCTION_HUB_TOUR_STEPS,
  PRODUCTION_TOUR_STORAGE_KEY,
  canGoNextWizardStep,
  canGoPrevWizardStep,
  clampWizardIndex,
  markProductionTourSeenValue,
  presenceAvatarTone,
  presenceInitial,
  shouldShowProductionTour,
  slicePresenceMembers,
  wizardProgressPercent,
  wizardStepStates,
  type EmptyStateGuideId,
  type PresenceMember,
  type WizardStepDefinition,
} from "./production-ux-kit/production-ux-kit-model";

/* ------------------------------------------------------------------ */
/* 3단계 마법사 셸 — 3클릭 원칙: 어떤 협업 플로우도 최대 3단계.         */
/* ------------------------------------------------------------------ */

export function ProductionWizard({
  steps,
  currentIndex,
  onIndexChange,
  onComplete,
  onCancel,
  completeLabel = "완료",
  /** 이 단계에서는 다음/완료 버튼을 숨긴다 (본문이 자체 액션을 가질 때). */
  hideNextOnSteps = [],
  /** 이 단계에서는 다음/완료 버튼을 비활성화한다 (입력 검증 등). */
  isNextDisabled,
  children,
  className,
}: {
  readonly steps: readonly WizardStepDefinition[];
  readonly currentIndex: number;
  readonly onIndexChange: (index: number) => void;
  readonly onComplete: () => void;
  readonly onCancel?: () => void;
  readonly completeLabel?: string;
  readonly hideNextOnSteps?: readonly number[];
  readonly isNextDisabled?: (stepIndex: number) => boolean;
  readonly children: (stepIndex: number) => ReactNode;
  readonly className?: string;
}) {
  const stepCount = steps.length;
  const current = clampWizardIndex(currentIndex, stepCount);
  const states = wizardStepStates(stepCount, current);
  const progress = wizardProgressPercent(stepCount, current);
  const step = steps[current];

  return (
    <div className={cn("rounded-3xl border border-line bg-card p-5 sm:p-6", className)} data-slot="production-wizard">
      {/* 진행 표시 */}
      <ol className="flex items-center gap-2" aria-label={`전체 ${stepCount}단계 중 ${current + 1}단계`}>
        {steps.map((definition, index) => {
          const state = states[index];
          return (
            <li key={definition.id} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => onIndexChange(index)}
                disabled={index > current}
                aria-current={index === current ? "step" : undefined}
                aria-label={`${index + 1}단계: ${definition.title}${state === "done" ? " (완료)" : ""}`}
                className={cn(
                  "grid min-h-11 min-w-11 place-items-center rounded-full border text-sm font-bold",
                  state === "done" && "border-good/40 bg-good/10 text-good",
                  state === "active" && "border-accent bg-accent-soft text-accent",
                  state === "todo" && "border-line bg-canvas text-fg-3",
                )}
              >
                {state === "done" ? <Check size={16} aria-hidden="true" /> : index + 1}
              </button>
              <span className={cn("hidden text-xs font-semibold sm:block", index === current ? "text-fg" : "text-fg-3")}>
                {definition.title}
              </span>
              {index < stepCount - 1 ? <span aria-hidden="true" className="h-px flex-1 bg-line" /> : null}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="마법사 진행률">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      {/* 현재 단계 */}
      {step ? (
        <div className="mt-5">
          <h3 className="text-lg font-bold">{step.title}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">{step.description}</p>
          <div className="mt-4">{children(current)}</div>
        </div>
      ) : null}

      {/* 이전/다음 */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          {onCancel ? (
            <button type="button" className={buttonClass({ variant: "ghost" })} onClick={onCancel}>
              취소
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass({ variant: "outline" })}
            disabled={!canGoPrevWizardStep(stepCount, current)}
            onClick={() => onIndexChange(current - 1)}
          >
            <ChevronLeft size={16} aria-hidden="true" /> 이전
          </button>
          {canGoNextWizardStep(stepCount, current) ? (
            hideNextOnSteps.includes(current) ? null : (
              <button
                type="button"
                className={buttonClass()}
                disabled={isNextDisabled?.(current) ?? false}
                onClick={() => onIndexChange(current + 1)}
              >
                다음 <ChevronRight size={16} aria-hidden="true" />
              </button>
            )
          ) : hideNextOnSteps.includes(current) ? null : (
            <button
              type="button"
              className={buttonClass()}
              disabled={isNextDisabled?.(current) ?? false}
              onClick={onComplete}
            >
              <Check size={16} aria-hidden="true" /> {completeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 첫 방문 3단계 스포트라이트 투어 — 한 번만, 건너뛰기 가능.             */
/* ------------------------------------------------------------------ */

export function ProductionSpotlightTour({
  storage = typeof localStorage !== "undefined" ? localStorage : undefined,
  onDone,
}: {
  readonly storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  readonly onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const step = PRODUCTION_HUB_TOUR_STEPS[clampWizardIndex(index, PRODUCTION_HUB_TOUR_STEPS.length)];

  useEffect(() => {
    try {
      if (shouldShowProductionTour(storage?.getItem(PRODUCTION_TOUR_STORAGE_KEY) ?? null)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [storage]);

  const close = (markSeen: boolean) => {
    if (markSeen) {
      try {
        storage?.setItem(PRODUCTION_TOUR_STORAGE_KEY, markProductionTourSeenValue());
      } catch {
        /* 저장 실패해도 투어는 닫는다 */
      }
    }
    setOpen(false);
    onDone?.();
  };

  if (!open || !step) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="production-tour-title"
      data-slot="production-spotlight-tour"
    >
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold tracking-widest text-accent">
            처음이신가요 · {index + 1}/{PRODUCTION_HUB_TOUR_STEPS.length}
          </p>
          <button
            type="button"
            onClick={() => close(true)}
            aria-label="투어 건너뛰기"
            className="grid min-h-11 min-w-11 place-items-center rounded-xl text-fg-3 hover:bg-raised hover:text-fg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <h2 id="production-tour-title" className="mt-2 text-xl font-bold">{step.title}</h2>
        <p className="mt-2 text-sm leading-7 text-fg-2">{step.body}</p>
        <div className="mt-4 flex items-center justify-center gap-2" aria-hidden="true">
          {PRODUCTION_HUB_TOUR_STEPS.map((item, i) => (
            <span key={item.id} className={cn("size-2 rounded-full", i === index ? "bg-accent" : "bg-line")} />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" className={buttonClass({ variant: "ghost" })} onClick={() => close(true)}>
            건너뛰기
          </button>
          {index < PRODUCTION_HUB_TOUR_STEPS.length - 1 ? (
            <button type="button" className={buttonClass()} onClick={() => setIndex(index + 1)}>
              다음 <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className={buttonClass()} onClick={() => close(true)}>
              <Check size={16} aria-hidden="true" /> 시작하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 함께 보는 사람 — 아바타 스택. "지금 보고 있음"을 먼저 보여준다.      */
/* ------------------------------------------------------------------ */

export function PresenceAvatarStack({
  members,
  max = 5,
  label = "함께 보는 사람",
}: {
  readonly members: readonly PresenceMember[];
  readonly max?: number;
  readonly label?: string;
}) {
  const { visible, overflowCount } = slicePresenceMembers(members, max);
  if (members.length === 0) return null;
  return (
    <div className="flex items-center gap-2" data-slot="presence-avatar-stack" aria-label={`${label}: ${members.length}명`}>
      <Users size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
      <div className="flex -space-x-2">
        {visible.map((member) => (
          <span
            key={member.id}
            title={`${member.name} · ${member.roleLabel}${member.active ? " · 지금 보고 있음" : ""}`}
            aria-label={`${member.name} (${member.roleLabel})${member.active ? ", 지금 보고 있음" : ""}`}
            className={cn(
              "grid size-8 place-items-center rounded-full border-2 border-card text-[0.6875rem] font-bold",
              presenceAvatarTone(member.id),
              member.active && "border-accent ring-2 ring-accent/40",
            )}
          >
            {presenceInitial(member.name)}
          </span>
        ))}
        {overflowCount > 0 ? (
          <span
            className="grid size-8 place-items-center rounded-full border-2 border-card bg-raised text-[0.6875rem] font-bold text-fg-2"
            aria-label={`그 외 ${overflowCount}명`}
          >
            +{overflowCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 빈 상태 가이드 — "지금 뭘 해야 하는지" + 원클릭 시작 버튼.           */
/* ------------------------------------------------------------------ */

export function ProductionGuideEmptyState({
  guideId,
  onAction,
  actionHref,
}: {
  readonly guideId: EmptyStateGuideId;
  readonly onAction?: () => void;
  readonly actionHref?: string;
}) {
  const guide = EMPTY_STATE_GUIDES[guideId];
  return (
    <section
      className="rounded-3xl border border-dashed border-line bg-card/60 p-6 text-center sm:p-8"
      data-slot="production-guide-empty-state"
      aria-label={guide.title}
    >
      <h3 className="text-lg font-bold">{guide.title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-fg-2">{guide.guide}</p>
      {actionHref ? (
        <a href={actionHref} className={cn(buttonClass(), "mt-4")}>
          {guide.actionLabel}
        </a>
      ) : (
        <button type="button" className={cn(buttonClass(), "mt-4")} onClick={onAction}>
          {guide.actionLabel}
        </button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 인라인 도움말 — 복잡한 UI마다 "이게 뭐예요?"를 바로 답한다.          */
/* ------------------------------------------------------------------ */

export function InlineHelp({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center" data-slot="inline-help">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label} 도움말`}
        className="grid min-h-11 min-w-11 place-items-center rounded-full text-fg-3 transition-colors hover:bg-raised hover:text-accent"
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-2xl border border-line bg-panel p-4 text-left text-xs leading-6 text-fg-2 shadow-xl"
        >
          <span className="mb-1 block font-bold text-fg">{label}</span>
          {children}
        </span>
      ) : null}
    </span>
  );
}
