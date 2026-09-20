import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/shared/lib/i18n";

const DESKTOP_INSPECTOR_QUERY = "(min-width: 1280px)";
function subscribeDesktopInspector(notify: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DESKTOP_INSPECTOR_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
function desktopInspector() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(DESKTOP_INSPECTOR_QUERY).matches;
}
const serverDesktopInspector = () => false;

/** Consent remains modal; opt-in desktop inspectors do not make the workspace inert. */
export function WorkspaceContextPanel({ open, title, onClose, children, initialFocusRef, presentation = "modal" }: {
  readonly presentation?: "modal" | "adaptive";
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const desktop = useSyncExternalStore(subscribeDesktopInspector, desktopInspector, serverDesktopInspector);
  const nonModal = presentation === "adaptive" && desktop;
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const locale = useI18n((state) => state.lang);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const close = () => {
      if (!dialog.open) return;
      const shouldRestore = !nonModal || dialog.contains(document.activeElement) || document.activeElement === document.body;
      dialog.close();
      // React may replace the focused child before native focus restoration runs.
      const target = returnFocusRef.current;
      if (shouldRestore && target?.isConnected) target.focus({ preventScroll: true });
    };
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (nonModal) dialog.show(); else dialog.showModal();
      initialFocusRef?.current?.focus();
    } else if (!open) close();
    return close;
  }, [open, initialFocusRef, nonModal]);
  return (
    <dialog ref={ref} className="workspace-inspector" aria-labelledby={headingId} aria-modal={nonModal ? false : true} data-presentation={nonModal ? "nonmodal" : "modal"}
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
