/* eslint-disable react-refresh/only-export-components -- This statically imported Studio leaf intentionally co-locates its typed overlay controller with the portal that exclusively consumes it. */
import {
  LockKeyhole,
  MoreHorizontal,
  PanelRightOpen,
  Pin,
  SlidersHorizontal,
  SwatchBook,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  type StudioCanonicalDrawingPaletteLayout,
  type StudioDrawingPaletteId,
  type StudioDrawingPaletteLockKind,
} from "./studio-drawing-palettes";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";

import { cn } from "@/lib/utils";

export type StudioDrawingPalettePresentation = "full" | "icon-popup";

export interface StudioDrawingPaletteDefinition {
  readonly id: StudioDrawingPaletteId;
  readonly label: string;
  readonly Icon: typeof SwatchBook;
}

export const STUDIO_DRAWING_PALETTES: Readonly<
  Record<StudioDrawingPaletteId, StudioDrawingPaletteDefinition>
> = {
  "sub-tools": {
    id: "sub-tools",
    label: "서브 도구",
    Icon: SwatchBook,
  },
  "tool-properties": {
    id: "tool-properties",
    label: "도구 속성",
    Icon: SlidersHorizontal,
  },
};

export interface StudioDrawingPaletteOverlay {
  readonly kind: "options" | "palette";
  readonly id: StudioDrawingPaletteId;
}

interface StudioDrawingPaletteOverlayStyle extends CSSProperties {
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

export interface StudioDrawingPaletteOverlayController {
  readonly openOverlay: StudioDrawingPaletteOverlay | null;
  readonly inlineOptionsOpen: boolean;
  readonly overlayRef: RefObject<HTMLDivElement | null>;
  readonly setTrigger: (
    overlay: StudioDrawingPaletteOverlay,
    node: HTMLButtonElement | null,
  ) => void;
  readonly toggle: (
    overlay: StudioDrawingPaletteOverlay,
    trigger: HTMLButtonElement,
  ) => void;
  readonly toggleInlineOptions: () => void;
  readonly close: (restoreTriggerFocus?: boolean) => void;
  readonly dismiss: () => void;
  readonly overlayStyle: StudioDrawingPaletteOverlayStyle | null;
}

interface StudioDrawingPaletteOverlayPortalProps {
  readonly controller: StudioDrawingPaletteOverlayController;
  readonly stackId: string;
  readonly layout: StudioCanonicalDrawingPaletteLayout;
  readonly presentation: StudioDrawingPalettePresentation;
  readonly subTools: ReactNode;
  readonly toolProperties: ReactNode;
  readonly onLockToggle: (
    id: StudioDrawingPaletteId,
    kind: StudioDrawingPaletteLockKind,
  ) => void;
  readonly onPresentationChange: (
    presentation: StudioDrawingPalettePresentation,
  ) => void;
}

interface PaletteOptionsProps {
  readonly id: StudioDrawingPaletteId;
  readonly label: string;
  readonly layout: StudioCanonicalDrawingPaletteLayout;
  readonly presentation: StudioDrawingPalettePresentation;
  readonly onLockToggle: (kind: StudioDrawingPaletteLockKind) => void;
  readonly onPresentationChange: (
    presentation: StudioDrawingPalettePresentation,
  ) => void;
}

function overlayKey(overlay: StudioDrawingPaletteOverlay): string {
  return `${overlay.kind}:${overlay.id}`;
}

export function studioDrawingPaletteOverlayId(
  stackId: string,
  overlay: StudioDrawingPaletteOverlay,
): string {
  return `${stackId}-${overlay.id}-${
    overlay.kind === "palette" ? "icon-popup" : "options"
  }`;
}

function paletteOverlayStyle(
  trigger: HTMLButtonElement,
  kind: StudioDrawingPaletteOverlay["kind"],
): StudioDrawingPaletteOverlayStyle {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = Math.max(320, globalThis.innerWidth || 1024);
  const viewportHeight = Math.max(320, globalThis.innerHeight || 768);
  const margin = 8;
  const gap = 8;
  const preferredWidth = kind === "palette" ? 320 : 264;
  const preferredHeight =
    kind === "palette"
      ? Math.min(viewportHeight * 0.7, 544)
      : Math.min(viewportHeight - margin * 2, 176);
  const width = Math.min(preferredWidth, viewportWidth - margin * 2);
  const rightCandidate = rect.right + gap;
  const left =
    rightCandidate + width <= viewportWidth - margin
      ? rightCandidate
      : Math.max(margin, rect.left - width - gap);
  const top = Math.min(
    Math.max(margin, rect.top),
    Math.max(margin, viewportHeight - margin - preferredHeight),
  );
  return { top, left, width };
}

export function paletteBody(
  id: StudioDrawingPaletteId,
  subTools: ReactNode,
  toolProperties: ReactNode,
): ReactNode {
  return id === "sub-tools" ? subTools : toolProperties;
}

function PaletteOptions({
  id,
  label,
  layout,
  presentation,
  onLockToggle,
  onPresentationChange,
}: PaletteOptionsProps) {
  const locks = layout.locks[id];
  const nextPresentation = presentation === "full" ? "icon-popup" : "full";
  return (
    <div role="none" className="grid gap-1 p-1.5">
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={locks.position}
        onClick={() => onLockToggle("position")}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-fg-2 hover:bg-raised hover:text-fg",
          locks.position && "bg-accent-soft text-fg",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
        )}
      >
        <Pin size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">위치 잠금</span>
          <span className="block truncate text-[0.65rem] text-fg-3">
            {locks.position
              ? `${label} 순서를 고정합니다`
              : `${label} 순서를 바꿀 수 있습니다`}
          </span>
        </span>
        <span aria-hidden className="text-[0.65rem] font-semibold">
          {locks.position ? "켬" : "끔"}
        </span>
      </button>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={locks.height}
        onClick={() => onLockToggle("height")}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs text-fg-2 hover:bg-raised hover:text-fg",
          locks.height && "bg-accent-soft text-fg",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
        )}
      >
        <LockKeyhole size={15} className="shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">높이 잠금</span>
          <span className="block truncate text-[0.65rem] text-fg-3">
            {locks.height
              ? "분할선 크기를 고정합니다"
              : "분할선으로 높이를 조절합니다"}
          </span>
        </span>
        <span aria-hidden className="text-[0.65rem] font-semibold">
          {locks.height ? "켬" : "끔"}
        </span>
      </button>
      <div role="separator" className="mx-2 my-0.5 h-px bg-line/70" />
      <button
        type="button"
        role="menuitem"
        onClick={() => onPresentationChange(nextPresentation)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
        )}
      >
        <PanelRightOpen
          size={15}
          className="shrink-0 text-accent"
          aria-hidden
        />
        {nextPresentation === "icon-popup"
          ? "아이콘 팝업으로 보기"
          : "전체 팔레트로 보기"}
      </button>
    </div>
  );
}

