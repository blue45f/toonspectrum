/**
 * Pure view-state helpers shared by the Studio View menu and its keyboard shortcuts.
 * View snapshots are session-only UI state: they never enter page history, CRDT, or exports.
 */

export const STUDIO_VIEW_ZOOM_MIN = 0.2;
export const STUDIO_VIEW_ZOOM_MAX = 5;
export const STUDIO_VIEW_ZOOM_STEP = 0.2;

export interface StudioViewShortcutEvent {
  code?: string;
  key?: string;
  keyCode?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

export type StudioViewShortcut =
  | "zoom-in"
  | "zoom-out"
  | "flip-horizontal"
  | "fit-width"
  | "actual-pixels"
  | "fullscreen"
  | "toggle-grayscale"
  | "save-view"
  | "restore-view"
  | "toggle-perspective-guide";

export interface StudioViewSnapshot {
  pageId: string;
  scale: number;
  zoom: number;
  /** Visual canvas coordinate under the center of the viewport. */
  centerX: number;
  /** Visual canvas coordinate under the center of the viewport. */
  centerY: number;
  canvasFlipH: boolean;
}

export interface CaptureStudioViewInput {
  pageId: string;
  scale: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  canvasFlipH: boolean;
}

export interface RestoreStudioViewInput {
  snapshot: StudioViewSnapshot;
  pageId: string;
  viewportWidth: number;
  viewportHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface StudioViewRestorePlan {
  scale: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  canvasFlipH: boolean;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function eventCode(event: StudioViewShortcutEvent): string {
  if (event.code) return event.code;
  const key = event.key?.toLowerCase();
  if (key === "=") return "Equal";
  if (key === "-") return "Minus";
  if (key === "h") return "KeyH";
  if (key === "q") return "KeyQ";
  if (key === "s") return "KeyS";
  if (key === "z") return "KeyZ";
  if (key === "g") return "KeyG";
  if (key === "home") return "Home";
  if (key === "end") return "End";
  if (key === "f11") return "F11";
  return "";
}

/**
 * Resolve Magma-style view shortcuts by physical key so keyboard-layout changes do not
 * turn Shift/Option combinations into unrelated characters. Cmd/Ctrl combinations remain
 * available to the existing editor and browser-compatible aliases.
 */
export function resolveStudioViewShortcut(
  event: StudioViewShortcutEvent
): StudioViewShortcut | null {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.metaKey ||
    event.ctrlKey
  ) {
    return null;
  }

  const code = eventCode(event);

  if (!event.altKey && !event.shiftKey) {
    if (code === "Equal") return "zoom-in";
    if (code === "Minus") return "zoom-out";
    if (event.repeat) return null;
    if (code === "KeyH") return "flip-horizontal";
    if (code === "Home") return "fit-width";
    if (code === "End") return "actual-pixels";
    if (code === "F11") return "fullscreen";
    if (code === "KeyQ") return "toggle-grayscale";
    return null;
  }

  if (event.altKey || !event.shiftKey || event.repeat) return null;
  if (code === "KeyS") return "save-view";
  if (code === "KeyZ") return "restore-view";
  if (code === "KeyG") return "toggle-perspective-guide";
  return null;
}

export function clampStudioViewZoom(value: number): number {
  const safe = Number.isFinite(value) ? value : 1;
  return Math.min(
    STUDIO_VIEW_ZOOM_MAX,
    Math.max(STUDIO_VIEW_ZOOM_MIN, Math.round(safe * 20) / 20)
  );
}

export function stepStudioViewZoom(current: number, direction: -1 | 1): number {
  return clampStudioViewZoom(current + direction * STUDIO_VIEW_ZOOM_STEP);
}

export function fitStudioViewToWidth(
  viewportWidth: number,
  canvasWidth: number,
  maximumScale: number
): number {
  const safeViewportWidth = finitePositive(viewportWidth, canvasWidth);
  const safeCanvasWidth = finitePositive(canvasWidth, 1);
  const safeMaximum = finitePositive(maximumScale, 1);
  return Math.min(safeMaximum, Math.max(0.1, safeViewportWidth / safeCanvasWidth));
}

export function captureStudioView(input: CaptureStudioViewInput): StudioViewSnapshot {
  const scale = finitePositive(input.scale, 1);
  const zoom = clampStudioViewZoom(input.zoom);
  const effectiveScale = scale * zoom;
  const viewportWidth = finiteNonNegative(input.viewportWidth);
  const viewportHeight = finiteNonNegative(input.viewportHeight);

  return {
    pageId: input.pageId,
    scale,
    zoom,
    centerX: (finiteNonNegative(input.scrollLeft) + viewportWidth / 2) / effectiveScale,
    centerY: (finiteNonNegative(input.scrollTop) + viewportHeight / 2) / effectiveScale,
    canvasFlipH: input.canvasFlipH,
  };
}

/**
 * Recalculate scrolling from the saved document center after the restored scale has laid out.
 * Returning null for another page prevents a view from silently jumping to unrelated content.
 */
export function planStudioViewRestore(
  input: RestoreStudioViewInput
): StudioViewRestorePlan | null {
  if (input.snapshot.pageId !== input.pageId) return null;

  const scale = finitePositive(input.snapshot.scale, 1);
  const zoom = clampStudioViewZoom(input.snapshot.zoom);
  const effectiveScale = scale * zoom;
  const viewportWidth = finiteNonNegative(input.viewportWidth);
  const viewportHeight = finiteNonNegative(input.viewportHeight);
  const canvasWidth = finitePositive(input.canvasWidth, 1);
  const canvasHeight = finitePositive(input.canvasHeight, 1);
  const maximumScrollLeft = Math.max(0, canvasWidth * effectiveScale - viewportWidth);
  const maximumScrollTop = Math.max(0, canvasHeight * effectiveScale - viewportHeight);

  return {
    scale,
    zoom,
    scrollLeft: Math.min(
      maximumScrollLeft,
      Math.max(0, input.snapshot.centerX * effectiveScale - viewportWidth / 2)
    ),
    scrollTop: Math.min(
      maximumScrollTop,
      Math.max(0, input.snapshot.centerY * effectiveScale - viewportHeight / 2)
    ),
    canvasFlipH: input.snapshot.canvasFlipH,
  };
}
