import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, useEffectEvent, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { activateStudioModalSheet } from "../useStudioModalSheet";

import { StudioHybridDccHeading } from "./StudioHybridDccHeading";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

// 게이트는 무거운 3D 묶음을 기다리는 동안 보이는 화면이다. 그 시간에 무엇을 하는 도구인지
// 읽을 수 있게 작은 안내 조각만 따로 불러온다(게이트 자체는 가볍게 유지).
const LazyStudioHybridDccIntro = lazy(() =>
  import("./StudioHybridDccIntro").then(({ StudioHybridDccIntro }) => ({
    default: StudioHybridDccIntro,
  }))
);

export interface StudioHybridDccRouteGateProps {
  readonly detail: string;
  readonly label: string;
  readonly onClose: () => void;
  readonly returnFocus?: HTMLElement | null;
}

/**
 * Eager route shell used before permission, hydration, or the heavy DCC chunk is ready.
 * It owns the same modal/focus boundary as the final workspace, so a slow chunk cannot leave
 * the underlying canvas keyboard-active while the URL already belongs to DCC.
 */
export function StudioHybridDccRouteGate({
  detail,
  label,
  onClose,
  returnFocus = null,
}: StudioHybridDccRouteGateProps) {
  const bt = useBilingual("StudioHybridDccRouteGate");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeFromEffect = useEffectEvent(onClose);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof document === "undefined") return;
    const ownerDocument = dialog.ownerDocument;
    const previousBodyOverflow = ownerDocument.body.style.overflow;
    const previousRootOverflow = ownerDocument.documentElement.style.overflow;
    ownerDocument.body.style.overflow = "hidden";
    ownerDocument.documentElement.style.overflow = "hidden";
    const deactivate = activateStudioModalSheet({
      dialog,
      document: ownerDocument,
      fallbackReturnFocus: ownerDocument.getElementById("main-content"),
      initialFocus: closeButtonRef.current,
      onDismiss: closeFromEffect,
      returnFocus,
      root: ownerDocument.body,
    });
    return () => {
      deactivate();
      ownerDocument.body.style.overflow = previousBodyOverflow;
      ownerDocument.documentElement.style.overflow = previousRootOverflow;
    };
  }, [returnFocus]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-stretch justify-stretch bg-panel"
      data-studio-hybrid-dcc-route-gate="true"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-hybrid-dcc-route-gate-title"
        data-studio-modal-owner="hybrid-dcc-route-gate"
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-panel"
      >
        <header className="flex min-h-14 items-center gap-2 border-b border-line bg-panel px-2 py-2 sm:px-3">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={bt("캔버스로 돌아가기", "Back to canvas")}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            <span className="hidden sm:inline">{bt("캔버스", "Canvas")}</span>
          </button>
          <StudioHybridDccHeading titleId="studio-hybrid-dcc-route-gate-title" />
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas/35 p-3 sm:p-4">
          <div
            className="mx-auto max-w-xl rounded-2xl border border-line bg-panel px-5 py-4 text-center shadow-xl"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-semibold text-fg">{label}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">{detail}</p>
          </div>
          <Suspense fallback={null}>
            <LazyStudioHybridDccIntro />
          </Suspense>
        </div>
      </div>
    </div>,
    document.body,
  );
}
