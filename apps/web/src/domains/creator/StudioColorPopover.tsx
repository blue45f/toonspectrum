import { revealStudioColorFocusedControl } from "./color/studio-color-focus-visibility";
import { Pin, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StudioColorEditor } from "./color/StudioColorEditor";
import { resolveStudioColorSurfacePosition } from "./color/studio-color-surface-position";
import { useStudioColorTargetKey } from "./color/StudioColorWorkspaceContext";
import { useStudioColorSession } from "./color/useStudioColorSession";
import { studioColorPopoverTriggerHint, type StudioColorPopoverPurpose } from "./studio-color-popover-hints";
import type { StudioRecentColorsStatus } from "./studio-recent-colors-bridge";
import { StudioColorTrigger, type StudioColorTriggerVariant } from "./StudioColorTrigger";
import { StudioToolHintTarget } from "./StudioToolHint";
import { activateStudioModalSheet } from "./useStudioModalSheet";
import { cx } from "@/shared/lib/cx";

/** Legacy tab ids remain valid; the editor groups them under Select / Palettes / Harmony. */
export type StudioColorPopoverTab = "quick" | "palettes" | "wheel" | "harmonies" | "cel-shade" | "sliders";
export type StudioColorPopoverProps = {
  value: string;
  onChange: (color: string) => void;
  recentColors: readonly string[];
  documentColors?: readonly string[];
  onUseColor?: (color: string) => void;
  onPreviewColor?: (color: string) => void;
  onCommitColor?: (color: string) => void;
  onCancelColor?: (color: string) => void;
  onInteractionEnd?: () => void;
  onRequestCanvasEyedropper?: () => void;
  label?: string;
  purpose?: StudioColorPopoverPurpose;
  className?: string;
  initialOpen?: boolean;
  initialTab?: StudioColorPopoverTab;
  triggerVariant?: StudioColorTriggerVariant;
  triggerNone?: boolean;
  triggerMixed?: boolean;
  disabled?: boolean;
  controlId?: string;
  targetKey?: string;
  /** Return true when an already pinned editor accepted this request. */
  onRequestOpen?: () => boolean;
  onBeforeOpen?: () => void;
  onPinToWorkspace?: () => void;
  historyStatus?: StudioRecentColorsStatus;
  onRetryHistory?: () => void;
};

