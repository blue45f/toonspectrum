/**
 * Pure view-state helpers shared by the Studio View menu and its keyboard shortcuts.
 * View snapshots are session-only UI state: they never enter page history, CRDT, or exports.
 */

export const STUDIO_VIEW_ZOOM_MIN = 0.2;
export const STUDIO_VIEW_ZOOM_MAX = 5;
export const STUDIO_VIEW_ZOOM_STEP = 0.2;

/** View-only quarter-turn rotation. Positive angles follow Konva's clockwise screen rotation. */
export type StudioViewRotation = 0 | 90 | 180 | 270;

/** Snap any finite angle to the nearest quarter turn and wrap it into the canonical 0..270 range. */
export function normalizeStudioViewRotation(value: number): StudioViewRotation {
  if (!Number.isFinite(value)) return 0;
  const quarterTurns = Math.round(value / 90);
  return ((((quarterTurns % 4) + 4) % 4) * 90) as StudioViewRotation;
}

/** Rotate the view 90 degrees counter-clockwise without changing the document. */
export function rotateStudioViewLeft(value: number): StudioViewRotation {
  return normalizeStudioViewRotation(value - 90);
}

/** Rotate the view 90 degrees clockwise without changing the document. */
export function rotateStudioViewRight(value: number): StudioViewRotation {
  return normalizeStudioViewRotation(value + 90);
}

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
  /** Document-local coordinate under the center of the viewport. */
  centerX: number;
  /** Document-local coordinate under the center of the viewport. */
  centerY: number;
  canvasFlipH: boolean;
  canvasRotation: StudioViewRotation;
}

export interface CaptureStudioViewInput {
  pageId: string;
  scale: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  canvasFlipH: boolean;
  /** Optional until StudioPage wires its view state; omitted input preserves the legacy 0-degree view. */
  canvasRotation?: number;
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
  canvasRotation: StudioViewRotation;
}

export interface StudioViewStageLayoutInput {
  /** Unscaled document dimensions. */
  documentWidth: number;
  documentHeight: number;
  /** Effective display scale (`fit scale * user zoom`). */
  scale: number;
  canvasFlipH: boolean;
  canvasRotation?: number;
}

/** Props needed to lay a transformed document out inside an axis-aligned Konva Stage. */
export interface StudioViewStageLayout {
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: StudioViewRotation;
  scaleX: number;
  scaleY: number;
}

export interface StudioViewTransformInput {
  documentWidth: number;
  documentHeight: number;
  canvasFlipH: boolean;
  canvasRotation?: number;
}

export interface StudioViewPoint {
  x: number;
  y: number;
}

export interface StudioViewRect extends StudioViewPoint {
  width: number;
  height: number;
}

export interface StudioViewProjectedPoint extends StudioViewPoint {
  /** Unscaled width/height of the axis-aligned visual stage. */
  viewWidth: number;
  viewHeight: number;
}

export interface StudioViewScrollPlan {
  scrollLeft: number;
  scrollTop: number;
}

