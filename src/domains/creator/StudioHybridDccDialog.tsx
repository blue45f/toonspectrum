/**
 * Modal shell for Hybrid 2D·3D DCC workspace panel.
 */

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";

export interface StudioHybridDccDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function StudioHybridDccDialog({ open, onClose }: StudioHybridDccDialogProps) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-studio-hybrid-dcc-dialog="true"
      className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-label="Hybrid DCC 배경 닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-canvas/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hybrid 2D·3D DCC"
        className="relative z-10 flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-line-strong bg-panel shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="text-sm font-semibold">Hybrid 2D·3D DCC</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-fg-2 hover:bg-raised"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StudioHybridDccPanel />
        </div>
      </div>
    </div>,
    document.body,
  );
}