export function StudioColorPopover({ value, onChange, recentColors, documentColors = [],
  onUseColor, onPreviewColor, onCommitColor, onCancelColor, onInteractionEnd, onRequestCanvasEyedropper,
  label = "색상 선택", purpose = "generic", className, initialOpen = false, initialTab = "quick",
  triggerVariant = "swatch", triggerNone = false, triggerMixed = false, disabled = false,
  controlId, targetKey: explicitTarget, onRequestOpen, onBeforeOpen, onPinToWorkspace, historyStatus, onRetryHistory,
}: StudioColorPopoverProps) {
  const [open, setOpen] = useState(initialOpen);
  const targetKey = useStudioColorTargetKey(purpose, controlId, explicitTarget ?? label);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const popupId = `studio-color-${useId().replaceAll(":", "")}`;
  const [position, setPosition] = useState(() => resolveStudioColorSurfacePosition(
    { left: 8, right: 40, top: 8, bottom: 40 }, { width: globalThis.innerWidth || 390, height: globalThis.innerHeight || 700 }, 560));
  const { session, message, begin, change, commit, cancel } = useStudioColorSession({
    value, targetKey, disabled,
    onCommit: (color) => {
      // Existing preview transactions own object Undo. Invoke them once, only at Apply.
      if (onPreviewColor) onPreviewColor(color); else onChange(color);
      onCommitColor?.(color); onUseColor?.(color); onInteractionEnd?.();
    },
    onCancel: onCancelColor,
    onInvalidated: () => setOpen(false),
  });
  const restoreFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const other = document.querySelector('[data-studio-color-popover="true"]');
      if (other && other !== popupRef.current) return;
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    });
  }, []);
  const finish = useCallback((restore = true): boolean => {
    if (!commit()) {
      popupRef.current?.querySelector<HTMLInputElement>('[data-studio-color-hex]')?.focus();
      return false;
    }
    setOpen(false); if (restore) restoreFocus(); return true;
  }, [commit, restoreFocus]);
  const dismiss = useCallback(() => { cancel(); setOpen(false); restoreFocus(); }, [cancel, restoreFocus]);
  useLayoutEffect(() => { if (open) begin(); }, [open, begin]);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const popup = popupRef.current;
      if (!anchor || !popup) return;
      const viewport = globalThis.visualViewport;
      const body = popup.querySelector<HTMLElement>('[data-studio-color-scroll]');
      const natural = (body?.scrollHeight ?? popup.scrollHeight) + 120;
      const next = resolveStudioColorSurfacePosition(anchor, {
        width: viewport?.width ?? (globalThis.innerWidth || 390), height: viewport?.height ?? (globalThis.innerHeight || 700),
        left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
      }, natural || 560);
      setPosition((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    if (popupRef.current) observer?.observe(popupRef.current);
    const body = popupRef.current?.querySelector<HTMLElement>('[data-studio-color-scroll]');
    if (body) observer?.observe(body);
    const content = popupRef.current?.querySelector<HTMLElement>('[data-studio-color-editor]');
    if (content) observer?.observe(content);
    globalThis.addEventListener("resize", schedule);
    globalThis.addEventListener("scroll", schedule, true);
    globalThis.visualViewport?.addEventListener("resize", schedule);
    globalThis.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect();
      globalThis.removeEventListener("resize", schedule); globalThis.removeEventListener("scroll", schedule, true);
      globalThis.visualViewport?.removeEventListener("resize", schedule); globalThis.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) revealStudioColorFocusedControl(popupRef.current);
  }, [open, position]);

  useLayoutEffect(() => {
    const dialog = popupRef.current;
    if (!open || !position.sheet || !dialog) return;
    return activateStudioModalSheet({ dialog, document: dialog.ownerDocument, root: dialog.ownerDocument.body,
      initialFocus: dialog, returnFocus: triggerRef.current, onDismiss: dismiss });
  }, [open, position.sheet, dismiss]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || portalRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      event.preventDefault(); event.stopPropagation();
      finish(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229 || event.key !== "Escape") return;
      const modal = event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (modal && modal !== popupRef.current) return;
      event.preventDefault(); event.stopPropagation(); dismiss();
    };
    const onFocus = (event: FocusEvent) => {
      if (position.sheet) return;
      const target = event.target;
      if (!(target instanceof Node) || portalRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      finish(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    const frame = requestAnimationFrame(() => {
      if (!position.sheet) popupRef.current?.querySelector<HTMLInputElement>('[data-studio-color-hex]')?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", onKey); document.removeEventListener("focusin", onFocus);
    };
  }, [open, position.sheet, finish, dismiss]);
  return <div className={cx("relative inline-block", className)}>
    <StudioToolHintTarget hint={studioColorPopoverTriggerHint(label, purpose)} preferredSide="bottom">
      <StudioColorTrigger ref={triggerRef} value={value} label={label} variant={triggerVariant}
        expanded={open} controls={open ? popupId : undefined} disabled={disabled}
        isNone={triggerNone} mixed={triggerMixed} controlId={controlId}
        onClick={() => {
          if (open) { finish(); return; }
          if (onRequestOpen?.()) return;
          onBeforeOpen?.(); setOpen(true);
        }} />
    </StudioToolHintTarget>
    {open && typeof document !== "undefined" ? createPortal(
      <div ref={portalRef} data-studio-color-surface-root="true">
        <button type="button" tabIndex={-1} aria-hidden="true" data-studio-modal-backdrop="true"
          data-studio-color-backdrop="true" className="fixed inset-0 z-[179] cursor-default bg-transparent"
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); finish(false); }}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} />
        <div ref={popupRef} id={popupId} role="dialog" aria-modal={position.sheet} aria-label={`${label} 선택`}
          tabIndex={-1} data-studio-color-popover="true" data-layout={position.sheet ? "sheet" : "popover"}
          data-studio-shortcut-boundary="true"
          className="fixed z-[180] flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel text-fg shadow-xl"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, height: position.sheet ? position.maxHeight : undefined }}>
          <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
            <h2 className="min-w-0 text-sm font-semibold">{label} 편집</h2>
            <div className="flex items-center gap-1">
              {onPinToWorkspace && !position.sheet ? <button type="button" aria-label="색상 패널 고정"
                className="grid size-11 place-items-center rounded-lg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => { if (finish(false)) onPinToWorkspace(); }}><Pin size={17} aria-hidden /></button> : null}
              <button type="button" data-studio-color-cancel="true" aria-label="색상 선택 취소"
                className="grid size-11 place-items-center rounded-lg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
                onClick={dismiss}><X size={18} aria-hidden /></button>
            </div>
          </header>
          <div data-studio-color-scroll="true" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <StudioColorEditor key={targetKey} session={session} onChange={change}
              onGestureCommit={() => undefined} onApplyRequest={() => { finish(); }} onCancelRequest={dismiss}
              recentColors={recentColors} documentColors={documentColors} initialView={initialTab}
              compact={position.compact} error={message} historyStatus={historyStatus} onRetryHistory={onRetryHistory}
              onRequestCanvasEyedropper={onRequestCanvasEyedropper ? () => {
                if (finish(false)) onRequestCanvasEyedropper();
              } : undefined} />
          </div>
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-panel p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button type="button" data-studio-color-cancel="true" onClick={dismiss}
              className="min-h-11 rounded-lg border border-line px-4 text-sm focus-visible:ring-2 focus-visible:ring-accent">취소</button>
            <button type="button" aria-label="색상 적용" aria-disabled={!session.valid || undefined} onClick={() => { finish(); }}
              className="min-h-11 rounded-lg border border-accent bg-accent-soft px-5 text-sm font-semibold text-accent focus-visible:ring-2 focus-visible:ring-accent">적용</button>
          </footer>
        </div>
      </div>, document.body) : null}
    {!open && message ? <span role="status" className="sr-only">{message}</span> : null}
  </div>;
}
