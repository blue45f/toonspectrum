import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
} from "./studio-panel-ui";
import { StudioQuickAccessPalette } from "./StudioQuickAccessPalette";

import type {
  StudioQuickAccessCommandMeta,
  StudioQuickAccessState,
} from "./studio-quick-access";

import { cn } from "@/lib/utils";

export interface StudioQuickAccessSurfaceProps {
  readonly state: StudioQuickAccessState;
  readonly catalog: readonly StudioQuickAccessCommandMeta[];
  readonly isMobile: boolean;
  readonly onStateChange: (state: StudioQuickAccessState) => void;
  readonly onExecute: (commandId: string, setId: string) => void;
  readonly onClose: () => void;
}

function visibleFocusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    [
      "button:not([disabled]):not([tabindex='-1'])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex='0']",
    ].join(","),
  )].filter((element) => (
    !element.hidden
    && element.getAttribute("aria-hidden") !== "true"
    && element.getClientRects().length > 0
  ));
}

/**
 * Responsive owner for the Quick Access leaf.
 *
 * Desktop keeps this non-modal so the artist can alternate between the palette and canvas.
 * Mobile uses a bounded bottom sheet because a floating palette would hide both the canvas and
 * the thumb dock. The command model remains controlled by StudioPage in both cases.
 */
export function StudioQuickAccessSurface({
  state,
  catalog,
  isMobile,
  onStateChange,
  onExecute,
  onClose,
}: StudioQuickAccessSurfaceProps) {
  const descriptionId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeElement = document.activeElement;
    restoreFocusRef.current = activeElement instanceof HTMLElement
      ? activeElement
      : null;
    const timer = globalThis.setTimeout(() => {
      const initialCommand = surfaceRef.current?.querySelector<HTMLElement>(
        "[data-command-available='true'] button:not([disabled])",
      );
      (initialCommand ?? surfaceRef.current)?.focus({ preventScroll: true });
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
      const restoreTarget = restoreFocusRef.current;
      if (
        restoreTarget?.isConnected
        && !restoreTarget.closest("[inert]")
      ) {
        restoreTarget.focus({ preventScroll: true });
      }
      restoreFocusRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    function trapMobileFocus(event: globalThis.KeyboardEvent): void {
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const focusable = visibleFocusableElements(surfaceRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        surfaceRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", trapMobileFocus);
    return () => document.removeEventListener("keydown", trapMobileFocus);
  }, [isMobile]);

  useEffect(() => {
    function handleSurfaceShortcut(event: globalThis.KeyboardEvent): void {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || !surfaceRef.current?.contains(target)) return;
      const typing = (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
        || target.isContentEditable
        || target.getAttribute("role") === "textbox"
      );
      // The surface is a Studio shortcut boundary (and a modal on mobile), so the page-level
      // listener intentionally cannot see this chord while focus is inside. Own the second half of
      // the toggle here; text fields keep Shift+Q as ordinary input.
      if (
        event.code === "KeyQ"
        && event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !event.repeat
        && !typing
      ) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      // The inner palette consumes Escape first while its customization mode is active.
      // Once customization is closed, the same key bubbles here and closes the surface.
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", handleSurfaceShortcut);
    return () => document.removeEventListener("keydown", handleSurfaceShortcut);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-studio-quick-access-portal="true"
      className="pointer-events-none fixed inset-0 z-[70]"
    >
      {isMobile ? (
        <button
          type="button"
          aria-label="빠른 액세스 닫기"
          className="pointer-events-auto absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
          onPointerDown={(event) => {
            event.preventDefault();
            onClose();
          }}
        />
      ) : null}

      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal={isMobile ? "true" : undefined}
        aria-label="빠른 액세스 팔레트"
        aria-describedby={descriptionId}
        data-studio-quick-access-surface="true"
        data-studio-shortcut-boundary="true"
        data-mobile={isMobile ? "true" : "false"}
        tabIndex={-1}
        className={cn(
          "pointer-events-auto absolute min-h-0 text-fg",
          isMobile
            ? [
              "inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))]",
              "h-[min(78dvh,44rem)] max-h-[calc(100dvh-4rem)] min-h-[14rem]",
            ]
            : [
              "bottom-3 right-3 top-[4.75rem]",
              "w-[min(21rem,calc(100vw-1.5rem))]",
            ],
        )}
      >
        <p id={descriptionId} className="sr-only">
          자주 쓰는 명령을 실행하거나 표시 방식과 명령 순서를 편집합니다.
        </p>
        <button
          type="button"
          aria-label="빠른 액세스 팔레트 닫기"
          title="빠른 액세스 닫기"
          className={cn(
            "absolute -top-11 right-0 z-10 inline-flex size-10 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 shadow-lg hover:bg-raised hover:text-fg",
            "max-lg:size-11 pointer-coarse:size-11",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={onClose}
        >
          <X size={17} aria-hidden />
        </button>
        <StudioQuickAccessPalette
          state={state}
          catalog={catalog}
          onStateChange={onStateChange}
          onExecute={onExecute}
          className="h-full min-h-0 shadow-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}
