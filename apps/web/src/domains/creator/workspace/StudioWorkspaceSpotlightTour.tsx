import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  WORKSPACE_TOUR_STEPS,
  createWorkspaceTourState,
  readWorkspaceTourCompleted,
  workspaceTourReducer,
  workspaceTourStep,
  workspaceTourTargetSelector,
  writeWorkspaceTourCompleted,
  type WorkspaceTourStep,
} from "./studio-workspace-tour-state";

const TOUR_START_DELAY_MS = 700;
const RING_PADDING = 10;
const TOOLTIP_GAP = 16;

function measureTourTarget(step: WorkspaceTourStep): DOMRect | null {
  if (typeof document === "undefined") return null;
  const element = document.querySelector(workspaceTourTargetSelector(step));
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function tourCopy(bt: (ko: string, en: string) => string, step: WorkspaceTourStep): { title: string; body: string } {
  switch (step) {
    case "continue":
      return {
        title: bt("작업을 이어가세요", "Pick up where you left off"),
        body: bt(
          "마지막으로 펜을 들었던 원고로 바로 돌아갑니다. 지금 이어할 수 있는 작업이 여기 있습니다.",
          "Jump straight back to the manuscript you last touched. Your continuing work is right here.",
        ),
      };
    case "quick-actions":
      return {
        title: bt("빠른 작업으로 원고를 관리하세요", "Manage manuscripts with quick actions"),
        body: bt(
          "원고 검수와 진행 확인, 협업 공간 입장까지 자주 쓰는 작업을 바로 실행하세요.",
          "Run the tasks you use most — review manuscripts, check production, enter the collaboration space.",
        ),
      };
    case "tools":
      return {
        title: bt("도구는 여기서 꺼내세요", "Grab your tools here"),
        body: bt(
          "소재 라이브러리부터 가상스튜디오, 환경 설정까지 창작 도구가 모여 있습니다.",
          "Your creative tools live here — the materials library, your virtual studio, and settings.",
        ),
      };
  }
}

/**
 * First-visit spotlight tour over the workspace home: continue CTA →
 * quick actions → tools menu. Remembers completion in localStorage and
 * honours reduced motion by snapping the spotlight instead of animating it.
 */
export function StudioWorkspaceSpotlightTour({ ready }: { readonly ready: boolean }) {
  const bt = useBilingual("StudioWorkspaceSpotlightTour");
  const reducedMotion = useReducedMotion();
  const [state, dispatch] = useReducer(
    workspaceTourReducer,
    undefined,
    () => createWorkspaceTourState(
      typeof window === "undefined" ? true : readWorkspaceTourCompleted(window.localStorage),
    ),
  );
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const active = state.status === "active";
  const step = workspaceTourStep(state);
  const copy = tourCopy(bt, step);
  const isLast = state.stepIndex >= WORKSPACE_TOUR_STEPS.length - 1;
  const instant = reducedMotion ? { duration: 0 } : undefined;

  useEffect(() => {
    if (!ready || state.status !== "pending" || typeof window === "undefined") return;
    const timer = window.setTimeout(() => dispatch({ type: "start" }), TOUR_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, state.status]);

  useEffect(() => {
    if (state.status === "done" && typeof window !== "undefined") {
      writeWorkspaceTourCompleted(window.localStorage);
    }
  }, [state.status]);

  useLayoutEffect(() => {
    if (!active || typeof window === "undefined") return;
    const update = () => setRect(measureTourTarget(step));
    update();
    const retry = window.setTimeout(update, 400);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  useEffect(() => {
    if (active && rect) cardRef.current?.focus({ preventScroll: true });
  }, [active, rect, step]);

  if (typeof window === "undefined") return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const ring = rect ? {
    top: Math.max(4, rect.top - RING_PADDING),
    left: Math.max(4, rect.left - RING_PADDING),
    width: rect.width + RING_PADDING * 2,
    height: rect.height + RING_PADDING * 2,
  } : null;
  const cardWidth = Math.min(336, viewportWidth - 32);
  let cardTop = rect ? rect.bottom + TOOLTIP_GAP : viewportHeight / 2;
  let cardLeft = rect ? Math.min(Math.max(16, rect.left), Math.max(16, viewportWidth - cardWidth - 16)) : 16;
  if (rect && cardTop + 280 > viewportHeight) cardTop = Math.max(16, rect.top - 296);
  cardLeft = Math.min(cardLeft, Math.max(16, viewportWidth - cardWidth - 16));

  return (
    <AnimatePresence>
      {active && ring ? (
        <>
          <motion.div
            key="tour-ring"
            className="workspace-tour-ring"
            aria-hidden="true"
            style={reducedMotion
              ? { top: ring.top, left: ring.left, width: ring.width, height: ring.height }
              : undefined}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.94 }}
            animate={reducedMotion
              ? { opacity: 1 }
              : { opacity: 1, scale: 1, top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
            transition={instant ?? { type: "spring", stiffness: 260, damping: 28 }}
          />
          <motion.div
            key="tour-card"
            ref={cardRef}
            className="workspace-tour-card"
            role="dialog"
            aria-label={bt("스포트라이트 투어", "Spotlight tour")}
            tabIndex={-1}
            style={{ top: cardTop, left: cardLeft, width: cardWidth }}
            initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 10, scale: 0.97 }}
            transition={instant ?? { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={(event) => {
              if (event.key === "Escape") dispatch({ type: "skip" });
            }}
          >
            <p className="workspace-tour-eyebrow">
              <span>{bt("스포트라이트 투어", "Spotlight tour")}</span>
              <span className="workspace-tour-step" aria-label={bt("투어 진행 단계", "Tour progress")}>
                {state.stepIndex + 1} / {WORKSPACE_TOUR_STEPS.length}
              </span>
            </p>
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
            <div className="workspace-tour-actions">
              <button type="button" className="workspace-tour-skip" onClick={() => dispatch({ type: "skip" })}>
                {bt("건너뛰기", "Skip")}
              </button>
              {state.stepIndex > 0 ? (
                <button type="button" className="workspace-tour-back" onClick={() => dispatch({ type: "back" })}>
                  {bt("이전", "Back")}
                </button>
              ) : null}
              <button type="button" className="workspace-tour-next" onClick={() => dispatch({ type: "next" })}>
                {isLast ? bt("투어 마치기", "Finish tour") : bt("다음", "Next")}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
