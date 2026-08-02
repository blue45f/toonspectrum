/**
 * Modal shell for Hybrid 2D·3D DCC workspace panel.
 */

import { X } from "lucide-react";
import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";
import { activateStudioModalSheet } from "./useStudioModalSheet";

import type { StudioHybridDccBg3dHandoffResult } from "./studio-hybrid-dcc-bg3d-handoff";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import type { StudioHybridDccPersistenceStatus } from "./StudioHybridDccPanel";

export interface StudioHybridDccDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onOpenInBackground3D?: (result: StudioHybridDccBg3dHandoffResult) => void;
  readonly initialWorkspace?: StudioHybridDccWorkspace;
  readonly workspaceDocumentId: string;
  readonly onWorkspaceChange: (workspace: StudioHybridDccWorkspace) => void;
  readonly persistenceStatus?: StudioHybridDccPersistenceStatus;
  readonly loading?: boolean;
}

export function StudioHybridDccDialog({
  open,
  onClose,
  onOpenInBackground3D,
  initialWorkspace,
  workspaceDocumentId,
  onWorkspaceChange,
  persistenceStatus,
  loading = false,
}: StudioHybridDccDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeFromEffect = useEffectEvent(onClose);

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const ownerDocument = dialog.ownerDocument;
    const opener = ownerDocument.activeElement instanceof HTMLElement
      ? ownerDocument.activeElement
      : null;
    const previousBodyOverflow = ownerDocument.body.style.overflow;
    const previousRootOverflow = ownerDocument.documentElement.style.overflow;
    ownerDocument.body.style.overflow = "hidden";
    ownerDocument.documentElement.style.overflow = "hidden";

    const deactivateModal = activateStudioModalSheet({
      dialog,
      document: ownerDocument,
      initialFocus: closeButtonRef.current,
      onDismiss: closeFromEffect,
      returnFocus: opener,
      root: ownerDocument.body,
    });

    return () => {
      deactivateModal();
      ownerDocument.body.style.overflow = previousBodyOverflow;
      ownerDocument.documentElement.style.overflow = previousRootOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      data-studio-hybrid-dcc-dialog="true"
      className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-label="Hybrid DCC 배경 닫기"
        aria-hidden="true"
        data-studio-modal-backdrop="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-canvas/80 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-hybrid-dcc-title"
        data-studio-modal-owner="hybrid-dcc"
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden border border-line-strong bg-panel shadow-2xl sm:h-[min(94dvh,1000px)] sm:w-[min(96vw,1600px)] sm:rounded-2xl"
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line bg-panel/95 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h2
              id="studio-hybrid-dcc-title"
              className="truncate text-sm font-semibold tracking-tight"
            >
              ToonSpectrum 전문 3D 제작
            </h2>
            <p className="truncate text-[11px] text-fg-3">
              편집 가능한 원본 메시 · 정밀 CAD·솔리드 · 웹툰 컷·선화 전달
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-fg-2 hover:bg-raised"
            aria-label="닫기"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div
              className="grid h-full place-items-center bg-canvas/35 p-6 text-center"
              role="status"
              aria-live="polite"
              data-studio-hybrid-dcc-recovery-gate="true"
            >
              <div className="max-w-sm rounded-2xl border border-line bg-panel px-6 py-5 shadow-xl">
                <p className="text-sm font-semibold text-fg">3D 작업 복구본을 확인하는 중입니다.</p>
                <p className="mt-1 text-xs leading-relaxed text-fg-3">
                  이전 작업을 안전하게 불러온 뒤 편집기를 엽니다. 닫아도 기존 작업은 변경되지 않습니다.
                </p>
              </div>
            </div>
          ) : (
            <StudioHybridDccPanel
              initialWorkspace={initialWorkspace}
              workspaceDocumentId={workspaceDocumentId}
              onWorkspaceChange={onWorkspaceChange}
              onOpenInBackground3D={onOpenInBackground3D}
              persistenceStatus={persistenceStatus}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