export function useStudioDrawingPaletteOverlay(): StudioDrawingPaletteOverlayController {
  const overlayRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [openOverlay, setOpenOverlay] =
    useState<StudioDrawingPaletteOverlay | null>(null);
  const [overlayStyle, setOverlayStyle] =
    useState<StudioDrawingPaletteOverlayStyle | null>(null);
  const [inlineOptionsOpen, setInlineOptionsOpen] = useState(false);

  useEffect(() => {
    if (!openOverlay || typeof document === "undefined") return;
    const key = overlayKey(openOverlay);
    const reposition = (): void => {
      const trigger = triggerRefs.current[key];
      if (trigger) {
        setOverlayStyle(paletteOverlayStyle(trigger, openOverlay.kind));
      }
    };
    const dismiss = (): void => {
      setOpenOverlay(null);
      setOverlayStyle(null);
      setInlineOptionsOpen(false);
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (overlayRef.current?.contains(target)) return;
      if (triggerRefs.current[key]?.contains(target)) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      triggerRefs.current[key]?.focus({ preventScroll: true });
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("resize", reposition);
    globalThis.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("resize", reposition);
      globalThis.removeEventListener("scroll", reposition, true);
    };
  }, [openOverlay]);

  const dismiss = (): void => {
    setOpenOverlay(null);
    setOverlayStyle(null);
    setInlineOptionsOpen(false);
  };

  const close = (restoreTriggerFocus = false): void => {
    const trigger = openOverlay
      ? triggerRefs.current[overlayKey(openOverlay)]
      : null;
    dismiss();
    if (restoreTriggerFocus) trigger?.focus({ preventScroll: true });
  };

  return {
    openOverlay,
    inlineOptionsOpen,
    overlayRef,
    overlayStyle,
    setTrigger(overlay, node) {
      triggerRefs.current[overlayKey(overlay)] = node;
    },
    toggle(overlay, trigger) {
      triggerRefs.current[overlayKey(overlay)] = trigger;
      if (
        openOverlay?.kind === overlay.kind &&
        openOverlay.id === overlay.id
      ) {
        dismiss();
        return;
      }
      setInlineOptionsOpen(false);
      setOverlayStyle(paletteOverlayStyle(trigger, overlay.kind));
      setOpenOverlay(overlay);
    },
    toggleInlineOptions() {
      setInlineOptionsOpen((open) => !open);
    },
    close,
    dismiss,
  };
}

