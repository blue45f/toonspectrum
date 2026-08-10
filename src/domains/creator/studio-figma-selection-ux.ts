/**
 * Figma-inspired selection geometry + view helpers (pure).
 *
 * Product copy stays Korean; the algorithm mirrors Figma's "zoom to selection",
 * Design-panel layout metrics, and flip-around-selection-center behavior without
 * cloning Figma's branding.
 */

import { elBounds, type StudioElementBounds } from "./studio-element-geometry";
import {
  normalizeStudioViewRotation,
  planStudioViewScrollToDocumentPoint,
  STUDIO_VIEW_ZOOM_MAX,
  STUDIO_VIEW_ZOOM_MIN,
  type StudioViewRotation,
} from "./studio-view-controls";

import type { El } from "./studio-element-model";

/** Design-panel edit: only the fields the creator actually typed into. */
export interface StudioFigmaSelectionLayoutPatch {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly opacity?: number;
}

export interface StudioFigmaSelectionLayoutMetrics {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly opacity: number;
  readonly hasFixedSize: boolean;
  readonly supportsOpacity: boolean;
  readonly supportsRotation: boolean;
  readonly elementCount: number;
}

export function unionStudioSelectionBounds(
  elements: readonly El[],
): StudioElementBounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    const box = elBounds(element);
    // Flat freehand lines need a non-zero visual pad for zoom/flip pivots.
    const pad =
      element.type === "draw"
        ? Math.max(1, Number(element.strokeWidth) > 0 ? element.strokeWidth / 2 : 1)
        : 0;
    // Pad symmetrically. Flooring the far edge at pad*2 would push the box off-centre on a
    // degenerate axis, and the flip pivot would walk a flat stroke sideways on every press.
    const x0 = box.x - pad;
    const y0 = box.y - pad;
    const x1 = box.x + box.w + pad;
    const y1 = box.y + box.h + pad;
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

/**
 * The elements a Design panel edits: the marquee set when present, else the single selection.
 * Keeps the inspector leaf free of selection-shape branching.
 */
export function selectStudioFigmaDesignTargets(
  elements: readonly El[],
  marqueeIds: readonly string[],
  selected: El | null,
): El[] {
  if (marqueeIds.length > 0) {
    const ids = new Set(marqueeIds);
    return elements.filter((element) => ids.has(element.id));
  }
  return selected ? [selected] : [];
}

export function resolveStudioFigmaSelectionLayoutMetrics(
  elements: readonly El[],
): StudioFigmaSelectionLayoutMetrics | null {
  const bounds = unionStudioSelectionBounds(elements);
  if (!bounds) return null;
  const single = elements.length === 1 ? elements[0]! : null;
  const rotation =
    single && "rotation" in single && typeof single.rotation === "number"
      ? single.rotation
      : 0;
  const opacity =
    single && typeof single.opacity === "number" && Number.isFinite(single.opacity)
      ? Math.min(1, Math.max(0, single.opacity))
      : 1;
  const hasFixedSize = Boolean(
    single
    && single.type !== "draw"
    && "width" in single
    && "height" in single,
  );
  return {
    x: roundLayout(bounds.x),
    y: roundLayout(bounds.y),
    width: roundLayout(bounds.w),
    height: roundLayout(bounds.h),
    rotation: roundLayout(rotation),
    opacity,
    hasFixedSize,
    // Frames are the one type whose renderer ignores opacity, and the existing inspector
    // slider already hides itself for them.
    supportsOpacity: single !== null && single.type !== "frame",
    supportsRotation: Boolean(
      single
      && single.type !== "draw"
      && "rotation" in single,
    ),
    elementCount: elements.length,
  };
}

