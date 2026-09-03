/**
 * Pure geometry and durable placement model for Studio floating surfaces.
 *
 * Positions are stored as ratios of the available viewport travel instead of raw pixels. A layout
 * therefore survives monitor, browser-zoom, and panel-size changes without restoring off screen.
 * The view layer owns pointer sessions; this module only normalizes and resolves deterministic
 * geometry.
 */

export const STUDIO_FLOATING_SURFACE_LAYOUT_VERSION = 1 as const;
export const STUDIO_FLOATING_SURFACE_MAX_DIMENSION = 8_192;

export interface StudioFloatingSurfaceLayout {
  readonly version: typeof STUDIO_FLOATING_SURFACE_LAYOUT_VERSION;
  readonly xRatio: number;
  readonly yRatio: number;
  readonly width: number;
  readonly height: number;
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

interface StudioFloatingSurfaceBounds {
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

function freezeLayout(layout: StudioFloatingSurfaceLayout): StudioFloatingSurfaceLayout {
  return Object.freeze({
    version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
    xRatio: roundedRatio(layout.xRatio),
    yRatio: roundedRatio(layout.yRatio),
    width: Math.round(clamp(layout.width, 1, STUDIO_FLOATING_SURFACE_MAX_DIMENSION)),
    height: Math.round(clamp(layout.height, 1, STUDIO_FLOATING_SURFACE_MAX_DIMENSION)),
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
    });
  } catch {
    return safeFallback;
  }
}

function resolveBounds(
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
  const bounds = resolveBounds(viewport);
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

/** Resolves a persisted ratio layout into a visible, viewport-safe pixel rectangle. */
export function resolveStudioFloatingSurfaceRect(
  rawLayout: unknown,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
  fallback: StudioFloatingSurfaceLayout = DEFAULT_LAYOUT,
): StudioFloatingSurfaceRect {
  const layout = normalizeStudioFloatingSurfaceLayout(rawLayout, fallback);
  const bounds = resolveBounds(viewport);
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

/** Converts a visible rectangle back to the durable ratio representation. */
export function createStudioFloatingSurfaceLayout(
  rawRect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceLayout {
  const rect = constrainRect(rawRect, viewport, constraints);
  const bounds = resolveBounds(viewport);
  const xTravel = Math.max(0, bounds.width - rect.width);
  const yTravel = Math.max(0, bounds.height - rect.height);
  return freezeLayout({
    version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
    xRatio: xTravel > 0 ? (rect.x - bounds.left) / xTravel : 0,
    yRatio: yTravel > 0 ? (rect.y - bounds.top) / yTravel : 0,
    width: rect.width,
    height: rect.height,
  });
}

function snapRectToBounds(
  rect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  snapDistance: number,
): StudioFloatingSurfaceRect {
  const bounds = resolveBounds(viewport);
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

/** Resizes from the bottom-right corner without moving the anchored top-left corner. */
export function resizeStudioFloatingSurfaceRect(
  start: StudioFloatingSurfaceRect,
  deltaWidth: number,
  deltaHeight: number,
  viewport: StudioFloatingSurfaceViewport,
  constraints: StudioFloatingSurfaceConstraints,
): StudioFloatingSurfaceRect {
  const bounds = resolveBounds(viewport);
  return constrainRect({
    ...start,
    width: Math.min(
      start.width + finite(deltaWidth, 0),
      Math.max(1, bounds.right - start.x),
    ),
    height: Math.min(
      start.height + finite(deltaHeight, 0),
      Math.max(1, bounds.bottom - start.y),
    ),
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
  );
}

export interface StudioFloatingSurfaceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const STUDIO_FLOATING_SURFACE_MAX_SERIALIZED_LENGTH = 4_096;

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
    const normalized = normalizeStudioFloatingSurfaceLayout(layout);
    storage.setItem(key, JSON.stringify({
      version: normalized.version,
      xRatio: normalized.xRatio,
      yRatio: normalized.yRatio,
      width: normalized.width,
      height: normalized.height,
    }));
    return true;
  } catch {
    return false;
  }
}
