/**
 * 기능별 튜토리얼 허브 — 목록 + 단계 카드 + 따라 해보기.
 * StudioShortcutsHelp 와 같은 모달 계약(포커스·Esc·포털).
 */
import { BookOpen, Check, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  groupStudioFeatureTutorials,
  isTutorialCompleted,
  markTutorialCompleted,
  readTutorialProgress,
  STUDIO_FEATURE_TUTORIAL_BY_ID,
  STUDIO_FEATURE_TUTORIALS,
  tutorialCompletionRatio,
  writeTutorialProgress,
  type StudioFeatureTutorial,
  type StudioTutorialProgress,
  type StudioTutorialTryAction,
} from "./studio-feature-tutorials";

import { cn } from "@/lib/utils";

export type StudioFeatureTutorialHubProps = {
  open: boolean;
  onClose: () => void;
  /** 초기 선택 튜토리얼. 없으면 진행 상태 lastId 또는 첫 항목. */
  initialTutorialId?: string | null;
  /** 「따라 해보기」— 해당 도구/메뉴를 StudioPage 가 연다. */
  onTryAction?: (action: StudioTutorialTryAction) => void;
};

function resolveInitialId(preferred?: string | null, progress?: StudioTutorialProgress): string {
  if (preferred && STUDIO_FEATURE_TUTORIAL_BY_ID.has(preferred)) return preferred;
  if (progress?.lastId && STUDIO_FEATURE_TUTORIAL_BY_ID.has(progress.lastId)) return progress.lastId;
  return STUDIO_FEATURE_TUTORIALS[0]!.id;
}