function roundLayout(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface StudioZoomToSelectionInput {
  readonly bounds: StudioElementBounds;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly canvasFlipH?: boolean;
  readonly canvasRotation?: number;
  /** 0–0.4 of viewport reserved as margin (Figma-like breathing room). */
  readonly paddingRatio?: number;
  readonly maxScale?: number;
  readonly minScale?: number;
}

export interface StudioZoomToSelectionPlan {
  readonly scale: number;
  readonly zoom: 1;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly centerX: number;
  readonly centerY: number;
}

/**
 * Zoom the viewport so the selection fills most of the screen (Figma Shift+2).
 * Returns null when the bounds/viewport are unusable.
 */
export function planStudioZoomToSelection(
  input: StudioZoomToSelectionInput,
): StudioZoomToSelectionPlan | null {
  const viewportWidth = finitePositive(input.viewportWidth);
  const viewportHeight = finitePositive(input.viewportHeight);
  const boundsW = Math.max(1, finitePositive(input.bounds.w, 1));
  const boundsH = Math.max(1, finitePositive(input.bounds.h, 1));
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;

  const padding = clamp(input.paddingRatio ?? 0.14, 0, 0.4);
  const usableW = viewportWidth * (1 - padding);
  const usableH = viewportHeight * (1 - padding);
  // A quarter-turned view transposes the stage box (planStudioViewStageLayout), so a w×h
  // document AABB occupies h×w on screen and must be fitted that way.
  const quarterTurned = normalizeStudioViewRotation(input.canvasRotation ?? 0) % 180 !== 0;
  const fitW = quarterTurned ? boundsH : boundsW;
  const fitH = quarterTurned ? boundsW : boundsH;
  const rawScale = Math.min(usableW / fitW, usableH / fitH);
  const maxScale = finitePositive(input.maxScale ?? STUDIO_VIEW_ZOOM_MAX, STUDIO_VIEW_ZOOM_MAX);
  const minScale = finitePositive(input.minScale ?? STUDIO_VIEW_ZOOM_MIN, STUDIO_VIEW_ZOOM_MIN);
  const scale = clamp(rawScale, minScale, maxScale);
  const centerX = input.bounds.x + input.bounds.w / 2;
  const centerY = input.bounds.y + input.bounds.h / 2;
  const scroll = planStudioViewScrollToDocumentPoint({
    documentWidth: input.documentWidth,
    documentHeight: input.documentHeight,
    canvasFlipH: input.canvasFlipH === true,
    canvasRotation: input.canvasRotation as StudioViewRotation | undefined,
    scale,
    viewportWidth,
    viewportHeight,
    x: centerX,
    y: centerY,
  });
  return {
    scale,
    zoom: 1,
    scrollLeft: scroll.scrollLeft,
    scrollTop: scroll.scrollTop,
    centerX,
    centerY,
  };
}

export type StudioSelectionFlipAxis = "horizontal" | "vertical";

/**
 * Mirror element transforms around the selection AABB center (Figma Flip).
 * Draw strokes flip point coordinates; positioned elements flip origin + optional flip flags.
 *
 * Elements that cannot mirror (no flip flag, and already centred on the axis — e.g. a lone
 * text block) are returned by reference so callers can tell a real flip from a no-op and skip
 * the history entry.
 */
export function planStudioSelectionFlip(
  elements: readonly El[],
  selectedIds: readonly string[],
  axis: StudioSelectionFlipAxis,
): El[] | null {
  const selected = new Set(selectedIds);
  const targets = elements.filter((element) => selected.has(element.id));
  if (targets.length === 0) return null;
  const bounds = unionStudioSelectionBounds(targets);
  if (!bounds) return null;
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;

  return elements.map((element) => {
    if (!selected.has(element.id)) return element;
    if (element.type === "draw") {
      const points = element.points.map((value, index) => {
        if (axis === "horizontal" && index % 2 === 0) {
          return centerX * 2 - value;
        }
        if (axis === "vertical" && index % 2 === 1) {
          return centerY * 2 - value;
        }
        return value;
      });
      // Mirroring only the points would leave the pen's direction channels pointing the old
      // way, so a calligraphy nib would thicken on the wrong side of the mirrored stroke.
      return {
        ...element,
        points,
        ...(axis === "horizontal" && element.tiltXs
          ? { tiltXs: element.tiltXs.map(negateFinite) }
          : {}),
        ...(axis === "vertical" && element.tiltYs
          ? { tiltYs: element.tiltYs.map(negateFinite) }
          : {}),
        ...(element.twists ? { twists: element.twists.map(negateFinite) } : {}),
        ...(element.brushTip
          ? { brushTip: { ...element.brushTip, angleDeg: negateFinite(element.brushTip.angleDeg) } }
          : {}),
      } as El;
    }
    if (!("x" in element) || !("y" in element)) return element;
    const box = elBounds(element);
    const mirrorable = element.type === "image";
    // The flip flags mirror the bitmap in its own local space, so rotation and skew — which
    // Konva applies on top of that — have to reverse too or the result is off by 2θ.
    const mirroredTransform = mirrorable
      ? {
          rotation: negateFinite(element.rotation),
          ...(typeof element.skewX === "number" ? { skewX: negateFinite(element.skewX) } : {}),
          ...(typeof element.skewY === "number" ? { skewY: negateFinite(element.skewY) } : {}),
        }
      : {};
    if (axis === "horizontal") {
      const nextX = centerX * 2 - (box.x + box.w);
      if (!mirrorable && nextX === element.x) return element;
      return {
        ...element,
        x: nextX,
        ...mirroredTransform,
        ...(mirrorable
          ? { flipped: !(element as { flipped?: boolean }).flipped }
          : {}),
      } as El;
    }
    const nextY = centerY * 2 - (box.y + box.h);
    if (!mirrorable && nextY === element.y) return element;
    return {
      ...element,
      y: nextY,
      ...mirroredTransform,
      ...(mirrorable
        ? { flippedY: !(element as { flippedY?: boolean }).flippedY }
        : {}),
    } as El;
  });
}

/**
 * Apply Design-panel position/size numbers (Figma X/Y/W/H) onto one element.
 * Multi-selection should only call this for single targets.
 */
export function planStudioSelectionLayoutPatch(
  element: El,
  patch: StudioFigmaSelectionLayoutPatch,
): Partial<El> | null {
  const next: Record<string, unknown> = {};
  const box = elBounds(element);

  if (
    typeof patch.opacity === "number"
    && Number.isFinite(patch.opacity)
    && element.type !== "frame"
  ) {
    next.opacity = Math.min(1, Math.max(0, patch.opacity));
  }
  if (
    typeof patch.rotation === "number"
    && Number.isFinite(patch.rotation)
    && element.type !== "draw"
    && "rotation" in element
  ) {
    next.rotation = patch.rotation;
  }

  if (element.type === "draw") {
    // The panel shows the padded stroke bounds, so move relative to those or the stroke
    // would slide by half its width every time the field round-trips.
    const shown = unionStudioSelectionBounds([element]) ?? box;
    const dx = typeof patch.x === "number" && Number.isFinite(patch.x) ? patch.x - shown.x : 0;
    const dy = typeof patch.y === "number" && Number.isFinite(patch.y) ? patch.y - shown.y : 0;
    if (dx !== 0 || dy !== 0) {
      next.points = element.points.map((value, index) =>
        value + (index % 2 === 0 ? dx : dy),
      );
    }
    return Object.keys(next).length > 0 ? (next as Partial<El>) : null;
  }

  if (typeof patch.x === "number" && Number.isFinite(patch.x) && "x" in element) {
    next.x = patch.x;
  }
  if (typeof patch.y === "number" && Number.isFinite(patch.y) && "y" in element) {
    next.y = patch.y;
  }
  if (
    typeof patch.width === "number"
    && Number.isFinite(patch.width)
    && patch.width > 0
    && "width" in element
  ) {
    next.width = patch.width;
  }
  if (
    typeof patch.height === "number"
    && Number.isFinite(patch.height)
    && patch.height > 0
    && "height" in element
  ) {
    next.height = patch.height;
  }

  return Object.keys(next).length > 0 ? (next as Partial<El>) : null;
}

/** A mirror reverses the sense of every angle/tilt channel; non-finite entries stay as they are. */
function negateFinite(value: number): number {
  return Number.isFinite(value) ? -value : value;
}

function finitePositive(value: number, fallback = 0): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
