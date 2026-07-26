import { useEffect } from "react";
import { createPortal } from "react-dom";

import { StudioAnimaticTimelinePanel } from "./StudioAnimaticTimelinePanel";

import type { StudioAnimaticPageLike } from "./studio-animatic-timeline";

export interface StudioAnimaticTimelineDialogProps {
  readonly open: boolean;
  readonly workScope: string;
  readonly pages: readonly StudioAnimaticPageLike[];
  readonly reducedMotion?: boolean;
  readonly onClose: () => void;
}

export function StudioAnimaticTimelineDialog({
  open,
  workScope,
  pages,
  reducedMotion,
  onClose,
}: StudioAnimaticTimelineDialogProps) {
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
      data-studio-animatic-dialog="true"
      className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-label="애니매틱 배경 닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-canvas/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="웹툰 애니매틱"
        className="relative z-10 flex max-h-[100dvh] w-full max-w-6xl"
      >
        <StudioAnimaticTimelinePanel
          key={workScope}
          workScope={workScope}
          pages={pages}
          reducedMotion={reducedMotion}
          onClose={onClose}
          className="max-h-[100dvh] rounded-b-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-b-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}
