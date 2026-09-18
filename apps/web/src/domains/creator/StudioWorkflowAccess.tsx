import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { BookOpen, ChevronDown, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { requestStudioCommandSearch } from "./studio-help-center-channel";
import {
  STUDIO_GETTING_STARTED_TASKS,
  studioGettingStartedTaskDisabled,
  type StudioGettingStartedAction,
} from "./studio-toolbar-disclosure";

export interface StudioWorkflowAccessProps {
  expanded: boolean;
  canCollapse: boolean;
  controlsId: string;
  onToggleExpanded: () => void;
  lockedReason?: string;
  onTask: (action: StudioGettingStartedAction) => void;
  onBeforeOpen: () => void;
}

const buttonClass = "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent-soft/30 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

/** A task-first entry point; all editing remains in the editor's canonical handlers. */
export function StudioWorkflowAccess({
  expanded,
  canCollapse,
  controlsId,
  onToggleExpanded,
  lockedReason,
  onTask,
  onBeforeOpen,
}: StudioWorkflowAccessProps) {
  const titleId = useId();
  const descriptionId = useId();
  const lockId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("");

  const closeGuide = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // The dialog remains a semantic dialog, not a button or presentation-only surface.
  // Native lifecycle listeners also protect the explicitly non-modal embedded-browser fallback.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!dialog.open) return;
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        closeGuide();
      }
    };
    const handleCancel = (event: Event) => {
      event.preventDefault();
      closeGuide();
    };
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog && dialog.open) closeGuide();
    };
    dialog.addEventListener("keydown", handleKeyDown);
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [closeGuide]);

  const openGuide = () => {
    onBeforeOpen();
    setNotice("");
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") {
      dialog.setAttribute("aria-modal", "true");
      dialog.showModal();
    } else {
      // Older embedded browsers get an honest non-modal dialog, not a fake focus trap.
      dialog.setAttribute("aria-modal", "false");
      dialog.setAttribute("open", "");
    }
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "스튜디오 시작과 도구 찾기")}>
        <button ref={triggerRef} type="button" onClick={openGuide} className={buttonClass} aria-haspopup="dialog">
          <BookOpen size={16} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "시작 안내")}</button>
        <button
          type="button"
          className={buttonClass}
          title={translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "기능·설정 찾기 (⌘K / Ctrl+K)")}
          onClick={() => {
            onBeforeOpen();
            setNotice(requestStudioCommandSearch({ scope: "all" })
              ? ""
              : "검색이 아직 준비되지 않았어요. 다시 누르거나 시작 안내를 이용해 주세요.");
          }}
        >
          <Search size={16} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "도구 찾기")}</button>
        {canCollapse ? (
          <button
            type="button"
            className={buttonClass}
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={controlsId}
            data-studio-toolbar-disclosure="true"
          >
            {expanded ? translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "기본 도구만") : translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "더 많은 도구")}
            <ChevronDown size={16} aria-hidden className={expanded ? translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "en", "rotate-180") : ""} />
          </button>
        ) : null}
      </div>
      {notice ? <p role="status" className="max-w-64 shrink-0 whitespace-normal text-xs text-fg-2">{notice}</p> : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed inset-0 z-[100] m-auto max-h-[85dvh] w-[42rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel p-0 text-fg shadow-2xl backdrop:bg-black/60"
      >
        <div className="space-y-5 bg-gradient-to-br from-accent-soft/30 to-transparent p-5 sm:p-7">
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold text-accent">{translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "처음부터 모든 도구를 알 필요는 없어요")}</p>
              <h2 id={titleId} className="text-xl font-bold">{translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "무엇부터 해볼까요?")}</h2>
              <p id={descriptionId} className="mt-2 text-sm text-fg-2">{translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "원하는 작업 하나만 골라 시작하세요. 이 안내를 여는 것만으로 작품이 바뀌지는 않아요.")}</p>
            </div>
            <button type="button" onClick={closeGuide} className={buttonClass} aria-label={translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "시작 안내 닫기")}><X size={18} aria-hidden /></button>
          </header>
          {lockedReason ? <p id={lockId} role="status" className="rounded-lg border border-line bg-card p-3 text-sm text-fg-2">{lockedReason} {translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "미리보기와 사용 안내는 계속 이용할 수 있어요.")}</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STUDIO_GETTING_STARTED_TASKS.map((task, index) => {
              const disabled = studioGettingStartedTaskDisabled(task, Boolean(lockedReason));
              return (
                <button
                  key={task.id}
                  type="button"
                  disabled={disabled}
                  aria-describedby={disabled ? lockId : undefined}
                  onClick={() => {
                    if (studioGettingStartedTaskDisabled(task, Boolean(lockedReason))) return;
                    closeGuide();
                    try { onTask(task.id); }
                    catch { setNotice("도구를 열지 못했어요. 작품 상태를 확인하고 다시 시도해 주세요."); }
                  }}
                  className="group flex min-h-24 items-start gap-3 rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-accent/60 hover:bg-accent-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                >
                  <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-bold text-accent">{index + 1}</span>
                  <span><span className="block text-sm font-semibold">{task.label}</span><span className="mt-1 block text-xs leading-relaxed text-fg-2">{task.description}</span></span>
                </button>
              );
            })}
          </div>
          <p className="rounded-lg bg-card p-3 text-xs leading-relaxed text-fg-2">{translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", "잘못 눌렀다면 상단의 실행 취소를 이용하세요. 필요한 기능이 보이지 않을 때는 ‘도구 찾기’에서 검색하세요.")}{canCollapse ? translateCurrentStaticSourceText("domains.creator.StudioWorkflowAccess", "ko", " ‘더 많은 도구’를 펼쳐서 찾아볼 수도 있어요.") : ""}</p>
        </div>
      </dialog>
    </>
  );
}