export interface StudioViewRotationTransitionInput extends StudioViewTransformInput {
  nextCanvasRotation: number;
  scale: number;
  scrollLeft: number;
  scrollTop: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface StudioViewRotationTransitionPlan extends StudioViewScrollPlan {
  canvasRotation: StudioViewRotation;
  documentPoint: StudioViewPoint;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function clampFinite(value: number, minimum: number, maximum: number): number {
  const safe = Number.isFinite(value) ? value : minimum;
  return Math.min(maximum, Math.max(minimum, safe));
}

/**
 * Project one document-local point into the unscaled, axis-aligned quarter-turned view box.
 * Horizontal flip is screen-relative: rotate first, then mirror the visible view's X axis. This
 * keeps “좌우 반전” horizontal even when the canvas is viewed at 90° or 270°.
 */
export function projectStudioDocumentPointToView(
  input: StudioViewTransformInput & StudioViewPoint
): StudioViewProjectedPoint {
  const documentWidth = finitePositive(input.documentWidth, 1);
  const documentHeight = finitePositive(input.documentHeight, 1);
  const rotation = normalizeStudioViewRotation(input.canvasRotation ?? 0);
  const documentX = clampFinite(input.x, 0, documentWidth);
  const documentY = clampFinite(input.y, 0, documentHeight);
  let projected: StudioViewProjectedPoint;

  if (rotation === 90) {
    projected = {
      x: documentHeight - documentY,
      y: documentX,
      viewWidth: documentHeight,
      viewHeight: documentWidth,
    };
  } else if (rotation === 180) {
    projected = {
      x: documentWidth - documentX,
      y: documentHeight - documentY,
      viewWidth: documentWidth,
      viewHeight: documentHeight,
    };
  } else if (rotation === 270) {
    projected = {
      x: documentY,
      y: documentWidth - documentX,
      viewWidth: documentHeight,
      viewHeight: documentWidth,
    };
  } else {
    projected = {
      x: documentX,
      y: documentY,
      viewWidth: documentWidth,
      viewHeight: documentHeight,
    };
  }

  return input.canvasFlipH
    ? { ...projected, x: projected.viewWidth - projected.x }
    : projected;
}

/** Inverse of projectStudioDocumentPointToView for drop, minimap and zoom-anchor input. */
export function projectStudioViewPointToDocument(
  input: StudioViewTransformInput & StudioViewPoint
): StudioViewPoint {
  const documentWidth = finitePositive(input.documentWidth, 1);
  const documentHeight = finitePositive(input.documentHeight, 1);
  const rotation = normalizeStudioViewRotation(input.canvasRotation ?? 0);
  const viewWidth = rotation === 90 || rotation === 270 ? documentHeight : documentWidth;
  const viewHeight = rotation === 90 || rotation === 270 ? documentWidth : documentHeight;
  const viewX = clampFinite(input.x, 0, viewWidth);
  const viewY = clampFinite(input.y, 0, viewHeight);
  const rotatedX = input.canvasFlipH ? viewWidth - viewX : viewX;

  let documentX: number;
  let documentY: number;
  if (rotation === 90) {
    documentX = viewY;
    documentY = documentHeight - rotatedX;
  } else if (rotation === 180) {
    documentX = documentWidth - rotatedX;
    documentY = documentHeight - viewY;
  } else if (rotation === 270) {
    documentX = documentWidth - viewY;
    documentY = rotatedX;
  } else {
    documentX = rotatedX;
    documentY = viewY;
  }

  return {
    x: clampFinite(documentX, 0, documentWidth),
    y: clampFinite(documentY, 0, documentHeight),
  };
}

function boundsFromStudioViewPoints(points: readonly StudioViewPoint[]): StudioViewRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Project a document AABB into the unscaled, axis-aligned view box. */
export function projectStudioDocumentRectToViewRect(
  input: StudioViewTransformInput & StudioViewRect
): StudioViewRect {
  const right = input.x + finiteNonNegative(input.width);
  const bottom = input.y + finiteNonNegative(input.height);
  return boundsFromStudioViewPoints([
    projectStudioDocumentPointToView({ ...input, x: input.x, y: input.y }),
    projectStudioDocumentPointToView({ ...input, x: right, y: input.y }),
    projectStudioDocumentPointToView({ ...input, x: input.x, y: bottom }),
    projectStudioDocumentPointToView({ ...input, x: right, y: bottom }),
  ]);
}

/** Inverse AABB projection used by minimap viewport indicators and DOM overlay culling. */
export function projectStudioViewRectToDocumentRect(
  input: StudioViewTransformInput & StudioViewRect
): StudioViewRect {
  const right = input.x + finiteNonNegative(input.width);
  const bottom = input.y + finiteNonNegative(input.height);
  return boundsFromStudioViewPoints([
    projectStudioViewPointToDocument({ ...input, x: input.x, y: input.y }),
    projectStudioViewPointToDocument({ ...input, x: right, y: input.y }),
    projectStudioViewPointToDocument({ ...input, x: input.x, y: bottom }),
    projectStudioViewPointToDocument({ ...input, x: right, y: bottom }),
  ]);
}

/** Center a document-local point in the current visual view while respecting scroll bounds. */
export function planStudioViewScrollToDocumentPoint(
  input: StudioViewTransformInput & StudioViewPoint & {
    scale: number;
    viewportWidth: number;
    viewportHeight: number;
  }
): StudioViewScrollPlan {
  const scale = finitePositive(input.scale, 1);
  const viewportWidth = finiteNonNegative(input.viewportWidth);
  const viewportHeight = finiteNonNegative(input.viewportHeight);
  const projected = projectStudioDocumentPointToView(input);
  const maximumScrollLeft = Math.max(0, projected.viewWidth * scale - viewportWidth);
  const maximumScrollTop = Math.max(0, projected.viewHeight * scale - viewportHeight);
  return {
    scrollLeft: clampFinite(projected.x * scale - viewportWidth / 2, 0, maximumScrollLeft),
    scrollTop: clampFinite(projected.y * scale - viewportHeight / 2, 0, maximumScrollTop),
  };
}

/**
 * Preserve the document point under the viewport center while changing only the view rotation.
 * This deliberately keeps scale/zoom untouched; explicit Fit remains the only rotation-aware refit.
 */
export function planStudioViewRotationTransition(
  input: StudioViewRotationTransitionInput
): StudioViewRotationTransitionPlan {
  const scale = finitePositive(input.scale, 1);
  const viewportWidth = finiteNonNegative(input.viewportWidth);
  const viewportHeight = finiteNonNegative(input.viewportHeight);
  const documentPoint = projectStudioViewPointToDocument({
    documentWidth: input.documentWidth,
    documentHeight: input.documentHeight,
    canvasFlipH: input.canvasFlipH,
    canvasRotation: input.canvasRotation,
    x: (finiteNonNegative(input.scrollLeft) + viewportWidth / 2) / scale,
    y: (finiteNonNegative(input.scrollTop) + viewportHeight / 2) / scale,
  });
  const canvasRotation = normalizeStudioViewRotation(input.nextCanvasRotation);
  const scroll = planStudioViewScrollToDocumentPoint({
    documentWidth: input.documentWidth,
    documentHeight: input.documentHeight,
    canvasFlipH: input.canvasFlipH,
    canvasRotation,
    scale,
    viewportWidth,
    viewportHeight,
    ...documentPoint,
  });
  return { ...scroll, canvasRotation, documentPoint };
}

/**
 * Calculate an axis-aligned Stage box and transform for a view-only quarter turn.
 *
 * `canvasFlipH` mirrors the visible view's X axis after rotation. At 90°/270° this is represented
 * by a negative local Y scale so the user-facing operation remains a screen-horizontal flip.
 * Translation keeps every transformed document corner inside the returned `width`/`height` box.
 */
export function planStudioViewStageLayout(
  input: StudioViewStageLayoutInput
): StudioViewStageLayout {
  const documentWidth = finitePositive(input.documentWidth, 1);
  const documentHeight = finitePositive(input.documentHeight, 1);
  const scale = finitePositive(input.scale, 1);
  const scaledWidth = documentWidth * scale;
  const scaledHeight = documentHeight * scale;
  const rotation = normalizeStudioViewRotation(input.canvasRotation ?? 0);

  if (rotation === 90) {
    return {
      width: scaledHeight,
      height: scaledWidth,
      x: input.canvasFlipH ? 0 : scaledHeight,
      y: 0,
      rotation,
      scaleX: scale,
      scaleY: input.canvasFlipH ? -scale : scale,
    };
  }
  if (rotation === 180) {
    return {
      width: scaledWidth,
      height: scaledHeight,
      x: input.canvasFlipH ? 0 : scaledWidth,
      y: scaledHeight,
      rotation,
      scaleX: input.canvasFlipH ? -scale : scale,
      scaleY: scale,
    };
  }
  if (rotation === 270) {
    return {
      width: scaledHeight,
      height: scaledWidth,
      x: input.canvasFlipH ? scaledHeight : 0,
      y: scaledWidth,
      rotation,
      scaleX: scale,
      scaleY: input.canvasFlipH ? -scale : scale,
    };
  }
  return {
    width: scaledWidth,
    height: scaledHeight,
    x: input.canvasFlipH ? scaledWidth : 0,
    y: 0,
    rotation,
    scaleX: input.canvasFlipH ? -scale : scale,
    scaleY: scale,
  };
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

  const center = projectStudioViewPointToDocument({
    documentWidth: input.canvasWidth,
    documentHeight: input.canvasHeight,
    canvasFlipH: input.canvasFlipH,
    canvasRotation: input.canvasRotation,
    x: (finiteNonNegative(input.scrollLeft) + viewportWidth / 2) / effectiveScale,
    y: (finiteNonNegative(input.scrollTop) + viewportHeight / 2) / effectiveScale,
  });

  return {
    pageId: input.pageId,
    scale,
    zoom,
    centerX: center.x,
    centerY: center.y,
    canvasFlipH: input.canvasFlipH,
    canvasRotation: normalizeStudioViewRotation(input.canvasRotation ?? 0),
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
  const canvasRotation = normalizeStudioViewRotation(input.snapshot.canvasRotation);
  const stageLayout = planStudioViewStageLayout({
    documentWidth: canvasWidth,
    documentHeight: canvasHeight,
    scale: effectiveScale,
    canvasFlipH: input.snapshot.canvasFlipH,
    canvasRotation,
  });
  const scroll = planStudioViewScrollToDocumentPoint({
    documentWidth: canvasWidth,
    documentHeight: canvasHeight,
    canvasFlipH: input.snapshot.canvasFlipH,
    canvasRotation,
    scale: effectiveScale,
    viewportWidth,
    viewportHeight,
    x: input.snapshot.centerX,
    y: input.snapshot.centerY,
  });

  return {
    scale,
    zoom,
    scrollLeft: scroll.scrollLeft,
    scrollTop: scroll.scrollTop,
    canvasFlipH: input.snapshot.canvasFlipH,
    canvasRotation: stageLayout.rotation,
  };
}