export function StudioDrawingPaletteOverlayPortal({
  controller,
  stackId,
  layout,
  presentation,
  subTools,
  toolProperties,
  onLockToggle,
  onPresentationChange,
}: StudioDrawingPaletteOverlayPortalProps) {
  const {
    openOverlay,
    inlineOptionsOpen,
    overlayRef,
    overlayStyle,
    toggleInlineOptions,
    close,
  } = controller;
  if (!openOverlay || !overlayStyle || typeof document === "undefined") {
    return null;
  }

  const definition = STUDIO_DRAWING_PALETTES[openOverlay.id];
  return createPortal(
    <div
      ref={overlayRef}
      id={studioDrawingPaletteOverlayId(stackId, openOverlay)}
      role={openOverlay.kind === "options" ? "menu" : "dialog"}
      aria-label={`${definition.label} ${
        openOverlay.kind === "options" ? "팔레트 옵션" : "팝업"
      }`}
      data-studio-drawing-palette-overlay={openOverlay.kind}
      data-studio-drawing-palette-overlay-id={openOverlay.id}
      style={overlayStyle}
      className={cn(
        "fixed z-[70] min-w-0 overflow-hidden rounded-xl border border-line-strong bg-panel text-fg shadow-2xl",
        openOverlay.kind === "palette" &&
          "flex max-h-[min(70dvh,34rem)] flex-col",
      )}
    >
      {openOverlay.kind === "options" ? (
        <PaletteOptions
          id={openOverlay.id}
          label={definition.label}
          layout={layout}
          presentation={presentation}
          onLockToggle={(kind) => onLockToggle(openOverlay.id, kind)}
          onPresentationChange={onPresentationChange}
        />
      ) : (
        <>
          <header className="flex min-h-11 shrink-0 items-center gap-1 border-b border-line px-1.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg text-accent"
            >
              <definition.Icon size={16} strokeWidth={1.8} />
            </span>
            <strong className="min-w-0 flex-1 truncate text-xs">
              {definition.label}
            </strong>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={inlineOptionsOpen}
              aria-controls={`${stackId}-${openOverlay.id}-popup-options`}
              onClick={toggleInlineOptions}
              aria-label={`${definition.label} 팔레트 옵션`}
              className={cn(
                "grid size-11 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg",
                inlineOptionsOpen && "bg-accent-soft text-accent",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <MoreHorizontal size={17} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              aria-label={`${definition.label} 팝업 닫기`}
              className={cn(
                "grid size-11 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <X size={16} aria-hidden />
            </button>
          </header>
          {inlineOptionsOpen ? (
            <div
              id={`${stackId}-${openOverlay.id}-popup-options`}
              role="menu"
              aria-label={`${definition.label} 팔레트 옵션`}
              className="shrink-0 border-b border-line bg-card/55"
            >
              <PaletteOptions
                id={openOverlay.id}
                label={definition.label}
                layout={layout}
                presentation={presentation}
                onLockToggle={(kind) => onLockToggle(openOverlay.id, kind)}
                onPresentationChange={onPresentationChange}
              />
            </div>
          ) : null}
          <div
            data-studio-drawing-palette-popup-content="true"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable]"
          >
            {paletteBody(openOverlay.id, subTools, toolProperties)}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
