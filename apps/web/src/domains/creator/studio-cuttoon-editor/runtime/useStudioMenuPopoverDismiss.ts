import { useEffect, type RefObject } from "react";

interface StudioMenuPopoverDismissOptions {
  readonly open: boolean;
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly panelSelector: string;
  readonly onDismiss: () => void;
}

/** Menubar popovers share dismissal while their lazy panels may mount or change in a portal. */
export function useStudioMenuPopoverDismiss({
  open, triggerRef, panelSelector, onDismiss,
}: StudioMenuPopoverDismissOptions): void {
  useEffect(() => {
    const ownerDocument = triggerRef.current?.ownerDocument;
    if (!open || !ownerDocument) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || triggerRef.current?.contains(target)) return;
      if ((target as Element).closest?.(panelSelector)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const modal = (event.target as Element | null)?.closest?.('[aria-modal="true"]');
      if (modal && !modal.matches(panelSelector)) return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      triggerRef.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
    };

    // Bubble after controls can consume Escape, before the editor's window shortcuts run.
    ownerDocument.addEventListener("keydown", onKeyDown);
    ownerDocument.addEventListener("pointerdown", onPointerDown);
    return () => {
      ownerDocument.removeEventListener("keydown", onKeyDown);
      ownerDocument.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, triggerRef, panelSelector, onDismiss]);
}
