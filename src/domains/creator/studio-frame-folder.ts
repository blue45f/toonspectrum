/**
 * CSP-class frame-folder seed (cut border folder).
 *
 * Finite slice — not full shared-gutter topology / multi-frame border ownership:
 * 1) Bind selected layers under a contiguous layer group named after a frame (folder chrome).
 * 2) Force `noClip: false` on members so existing `containingPanel` clip keeps them inside the cut.
 * 3) Pure geometry for **shared gutter midlines** between abutting axis-aligned frames (overlay / guides).
 *
 * Shared gutter *editing* (drag one edge moves both frames, child reflow) remains multi-hour.
 * Pure + immutable; no DOM/Konva. StudioPage owns React state and history commits.
 */

import {
  createLayerGroup,
  groupItems,
  type LayerGroup,
  type LayerItemLike,
} from "./studio-layers";

export interface FrameFolderFrameLike {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name?: string;
  readonly type?: string;
}

export interface FrameFolderBindInput<T extends LayerItemLike & { noClip?: boolean }> {
  /** Frame element id that owns the folder. */
  readonly frameId: string;
  readonly frameLabel: string;
  /** New group id (caller generates uid). */
  readonly groupId: string;
  /** Layer ids to place inside the folder (frame itself is excluded). */
  readonly seedIds: readonly string[];
  readonly items: readonly T[];
  readonly groups: readonly LayerGroup[];
}

export interface FrameFolderBindResult<T extends LayerItemLike & { noClip?: boolean }> {
  readonly group: LayerGroup;
  readonly items: readonly T[];
  /** Member ids that had noClip forced off (history / announce). */
  readonly clearedNoClipIds: readonly string[];
  readonly memberIds: readonly string[];
}

export interface SharedGutterSegment {
  readonly axis: "h" | "v";
  /** Midline of the shared gap (document space). */
  readonly pos: number;
  readonly from: number;
  readonly to: number;
  readonly frameAId: string;
  readonly frameBId: string;
  /** Measured gap width between the two frame edges (px). */
  readonly gap: number;
}

/** Max gap treated as a "shared gutter" candidate (generous for panel-split gutters). */
export const FRAME_FOLDER_SHARED_GUTTER_MAX_GAP_PX = 120;
/** Edge coplanarity / touch epsilon (px). */
export const FRAME_FOLDER_SHARED_GUTTER_EPSILON_PX = 1.5;
/** Minimum overlap along the shared edge axis to count as a gutter (px). */
export const FRAME_FOLDER_SHARED_GUTTER_MIN_OVERLAP_PX = 8;
/** Minimum frame side after a shared-gutter drag (matches panel-split floor). */
export const FRAME_FOLDER_MIN_SIDE_PX = 24;

export interface FrameBoxPatch {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ElementTranslatePatch {
  readonly id: string;
  readonly dx: number;
  readonly dy: number;
}

export interface SharedGutterDragPlan {
  readonly framePatches: readonly FrameBoxPatch[];
  /** Delta actually applied after min-side clamping (may be 0). */
  readonly appliedDelta: number;
  readonly nextSegmentPos: number;
  readonly childTranslates: readonly ElementTranslatePatch[];
}

export interface SharedGutterDragElementLike {
  readonly id: string;
  readonly type?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly points?: readonly number[];
  readonly hidden?: boolean;
}

function clampMinSide(value: number, minSide: number): number {
  if (!Number.isFinite(value)) return minSide;
  return Math.max(minSide, value);
}

function frameCenterInside(
  el: SharedGutterDragElementLike,
  frame: FrameFolderFrameLike
): boolean {
  if (el.type === "frame") return false;
  let x = el.x;
  let y = el.y;
  let w = el.width ?? 0;
  let h = el.height ?? 0;
  if (el.type === "draw" && el.points && el.points.length >= 2) {
    let minX = el.points[0]!;
    let minY = el.points[1]!;
    let maxX = minX;
    let maxY = minY;
    for (let i = 2; i < el.points.length; i += 2) {
      const px = el.points[i]!;
      const py = el.points[i + 1]!;
      if (px < minX) minX = px;
      else if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      else if (py > maxY) maxY = py;
    }
    x = minX;
    y = minY;
    w = maxX - minX;
    h = maxY - minY;
  }
  if (
    x === undefined ||
    y === undefined ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h)
  ) {
    return false;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    cx >= frame.x &&
    cx <= frame.x + frame.width &&
    cy >= frame.y &&
    cy <= frame.y + frame.height
  );
}

