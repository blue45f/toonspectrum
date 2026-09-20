import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/shared/lib/i18n";

/** One modal inspector. Closing presentation never terminates a media session. */
export function WorkspaceContextPanel({ open, title, onClose, children }: {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const locale = useI18n((state) => state.lang);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return (
    <dialog ref={ref} className="workspace-inspector" aria-labelledby={headingId}
      data-space-interactive="true" data-app-tooltip-exclude="true" onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
      <header><h2 id={headingId}>{title}</h2>
        <button type="button" onClick={onClose} aria-label={locale.startsWith("ko") ? "패널 닫기" : "Close panel"}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="workspace-inspector-content">{children}</div>
    </dialog>
  );
}
