/**
 * Pure geometry and durable placement model for Studio floating surfaces.
 *
 * Positions are stored as ratios of the available viewport travel instead of raw pixels. A layout
 * therefore survives monitor, browser-zoom, and panel-size changes without restoring off screen.
 * Optional docking remains part of the same exact UI-only allowlist, so pre-docking v1 snapshots
 * continue to normalize without migration I/O.
 */

export const STUDIO_FLOATING_SURFACE_LAYOUT_VERSION = 1 as const;
export const STUDIO_FLOATING_SURFACE_MAX_DIMENSION = 8_192;
export const STUDIO_FLOATING_SURFACE_DOCK_EDGES = [
  "left",
  "right",
  "bottom",
] as const;
export const STUDIO_FLOATING_SURFACE_RESIZE_EDGES = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
] as const;

export type StudioFloatingSurfaceDockEdge =
  (typeof STUDIO_FLOATING_SURFACE_DOCK_EDGES)[number];
export type StudioFloatingSurfaceResizeEdge =
  (typeof STUDIO_FLOATING_SURFACE_RESIZE_EDGES)[number];

export interface StudioFloatingSurfaceLayout {
  readonly version: typeof STUDIO_FLOATING_SURFACE_LAYOUT_VERSION;
  readonly xRatio: number;
  readonly yRatio: number;
  readonly width: number;
  readonly height: number;
  /** Missing and null both mean an ordinary free-floating surface. */
  readonly dock?: StudioFloatingSurfaceDockEdge | null;
}

export interface StudioFloatingSurfaceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioFloatingSurfaceViewport {
  readonly width: number;
  readonly height: number;
  readonly insetTop?: number;
  readonly insetRight?: number;
  readonly insetBottom?: number;
  readonly insetLeft?: number;
}

export interface StudioFloatingSurfaceConstraints {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly snapDistance?: number;
}

export interface StudioFloatingSurfaceBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_LAYOUT: StudioFloatingSurfaceLayout = Object.freeze({
  version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  xRatio: 1,
  yRatio: 0,
  width: 336,
  height: 720,
});