/**
 * Plan co-edit of a shared gutter: moving the midline resizes both frames while preserving
 * gap, then reflows children whose center sat in the frame that translated (right / bottom).
 *
 * `delta` is document-space: for axis "v", positive grows the left frame into the gutter;
 * for axis "h", positive grows the top frame into the gutter.
 */
export function planSharedGutterDrag(input: {
  readonly segment: SharedGutterSegment;
  readonly framesById: ReadonlyMap<string, FrameFolderFrameLike>;
  readonly delta: number;
  readonly minSidePx?: number;
  readonly elements?: readonly SharedGutterDragElementLike[];
}): SharedGutterDragPlan | null {
  const minSide = Math.max(1, input.minSidePx ?? FRAME_FOLDER_MIN_SIDE_PX);
  const leftOrTop = input.framesById.get(input.segment.frameAId);
  const rightOrBottom = input.framesById.get(input.segment.frameBId);
  if (!leftOrTop || !rightOrBottom) return null;
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    return {
      framePatches: [
        {
          id: leftOrTop.id,
          x: leftOrTop.x,
          y: leftOrTop.y,
          width: leftOrTop.width,
          height: leftOrTop.height,
        },
        {
          id: rightOrBottom.id,
          x: rightOrBottom.x,
          y: rightOrBottom.y,
          width: rightOrBottom.width,
          height: rightOrBottom.height,
        },
      ],
      appliedDelta: 0,
      nextSegmentPos: input.segment.pos,
      childTranslates: [],
    };
  }

  let applied = input.delta;
  if (input.segment.axis === "v") {
    const maxGrow = rightOrBottom.width - minSide;
    const maxShrink = leftOrTop.width - minSide;
    applied = Math.max(-maxShrink, Math.min(maxGrow, applied));
    if (applied === 0) {
      return {
        framePatches: [
          {
            id: leftOrTop.id,
            x: leftOrTop.x,
            y: leftOrTop.y,
            width: leftOrTop.width,
            height: leftOrTop.height,
          },
          {
            id: rightOrBottom.id,
            x: rightOrBottom.x,
            y: rightOrBottom.y,
            width: rightOrBottom.width,
            height: rightOrBottom.height,
          },
        ],
        appliedDelta: 0,
        nextSegmentPos: input.segment.pos,
        childTranslates: [],
      };
    }
    const leftPatch: FrameBoxPatch = {
      id: leftOrTop.id,
      x: leftOrTop.x,
      y: leftOrTop.y,
      width: clampMinSide(leftOrTop.width + applied, minSide),
      height: leftOrTop.height,
    };
    const rightPatch: FrameBoxPatch = {
      id: rightOrBottom.id,
      x: rightOrBottom.x + applied,
      y: rightOrBottom.y,
      width: clampMinSide(rightOrBottom.width - applied, minSide),
      height: rightOrBottom.height,
    };
    const childTranslates: ElementTranslatePatch[] = [];
    for (const el of input.elements ?? []) {
      if (el.hidden || el.id === leftOrTop.id || el.id === rightOrBottom.id) continue;
      if (frameCenterInside(el, rightOrBottom)) {
        childTranslates.push({ id: el.id, dx: applied, dy: 0 });
      }
    }
    return {
      framePatches: [leftPatch, rightPatch],
      appliedDelta: applied,
      nextSegmentPos: input.segment.pos + applied,
      childTranslates,
    };
  }

  // Horizontal gutter
  const maxGrow = rightOrBottom.height - minSide;
  const maxShrink = leftOrTop.height - minSide;
  applied = Math.max(-maxShrink, Math.min(maxGrow, applied));
  if (applied === 0) {
    return {
      framePatches: [
        {
          id: leftOrTop.id,
          x: leftOrTop.x,
          y: leftOrTop.y,
          width: leftOrTop.width,
          height: leftOrTop.height,
        },
        {
          id: rightOrBottom.id,
          x: rightOrBottom.x,
          y: rightOrBottom.y,
          width: rightOrBottom.width,
          height: rightOrBottom.height,
        },
      ],
      appliedDelta: 0,
      nextSegmentPos: input.segment.pos,
      childTranslates: [],
    };
  }
  const topPatch: FrameBoxPatch = {
    id: leftOrTop.id,
    x: leftOrTop.x,
    y: leftOrTop.y,
    width: leftOrTop.width,
    height: clampMinSide(leftOrTop.height + applied, minSide),
  };
  const bottomPatch: FrameBoxPatch = {
    id: rightOrBottom.id,
    x: rightOrBottom.x,
    y: rightOrBottom.y + applied,
    width: rightOrBottom.width,
    height: clampMinSide(rightOrBottom.height - applied, minSide),
  };
  const childTranslates: ElementTranslatePatch[] = [];
  for (const el of input.elements ?? []) {
    if (el.hidden || el.id === leftOrTop.id || el.id === rightOrBottom.id) continue;
    if (frameCenterInside(el, rightOrBottom)) {
      childTranslates.push({ id: el.id, dx: 0, dy: applied });
    }
  }
  return {
    framePatches: [topPatch, bottomPatch],
    appliedDelta: applied,
    nextSegmentPos: input.segment.pos + applied,
    childTranslates,
  };
}