export function StudioFeatureTutorialHub({
  open,
  onClose,
  initialTutorialId = null,
  onTryAction,
}: StudioFeatureTutorialHubProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeFromEffect = useEffectEvent(onClose);

  const [progress, setProgress] = useState<StudioTutorialProgress>(() => readTutorialProgress());
  const [activeId, setActiveId] = useState(() => resolveInitialId(initialTutorialId, readTutorialProgress()));
  const [stepIndex, setStepIndex] = useState(0);

  const active = STUDIO_FEATURE_TUTORIAL_BY_ID.get(activeId) ?? STUDIO_FEATURE_TUTORIALS[0]!;
  const steps = active.steps;
  const step = steps[Math.min(stepIndex, steps.length - 1)]!;
  const groups = groupStudioFeatureTutorials();
  const { done, total } = tutorialCompletionRatio(progress);
  const completed = isTutorialCompleted(progress, active.id);
  const isLastStep = stepIndex >= steps.length - 1;

  // open 시 초기 튜토리얼·진행 동기화
  useEffect(() => {
    if (!open) return;
    const nextProgress = readTutorialProgress();
    setProgress(nextProgress);
    const id = resolveInitialId(initialTutorialId, nextProgress);
    setActiveId(id);
    setStepIndex(0);
  }, [open, initialTutorialId]);

  // 모달 포커스·Esc·스크롤 잠금
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = globalThis.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeFromEffect();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      globalThis.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey, true);
      openerRef.current?.focus?.();
    };
  }, [open]);

  function selectTutorial(t: StudioFeatureTutorial) {
    setActiveId(t.id);
    setStepIndex(0);
    const next = { ...progress, lastId: t.id };
    setProgress(next);
    writeTutorialProgress(next);
  }

  function goNext() {
    if (!isLastStep) {
      setStepIndex((i) => i + 1);
      return;
    }
    const next = markTutorialCompleted(progress, active.id);
    setProgress(next);
    writeTutorialProgress(next);
  }

  function goPrev() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function handleTry() {
    if (!active.tryAction || !onTryAction) return;
    onTryAction(active.tryAction);
    onClose();
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="presentation"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[oklch(0.12_0.01_70_/_0.55)] p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-tutorial-title"
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-line/70 bg-panel shadow-2xl sm:rounded-2xl"
      >
        {/* header */}
        <div className="relative shrink-0 overflow-hidden border-b border-line/50 bg-gradient-to-br from-accent-soft/40 via-card/50 to-panel px-4 py-3">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-8 size-28 rounded-full bg-accent/10 blur-2xl"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
                <BookOpen className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 pt-0.5">
                <h2 id="studio-tutorial-title" className="text-[0.95rem] font-semibold tracking-tight text-fg">
                  기능 튜토리얼
                </h2>
                <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                  부담 없이 한 기능씩. {done}/{total}개 살펴봤어요.
                </p>
                <div
                  className="mt-2 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-canvas/70 ring-1 ring-line/40"
                  role="progressbar"
                  aria-valuenow={done}
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-label="튜토리얼 진행"
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                    style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-line/60 bg-card/70 text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="닫기"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        {/* body: list + detail */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav
            aria-label="기능 목록"
            className="shrink-0 overflow-y-auto border-b border-line/45 md:w-[13.5rem] md:border-b-0 md:border-r md:border-line/45"
          >
            <div className="space-y-2.5 p-2.5">
              {groups.map((group) => (
                <div key={group.category}>
                  <p className="mb-1 px-1.5 text-[0.6rem] font-semibold uppercase tracking-wider text-fg-3">
                    {group.category}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = item.id === active.id;
                      const isDone = isTutorialCompleted(progress, item.id);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => selectTutorial(item)}
                            aria-current={isActive ? "true" : undefined}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors duration-150",
                              isActive
                                ? "bg-accent-soft/70 text-fg ring-1 ring-accent/30"
                                : "text-fg-2 hover:bg-raised/80 hover:text-fg"
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-7 shrink-0 place-items-center rounded-lg text-[0.6rem] font-bold",
                                isActive ? "bg-accent/20 text-accent" : "bg-canvas/60 text-fg-3 ring-1 ring-line/40"
                              )}
                            >
                              {item.badge}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.72rem] font-semibold tracking-tight">
                                {item.title}
                              </span>
                            </span>
                            {isDone ? (
                              <Check className="size-3.5 shrink-0 text-good" aria-label="완료" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent-soft/60 px-2 py-0.5 text-[0.6rem] font-semibold text-accent ring-1 ring-accent/20">
                  {active.category}
                </span>
                {completed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-[0.6rem] font-semibold text-good ring-1 ring-good/25">
                    <Check className="size-3" aria-hidden />
                    살펴봄
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 text-base font-semibold tracking-tight text-fg">{active.title}</h3>
              <p className="mt-1 text-[0.75rem] leading-relaxed text-fg-3">{active.summary}</p>

              {/* step dots */}
              <div className="mt-4 flex items-center gap-1.5" aria-label={`단계 ${stepIndex + 1} / ${steps.length}`}>
                {steps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setStepIndex(i)}
                    aria-label={`${i + 1}단계`}
                    aria-current={i === stepIndex ? "step" : undefined}
                    className={cn(
                      "h-1.5 rounded-full transition-[width,background] duration-200 ease-out",
                      i === stepIndex ? "w-6 bg-accent" : i < stepIndex ? "w-3 bg-accent/45" : "w-3 bg-line"
                    )}
                  />
                ))}
              </div>

              <article
                key={`${active.id}-${stepIndex}`}
                className="mt-3 rounded-2xl border border-line/50 bg-gradient-to-b from-card/90 to-canvas/25 p-3.5 shadow-[inset_0_1px_0_oklch(0.95_0.02_85_/_0.05)]"
              >
                <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-fg-3">
                  {stepIndex + 1} / {steps.length}
                </p>
                <h4 className="mt-1 text-[0.92rem] font-semibold tracking-tight text-fg">{step.title}</h4>
                <p className="mt-1.5 text-[0.8rem] leading-relaxed text-fg-2">{step.body}</p>
                {step.tip ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-accent-soft/35 px-2.5 py-2 text-[0.7rem] leading-snug text-fg-2 ring-1 ring-accent/15">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                    <span>{step.tip}</span>
                  </p>
                ) : null}
              </article>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line/50 bg-canvas/20 px-3 py-2.5">
              <button
                type="button"
                onClick={goPrev}
                disabled={stepIndex === 0}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1 rounded-xl border px-3 text-[0.75rem] font-semibold transition-colors",
                  stepIndex === 0
                    ? "cursor-not-allowed border-line/40 text-fg-3"
                    : "border-line/60 bg-card text-fg-2 hover:bg-raised"
                )}
              >
                <ChevronLeft className="size-4" aria-hidden />
                이전
              </button>

              <div className="flex flex-wrap items-center gap-1.5">
                {active.tryAction && onTryAction ? (
                  <button
                    type="button"
                    onClick={handleTry}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft/50 px-3 text-[0.75rem] font-semibold text-accent transition-colors hover:bg-accent-soft"
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    {active.tryLabel ?? "따라 해보기"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-accent px-3.5 text-[0.75rem] font-semibold text-on-accent transition-opacity hover:opacity-95"
                >
                  {isLastStep ? (completed ? "완료됨" : "완료로 표시") : "다음"}
                  {!isLastStep ? <ChevronRight className="size-4" aria-hidden /> : null}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
