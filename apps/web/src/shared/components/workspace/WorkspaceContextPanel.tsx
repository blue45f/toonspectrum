import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/shared/lib/i18n";

/** One modal inspector. Closing presentation never terminates a media session. */
export function WorkspaceContextPanel({ open, title, onClose, children, initialFocusRef }: {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const locale = useI18n((state) => state.lang);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const close = () => {
      if (!dialog.open) return;
      dialog.close();
      // React may replace the focused child before native focus restoration runs.
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      initialFocusRef?.current?.focus();
    } else if (!open) close();
    return close;
  }, [open, initialFocusRef]);
  return (
    <dialog ref={ref} className="workspace-inspector" aria-labelledby={headingId}
      data-space-interactive="true" data-app-tooltip-exclude="true" onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
      }} onKeyUp={(event) => event.stopPropagation()}>
      <header><h2 id={headingId}>{title}</h2>
        <button type="button" onClick={onClose} aria-label={locale.startsWith("ko") ? "패널 닫기" : "Close panel"}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="workspace-inspector-content">{children}</div>
    </dialog>
  );
}