/**
 * Apply a gutter drag plan onto a flat element list (frames resized, children translated).
 * Pure: returns a new array; unchanged elements keep identity.
 */
export function applySharedGutterDragPlan<T extends SharedGutterDragElementLike>(
  elements: readonly T[],
  plan: SharedGutterDragPlan
): readonly T[] {
  if (plan.appliedDelta === 0 && plan.childTranslates.length === 0) return elements;
  const frames = new Map(plan.framePatches.map((patch) => [patch.id, patch]));
  const moves = new Map(plan.childTranslates.map((patch) => [patch.id, patch]));
  return elements.map((el) => {
    const frame = frames.get(el.id);
    if (frame) {
      return {
        ...el,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      };
    }
    const move = moves.get(el.id);
    if (!move || (move.dx === 0 && move.dy === 0)) return el;
    if (el.type === "draw" && Array.isArray(el.points)) {
      const points = el.points.map((value, index) =>
        index % 2 === 0 ? value + move.dx : value + move.dy
      );
      return { ...el, points };
    }
    if (typeof el.x === "number" && typeof el.y === "number") {
      return { ...el, x: el.x + move.dx, y: el.y + move.dy };
    }
    return el;
  });
}

/** Stable key for a gutter segment (drag session / undo coalesce). */
export function sharedGutterSegmentKey(segment: SharedGutterSegment): string {
  return `${segment.axis}:${segment.frameAId}:${segment.frameBId}`;
}

function freezeGroup(group: LayerGroup): LayerGroup {
  return Object.freeze({ ...group });
}

/**
 * Build a frame-folder group name (CSP-class "컷 폴더").
 * Labels are truncated to keep navigator chrome readable.
 */
export function formatFrameFolderGroupName(frameLabel: string): string {
  const trimmed = frameLabel.trim().slice(0, 120);
  return trimmed.length > 0 ? `컷 폴더 · ${trimmed}` : "컷 폴더";
}

/**
 * Plan binding seed layers into a new contiguous group tied to a frame (by naming + member clip).
 * Returns null when there is nothing to bind (empty seeds after filtering the frame itself).
 */
export function planBindSelectionToFrameFolder<
  T extends LayerItemLike & { noClip?: boolean },
>(input: FrameFolderBindInput<T>): FrameFolderBindResult<T> | null {
  if (!input.frameId || !input.groupId) return null;
  const seedSet = new Set(
    input.seedIds.filter((id) => id && id !== input.frameId)
  );
  if (seedSet.size === 0) return null;

  const known = new Set(input.items.map((item) => item.id));
  const memberIds = [...seedSet].filter((id) => known.has(id));
  if (memberIds.length === 0) return null;

  const group = freezeGroup(
    createLayerGroup(input.groupId, formatFrameFolderGroupName(input.frameLabel))
  );
  // Contiguous regroup (existing layer-folder engine).
  let nextItems = groupItems(input.items as T[], memberIds, group.id) as T[];

  const clearedNoClipIds: string[] = [];
  nextItems = nextItems.map((item) => {
    if (!memberIds.includes(item.id)) return item;
    if (item.noClip === true) {
      clearedNoClipIds.push(item.id);
      return { ...item, noClip: false };
    }
    // Explicit false so export/CRDT paths see a deliberate clip-to-panel intent.
    if (item.noClip === undefined) {
      return { ...item, noClip: false };
    }
    return item;
  });

  return {
    group,
    items: nextItems,
    clearedNoClipIds,
    memberIds,
  };
}

function rangeOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number
): { from: number; to: number; length: number } | null {
  const from = Math.max(a0, b0);
  const to = Math.min(a1, b1);
  const length = to - from;
  if (!(length > 0)) return null;
  return { from, to, length };
}

/**
 * Detect axis-aligned frame pairs that share a near-touching edge with a gutter gap.
 * Returns midline segments for overlay (not an editable topology).
 */
export function planSharedGutterSegments(
  frames: readonly FrameFolderFrameLike[],
  options: {
    maxGapPx?: number;
    epsilonPx?: number;
    minOverlapPx?: number;
  } = {}
): readonly SharedGutterSegment[] {
  const maxGap = options.maxGapPx ?? FRAME_FOLDER_SHARED_GUTTER_MAX_GAP_PX;
  const epsilon = options.epsilonPx ?? FRAME_FOLDER_SHARED_GUTTER_EPSILON_PX;
  const minOverlap = options.minOverlapPx ?? FRAME_FOLDER_SHARED_GUTTER_MIN_OVERLAP_PX;
  if (frames.length < 2 || !(maxGap >= 0)) return Object.freeze([]);

  const valid = frames.filter(
    (frame) =>
      frame.id &&
      Number.isFinite(frame.x) &&
      Number.isFinite(frame.y) &&
      Number.isFinite(frame.width) &&
      Number.isFinite(frame.height) &&
      frame.width > 0 &&
      frame.height > 0
  );
  const segments: SharedGutterSegment[] = [];

  for (let i = 0; i < valid.length; i += 1) {
    const a = valid[i]!;
    const aRight = a.x + a.width;
    const aBottom = a.y + a.height;
    for (let j = i + 1; j < valid.length; j += 1) {
      const b = valid[j]!;
      const bRight = b.x + b.width;
      const bBottom = b.y + b.height;

      // Vertical gutter: a left of b (or swapped).
      {
        const gapRightOfA = b.x - aRight;
        const gapRightOfB = a.x - bRight;
        let gap = NaN;
        let leftRight: { left: FrameFolderFrameLike; right: FrameFolderFrameLike } | null = null;
        if (gapRightOfA >= -epsilon && gapRightOfA <= maxGap) {
          gap = Math.max(0, gapRightOfA);
          leftRight = { left: a, right: b };
        } else if (gapRightOfB >= -epsilon && gapRightOfB <= maxGap) {
          gap = Math.max(0, gapRightOfB);
          leftRight = { left: b, right: a };
        }
        if (leftRight) {
          const overlap = rangeOverlap(
            leftRight.left.y,
            leftRight.left.y + leftRight.left.height,
            leftRight.right.y,
            leftRight.right.y + leftRight.right.height
          );
          if (overlap && overlap.length >= minOverlap) {
            const leftEdge = leftRight.left.x + leftRight.left.width;
            const rightEdge = leftRight.right.x;
            const pos = (leftEdge + rightEdge) / 2;
            segments.push({
              axis: "v",
              pos,
              from: overlap.from,
              to: overlap.to,
              frameAId: leftRight.left.id,
              frameBId: leftRight.right.id,
              gap,
            });
          }
        }
      }

      // Horizontal gutter: a above b (or swapped).
      {
        const gapBelowA = b.y - aBottom;
        const gapBelowB = a.y - bBottom;
        let gap = NaN;
        let topBottom: { top: FrameFolderFrameLike; bottom: FrameFolderFrameLike } | null = null;
        if (gapBelowA >= -epsilon && gapBelowA <= maxGap) {
          gap = Math.max(0, gapBelowA);
          topBottom = { top: a, bottom: b };
        } else if (gapBelowB >= -epsilon && gapBelowB <= maxGap) {
          gap = Math.max(0, gapBelowB);
          topBottom = { top: b, bottom: a };
        }
        if (topBottom) {
          const overlap = rangeOverlap(
            topBottom.top.x,
            topBottom.top.x + topBottom.top.width,
            topBottom.bottom.x,
            topBottom.bottom.x + topBottom.bottom.width
          );
          if (overlap && overlap.length >= minOverlap) {
            const topEdge = topBottom.top.y + topBottom.top.height;
            const bottomEdge = topBottom.bottom.y;
            const pos = (topEdge + bottomEdge) / 2;
            segments.push({
              axis: "h",
              pos,
              from: overlap.from,
              to: overlap.to,
              frameAId: topBottom.top.id,
              frameBId: topBottom.bottom.id,
              gap,
            });
          }
        }
      }
    }
  }

  return Object.freeze(segments);
}
