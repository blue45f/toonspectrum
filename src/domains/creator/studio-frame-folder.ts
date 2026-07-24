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