const DOCK_EDGE_SET = new Set<string>(STUDIO_FLOATING_SURFACE_DOCK_EDGES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOwn(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundedRatio(value: number): number {
  return Math.round(clamp(value, 0, 1) * 10_000) / 10_000;
}

function normalizeDock(value: unknown): StudioFloatingSurfaceDockEdge | null {
  return typeof value === "string" && DOCK_EDGE_SET.has(value)
    ? value as StudioFloatingSurfaceDockEdge
    : null;
}

function freezeLayout(layout: StudioFloatingSurfaceLayout): StudioFloatingSurfaceLayout {
  const dock = normalizeDock(layout.dock);
  return Object.freeze({
    version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
    xRatio: roundedRatio(layout.xRatio),
    yRatio: roundedRatio(layout.yRatio),
    width: Math.round(clamp(layout.width, 1, STUDIO_FLOATING_SURFACE_MAX_DIMENSION)),
    height: Math.round(clamp(layout.height, 1, STUDIO_FLOATING_SURFACE_MAX_DIMENSION)),
    ...(dock ? { dock } : {}),
  });
}

/** Rebuilds the exact allowlist and bounds hostile or stale persisted values. */
export function normalizeStudioFloatingSurfaceLayout(
  raw: unknown,
  fallback: StudioFloatingSurfaceLayout = DEFAULT_LAYOUT,
): StudioFloatingSurfaceLayout {
  const safeFallback = freezeLayout(fallback);
  try {
    if (
      !isRecord(raw)
      || readOwn(raw, "version") !== STUDIO_FLOATING_SURFACE_LAYOUT_VERSION
    ) {
      return safeFallback;
    }
    return freezeLayout({
      version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
      xRatio: finite(readOwn(raw, "xRatio"), safeFallback.xRatio),
      yRatio: finite(readOwn(raw, "yRatio"), safeFallback.yRatio),
      width: finite(readOwn(raw, "width"), safeFallback.width),
      height: finite(readOwn(raw, "height"), safeFallback.height),
      dock: normalizeDock(readOwn(raw, "dock")),
    });
  } catch {
    return safeFallback;
  }
}

export function resolveStudioFloatingSurfaceBounds(
  viewport: StudioFloatingSurfaceViewport,
): StudioFloatingSurfaceBounds {
  const viewportWidth = Math.max(1, finite(viewport.width, 1));
  const viewportHeight = Math.max(1, finite(viewport.height, 1));
  const left = clamp(finite(viewport.insetLeft, 0), 0, viewportWidth - 1);
  const top = clamp(finite(viewport.insetTop, 0), 0, viewportHeight - 1);
  const rightInset = clamp(
    finite(viewport.insetRight, 0),
    0,
    Math.max(0, viewportWidth - left - 1),
  );
  const bottomInset = clamp(
    finite(viewport.insetBottom, 0),
    0,
    Math.max(0, viewportHeight - top - 1),
  );
  const right = Math.max(left + 1, viewportWidth - rightInset);
  const bottom = Math.max(top + 1, viewportHeight - bottomInset);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function resolveDimensionRange(
  available: number,
  minimum: number,
  maximum: number | undefined,
): readonly [number, number] {
  const min = clamp(finite(minimum, 1), 1, available);
  const max = clamp(finite(maximum, available), min, available);
  return [min, max] as const;
}

function constrainRect(
  rect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceRect {
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  const [minWidth, maxWidth] = resolveDimensionRange(
    bounds.width,
    constraints.minWidth,
    constraints.maxWidth,
  );
  const [minHeight, maxHeight] = resolveDimensionRange(
    bounds.height,
    constraints.minHeight,
    constraints.maxHeight,
  );
  const width = Math.round(clamp(finite(rect.width, minWidth), minWidth, maxWidth));
  const height = Math.round(clamp(finite(rect.height, minHeight), minHeight, maxHeight));
  const x = Math.round(clamp(
    finite(rect.x, bounds.left),
    bounds.left,
    bounds.right - width,
  ));
  const y = Math.round(clamp(
    finite(rect.y, bounds.top),
    bounds.top,
    bounds.bottom - height,
  ));
  return { x, y, width, height };
}

/** Resolves only the floating rectangle, deliberately ignoring a persisted dock edge. */
export function resolveStudioFloatingSurfaceFloatingRect(
  rawLayout: unknown,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
  fallback: StudioFloatingSurfaceLayout = DEFAULT_LAYOUT,
): StudioFloatingSurfaceRect {
  const layout = normalizeStudioFloatingSurfaceLayout(rawLayout, fallback);
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  const [minWidth, maxWidth] = resolveDimensionRange(
    bounds.width,
    constraints.minWidth,
    constraints.maxWidth,
  );
  const [minHeight, maxHeight] = resolveDimensionRange(
    bounds.height,
    constraints.minHeight,
    constraints.maxHeight,
  );
  const width = Math.round(clamp(layout.width, minWidth, maxWidth));
  const height = Math.round(clamp(layout.height, minHeight, maxHeight));
  const xTravel = Math.max(0, bounds.width - width);
  const yTravel = Math.max(0, bounds.height - height);
  return {
    x: Math.round(bounds.left + xTravel * layout.xRatio),
    y: Math.round(bounds.top + yTravel * layout.yRatio),
    width,
    height,
  };
}

/**
 * Expands a preferred floating rectangle into a stable edge dock. Left/right docks retain their
 * preferred width; the bottom dock retains its preferred height. The other dimension fills the
 * safe viewport and deliberately ignores the floating maximum for that axis.
 */
export function resolveStudioFloatingSurfaceDockRect(
  edge: StudioFloatingSurfaceDockEdge,
  preferredRect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceRect {
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  const constrained = constrainRect(preferredRect, viewport, constraints);
  if (edge === "bottom") {
    const [, maxHeight] = resolveDimensionRange(
      bounds.height,
      constraints.minHeight,
      Math.min(
        constraints.maxHeight ?? bounds.height,
        Math.max(constraints.minHeight, Math.round(bounds.height * 0.72)),
      ),
    );
    const height = Math.round(clamp(
      constrained.height,
      Math.min(constraints.minHeight, bounds.height),
      maxHeight,
    ));
    return {
      x: bounds.left,
      y: bounds.bottom - height,
      width: bounds.width,
      height,
    };
  }

  const [, maxWidth] = resolveDimensionRange(
    bounds.width,
    constraints.minWidth,
    Math.min(
      constraints.maxWidth ?? bounds.width,
      Math.max(constraints.minWidth, Math.round(bounds.width * 0.55)),
    ),
  );
  const width = Math.round(clamp(
    constrained.width,
    Math.min(constraints.minWidth, bounds.width),
    maxWidth,
  ));
  return {
    x: edge === "left" ? bounds.left : bounds.right - width,
    y: bounds.top,
    width,
    height: bounds.height,
  };
}

/** Resolves a persisted ratio layout into a visible, viewport-safe pixel rectangle. */
export function resolveStudioFloatingSurfaceRect(
  rawLayout: unknown,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
  fallback: StudioFloatingSurfaceLayout = DEFAULT_LAYOUT,
): StudioFloatingSurfaceRect {
  const layout = normalizeStudioFloatingSurfaceLayout(rawLayout, fallback);
  const floating = resolveStudioFloatingSurfaceFloatingRect(
    layout,
    viewport,
    constraints,
    fallback,
  );
  const dock = normalizeDock(layout.dock);
  return dock
    ? resolveStudioFloatingSurfaceDockRect(dock, floating, viewport, constraints)
    : floating;
}

/** Converts a preferred floating rectangle back to the durable ratio representation. */
export function createStudioFloatingSurfaceLayout(
  rawRect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
  dock: StudioFloatingSurfaceDockEdge | null = null,
): StudioFloatingSurfaceLayout {
  const rect = constrainRect(rawRect, viewport, constraints);
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  const xTravel = Math.max(0, bounds.width - rect.width);
  const yTravel = Math.max(0, bounds.height - rect.height);
  return freezeLayout({
    version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
    xRatio: xTravel > 0 ? (rect.x - bounds.left) / xTravel : 0,
    yRatio: yTravel > 0 ? (rect.y - bounds.top) / yTravel : 0,
    width: rect.width,
    height: rect.height,
    dock,
  });
}

function snapRectToBounds(
  rect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  snapDistance: number,
): StudioFloatingSurfaceRect {
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  const distance = Math.max(0, finite(snapDistance, 0));
  let x = rect.x;
  let y = rect.y;
  if (Math.abs(rect.x - bounds.left) <= distance) x = bounds.left;
  if (Math.abs(rect.x + rect.width - bounds.right) <= distance) {
    x = bounds.right - rect.width;
  }
  if (Math.abs(rect.y - bounds.top) <= distance) y = bounds.top;
  if (Math.abs(rect.y + rect.height - bounds.bottom) <= distance) {
    y = bounds.bottom - rect.height;
  }
  return { ...rect, x, y };
}

/** Moves and optionally edge-snaps a surface while keeping it fully recoverable on screen. */
export function moveStudioFloatingSurfaceRect(
  start: StudioFloatingSurfaceRect,
  deltaX: number,
  deltaY: number,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
  snap = false,
): StudioFloatingSurfaceRect {
  const moved = constrainRect({
    ...start,
    x: start.x + finite(deltaX, 0),
    y: start.y + finite(deltaY, 0),
  }, viewport, constraints);
  return snap
    ? snapRectToBounds(moved, viewport, constraints.snapDistance ?? 0)
    : moved;
}

/**
 * Resizes from any edge or corner while keeping the opposite edges anchored and respecting both
 * surface and viewport constraints. The rendered pointer preview can therefore update x/y as well
 * as width/height without changing the durable layout until pointer-up.
 */
export function resizeStudioFloatingSurfaceRectFromEdge(
  start: StudioFloatingSurfaceRect,
  deltaX: number,
  deltaY: number,
  edge: StudioFloatingSurfaceResizeEdge,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceRect {
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  const [minWidth, maxWidth] = resolveDimensionRange(
    bounds.width,
    constraints.minWidth,
    constraints.maxWidth,
  );
  const [minHeight, maxHeight] = resolveDimensionRange(
    bounds.height,
    constraints.minHeight,
    constraints.maxHeight,
  );
  const west = edge.includes("w");
  const east = edge.includes("e");
  const north = edge.includes("n");
  const south = edge.includes("s");
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (west) {
    const right = start.x + start.width;
    width = clamp(
      start.width - finite(deltaX, 0),
      minWidth,
      Math.min(maxWidth, right - bounds.left),
    );
    x = right - width;
  } else if (east) {
    width = clamp(
      start.width + finite(deltaX, 0),
      minWidth,
      Math.min(maxWidth, bounds.right - start.x),
    );
  }

  if (north) {
    const bottom = start.y + start.height;
    height = clamp(
      start.height - finite(deltaY, 0),
      minHeight,
      Math.min(maxHeight, bottom - bounds.top),
    );
    y = bottom - height;
  } else if (south) {
    height = clamp(
      start.height + finite(deltaY, 0),
      minHeight,
      Math.min(maxHeight, bounds.bottom - start.y),
    );
  }

  return constrainRect({ x, y, width, height }, viewport, constraints);
}

/** Compatibility helper for the original bottom-right resize contract. */
export function resizeStudioFloatingSurfaceRect(
  start: StudioFloatingSurfaceRect,
  deltaWidth: number,
  deltaHeight: number,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceRect {
  return resizeStudioFloatingSurfaceRectFromEdge(
    start,
    deltaWidth,
    deltaHeight,
    "se",
    viewport,
    constraints,
  );
}

/** Resizes the exposed edge of a dock while keeping the dock attached to its safe viewport edge. */
export function resizeStudioFloatingSurfaceDockRect(
  start: StudioFloatingSurfaceRect,
  edge: StudioFloatingSurfaceDockEdge,
  deltaX: number,
  deltaY: number,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceRect {
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  if (edge === "bottom") {
    const preferred = {
      ...start,
      height: start.height - finite(deltaY, 0),
    };
    return resolveStudioFloatingSurfaceDockRect(
      edge,
      preferred,
      viewport,
      constraints,
    );
  }
  const width = edge === "left"
    ? start.width + finite(deltaX, 0)
    : start.width - finite(deltaX, 0);
  return resolveStudioFloatingSurfaceDockRect(
    edge,
    {
      ...start,
      width,
      x: edge === "left" ? bounds.left : bounds.right - width,
    },
    viewport,
    constraints,
  );
}

/** Chooses the closest allowed safe edge while a floating panel is inside the activation band. */
export function resolveStudioFloatingSurfaceDockCandidate(
  rect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  allowedEdges: readonly StudioFloatingSurfaceDockEdge[],
  activationDistance = 48,
): StudioFloatingSurfaceDockEdge | null {
  const bounds = resolveStudioFloatingSurfaceBounds(viewport);
  const distance = Math.max(0, finite(activationDistance, 0));
  let best: { readonly edge: StudioFloatingSurfaceDockEdge; readonly gap: number } | null = null;
  for (const edge of allowedEdges) {
    if (!DOCK_EDGE_SET.has(edge)) continue;
    const gap = edge === "left"
      ? Math.abs(rect.x - bounds.left)
      : edge === "right"
        ? Math.abs(bounds.right - (rect.x + rect.width))
        : Math.abs(bounds.bottom - (rect.y + rect.height));
    if (gap > distance || (best && best.gap <= gap)) continue;
    best = { edge, gap };
  }
  return best?.edge ?? null;
}

function closestSnap(
  current: number,
  candidates: readonly number[],
  distance: number,
): number {
  let value = current;
  let bestGap = distance + 1;
  for (const candidate of candidates) {
    const gap = Math.abs(candidate - current);
    if (gap > distance || gap >= bestGap) continue;
    value = candidate;
    bestGap = gap;
  }
  return value;
}

/** Magnetically aligns panel edges with peer surfaces without forcing overlap or a dock. */
export function snapStudioFloatingSurfaceRectToPeers(
  rect: StudioFloatingSurfaceRect,
  peerRects: readonly StudioFloatingSurfaceRect[],
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
  snapDistance = constraints.snapDistance ?? 0,
): StudioFloatingSurfaceRect {
  const distance = Math.max(0, finite(snapDistance, 0));
  if (distance === 0 || peerRects.length === 0) {
    return constrainRect(rect, viewport, constraints);
  }
  const xCandidates: number[] = [];
  const yCandidates: number[] = [];
  for (const peer of peerRects) {
    if (!(peer.width > 0) || !(peer.height > 0)) continue;
    xCandidates.push(
      peer.x,
      peer.x + peer.width,
      peer.x - rect.width,
      peer.x + peer.width - rect.width,
    );
    yCandidates.push(
      peer.y,
      peer.y + peer.height,
      peer.y - rect.height,
      peer.y + peer.height - rect.height,
    );
  }
  return constrainRect({
    ...rect,
    x: closestSnap(rect.x, xCandidates, distance),
    y: closestSnap(rect.y, yCandidates, distance),
  }, viewport, constraints);
}

/**
 * Produces a sensible free-floating rectangle when a docked title bar starts moving. The pointer
 * stays within the title-bar band rather than making the panel jump to an unrelated corner.
 */
export function undockStudioFloatingSurfaceRect(
  rawLayout: StudioFloatingSurfaceLayout,
  dockedRect: StudioFloatingSurfaceRect,
  pointerX: number,
  pointerY: number,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceRect {
  const floating = resolveStudioFloatingSurfaceFloatingRect(
    { ...rawLayout, dock: null },
    viewport,
    constraints,
    rawLayout,
  );
  const horizontalRatio = dockedRect.width > 0
    ? clamp((pointerX - dockedRect.x) / dockedRect.width, 0.08, 0.92)
    : 0.5;
  return constrainRect({
    ...floating,
    x: pointerX - floating.width * horizontalRatio,
    y: pointerY - Math.min(24, Math.max(12, pointerY - dockedRect.y)),
  }, viewport, constraints);
}

export function studioFloatingSurfaceLayoutsEqual(
  left: StudioFloatingSurfaceLayout | undefined,
  right: StudioFloatingSurfaceLayout | undefined,
): boolean {
  return left === right || (
    left !== undefined
    && right !== undefined
    && left.version === right.version
    && left.xRatio === right.xRatio
    && left.yRatio === right.yRatio
    && left.width === right.width
    && left.height === right.height
    && normalizeDock(left.dock) === normalizeDock(right.dock)
  );
}

export interface StudioFloatingSurfaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const STUDIO_FLOATING_SURFACE_MAX_SERIALIZED_LENGTH = 4_096;

/** Serializes only the normalized documented fields. */
export function encodeStudioFloatingSurfaceLayout(
  layout: StudioFloatingSurfaceLayout,
): string {
  const normalized = normalizeStudioFloatingSurfaceLayout(layout);
  const dock = normalizeDock(normalized.dock);
  return JSON.stringify({
    version: normalized.version,
    xRatio: normalized.xRatio,
    yRatio: normalized.yRatio,
    width: normalized.width,
    height: normalized.height,
    ...(dock ? { dock } : {}),
  });
}

/** Reads one bounded UI-only layout. Invalid values recover without mutating storage. */
export function loadStudioFloatingSurfaceLayout(
  storage: StudioFloatingSurfaceStorage | null | undefined,
  key: string,
  fallback: StudioFloatingSurfaceLayout = DEFAULT_LAYOUT,
): StudioFloatingSurfaceLayout {
  if (!storage || !key || key.length > 256) {
    return normalizeStudioFloatingSurfaceLayout(undefined, fallback);
  }
  try {
    const raw = storage.getItem(key);
    if (
      raw === null
      || raw.length === 0
      || raw.length > STUDIO_FLOATING_SURFACE_MAX_SERIALIZED_LENGTH
    ) {
      return normalizeStudioFloatingSurfaceLayout(undefined, fallback);
    }
    return normalizeStudioFloatingSurfaceLayout(JSON.parse(raw), fallback);
  } catch {
    return normalizeStudioFloatingSurfaceLayout(undefined, fallback);
  }
}

/** Writes the normalized exact allowlist; storage failures remain non-fatal UI preference loss. */
export function saveStudioFloatingSurfaceLayout(
  storage: StudioFloatingSurfaceStorage | null | undefined,
  key: string,
  layout: StudioFloatingSurfaceLayout,
): boolean {
  if (!storage || !key || key.length > 256) return false;
  try {
    storage.setItem(key, encodeStudioFloatingSurfaceLayout(layout));
    return true;
  } catch {
    return false;
  }
}
