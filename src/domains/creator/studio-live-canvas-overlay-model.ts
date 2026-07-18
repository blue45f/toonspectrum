import {
  canonicalStudioCommentAnchorKey,
  type StudioCommentAnchor,
  type StudioCommentThread,
} from "./studio-comments";

export const STUDIO_LIVE_PARTICIPANT_COLORS = [
  "#6d28d9",
  "#1d4ed8",
  "#0e7490",
  "#047857",
  "#a16207",
  "#c2410c",
  "#be185d",
  "#7e22ce",
] as const;

export interface StudioCanvasAnchorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudioCanvasCommentPin {
  key: string;
  anchor: StudioCommentAnchor;
  count: number;
  /** Threads represented by this pin that are unread for the current viewer. */
  unreadCount?: number;
  /** Stable input-order IDs represented by this collapsed pin. */
  threadIds?: readonly string[];
  /** Most recently active thread represented by this pin. */
  newestThreadId?: string;
  /** Most recently active unread thread, preferred when opening a clustered pin. */
  newestUnreadThreadId?: string;
  label: string;
  x: number;
  y: number;
  /** Deterministic screen-pixel nudge for distinct anchors that would otherwise overlap. */
  screenOffsetX?: number;
  screenOffsetY?: number;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function studioLiveParticipantColor(sessionId: string): string {
  return STUDIO_LIVE_PARTICIPANT_COLORS[
    stableHash(sessionId) % STUDIO_LIVE_PARTICIPANT_COLORS.length
  ];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface StudioPinCollisionDirection {
  x: number;
  y: number;
}

const DIAGONAL_COMPONENT = Math.SQRT1_2;

/** Keeps collision nudges inside the visible edge instead of letting CSS clamp collapse them. */
function studioPinCollisionDirections(
  normalizedX: number,
  normalizedY: number
): readonly StudioPinCollisionDirection[] {
  const horizontalEdge = normalizedX <= 0.03 || normalizedX >= 0.97;
  const verticalEdge = normalizedY <= 0.03 || normalizedY >= 0.97;
  const inwardX = normalizedX >= 0.5 ? -1 : 1;
  const inwardY = normalizedY >= 0.5 ? -1 : 1;

  if (horizontalEdge && verticalEdge) {
    return [
      { x: inwardX * DIAGONAL_COMPONENT, y: inwardY * DIAGONAL_COMPONENT },
      { x: inwardX, y: 0 },
      { x: 0, y: inwardY },
      { x: inwardX * 0.924, y: inwardY * 0.383 },
      { x: inwardX * 0.383, y: inwardY * 0.924 },
    ];
  }
  if (horizontalEdge) {
    return [
      { x: inwardX, y: 0 },
      { x: inwardX * DIAGONAL_COMPONENT, y: -DIAGONAL_COMPONENT },
      { x: inwardX * DIAGONAL_COMPONENT, y: DIAGONAL_COMPONENT },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];
  }
  if (verticalEdge) {
    return [
      { x: 0, y: inwardY },
      { x: -DIAGONAL_COMPONENT, y: inwardY * DIAGONAL_COMPONENT },
      { x: DIAGONAL_COMPONENT, y: inwardY * DIAGONAL_COMPONENT },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
  }
  return Array.from({ length: 6 }, (_, index) => {
    const angle = index * (Math.PI / 3);
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
}

/**
 * The visible pin center is clamped 22px inside the overlay. A 22px nudge therefore collapses
 * back onto the unshifted pin at an edge. Reserve at least one full 44px touch target after that
 * clamp, with extra diagonal travel at corners where each axis only receives √1/2 of the radius.
 */
function studioPinCollisionRadius(normalizedX: number, normalizedY: number): number {
  const horizontalEdge = normalizedX <= 0.03 || normalizedX >= 0.97;
  const verticalEdge = normalizedY <= 0.03 || normalizedY >= 0.97;
  if (horizontalEdge && verticalEdge) return 88;
  if (horizontalEdge || verticalEdge) return 72;
  return 52;
}

function anchorTargetId(anchor: StudioCommentAnchor): string | null {
  if (anchor.type === "frame") return anchor.frameId;
  if (anchor.type === "element") return anchor.elementId;
  return null;
}

/**
 * Projects persisted page/frame/element comment anchors into non-exported DOM pins.
 * Multiple open threads on the same anchor collapse into one numbered pin, matching Figma's
 * low-noise canvas review pattern without changing the project-file comment contract.
 */
export function projectStudioCanvasCommentPins(options: {
  threads: readonly StudioCommentThread[];
  pageId: string;
  canvasWidth: number;
  canvasHeight: number;
  boundsByElementId: ReadonlyMap<string, StudioCanvasAnchorBounds>;
  unreadThreadIds?: ReadonlySet<string>;
  labelForAnchor?: (anchor: StudioCommentAnchor) => string;
}): StudioCanvasCommentPin[] {
  const grouped = new Map<string, {
    anchor: StudioCommentAnchor;
    threadIds: string[];
    newestThreadId: string;
    newestUpdatedAt: string;
    newestUnreadThreadId?: string;
    newestUnreadUpdatedAt?: string;
    unreadCount: number;
  }>();

  for (const thread of options.threads) {
    if (thread.resolved || thread.anchor.pageId !== options.pageId) continue;
    const key = canonicalStudioCommentAnchorKey(thread.anchor);
    const existing = grouped.get(key);
    if (existing) {
      existing.threadIds.push(thread.id);
      if (options.unreadThreadIds?.has(thread.id)) {
        existing.unreadCount += 1;
        if (
          !existing.newestUnreadUpdatedAt
          || Date.parse(thread.updatedAt) > Date.parse(existing.newestUnreadUpdatedAt)
          || (
            thread.updatedAt === existing.newestUnreadUpdatedAt
            && thread.id.localeCompare(existing.newestUnreadThreadId ?? "") > 0
          )
        ) {
          existing.newestUnreadThreadId = thread.id;
          existing.newestUnreadUpdatedAt = thread.updatedAt;
        }
      }
      if (
        Date.parse(thread.updatedAt) > Date.parse(existing.newestUpdatedAt)
        || (
          thread.updatedAt === existing.newestUpdatedAt
          && thread.id.localeCompare(existing.newestThreadId) > 0
        )
      ) {
        existing.newestThreadId = thread.id;
        existing.newestUpdatedAt = thread.updatedAt;
      }
    } else {
      grouped.set(key, {
        anchor: thread.anchor,
        threadIds: [thread.id],
        newestThreadId: thread.id,
        newestUpdatedAt: thread.updatedAt,
        newestUnreadThreadId: options.unreadThreadIds?.has(thread.id) ? thread.id : undefined,
        newestUnreadUpdatedAt: options.unreadThreadIds?.has(thread.id)
          ? thread.updatedAt
          : undefined,
        unreadCount: options.unreadThreadIds?.has(thread.id) ? 1 : 0,
      });
    }
  }

  const pins: StudioCanvasCommentPin[] = [];
  for (const [key, group] of grouped) {
    const targetId = anchorTargetId(group.anchor);
    const bounds = targetId ? options.boundsByElementId.get(targetId) : null;
    if (targetId && !bounds) continue;

    const pagePinOffset = pins.filter((pin) => pin.anchor.type === "page").length * 42;
    const rawX = group.anchor.type === "point"
      ? group.anchor.x * options.canvasWidth
      : bounds
        ? bounds.x + bounds.width
        : 24;
    const rawY = group.anchor.type === "point"
      ? group.anchor.y * options.canvasHeight
      : bounds
        ? bounds.y
        : 24 + pagePinOffset;
    pins.push({
      key,
      anchor: group.anchor,
      count: group.threadIds.length,
      unreadCount: group.unreadCount,
      threadIds: group.threadIds,
      newestThreadId: group.newestThreadId,
      newestUnreadThreadId: group.newestUnreadThreadId,
      label:
        options.labelForAnchor?.(group.anchor) ??
        (group.anchor.type === "page"
          ? "페이지 댓글"
          : group.anchor.type === "frame"
            ? "컷 댓글"
            : group.anchor.type === "point"
              ? "위치 댓글"
              : "요소 댓글"),
      x: clamp(rawX, 0, options.canvasWidth),
      y: clamp(rawY, 0, options.canvasHeight),
    });
  }

  const sorted = pins.sort(
    (left, right) => left.y - right.y || left.x - right.x || left.key.localeCompare(right.key)
  );
  for (let index = 0; index < sorted.length; index += 1) {
    const pin = sorted[index];
    const collisionIndex = sorted.slice(0, index).filter((candidate) =>
      Math.abs(candidate.x / options.canvasWidth - pin.x / options.canvasWidth) < 0.02
      && Math.abs(candidate.y / options.canvasHeight - pin.y / options.canvasHeight) < 0.02
    ).length;
    if (collisionIndex === 0) continue;
    const directions = studioPinCollisionDirections(
      pin.x / options.canvasWidth,
      pin.y / options.canvasHeight
    );
    const direction = directions[(collisionIndex - 1) % directions.length];
    const ring = Math.floor((collisionIndex - 1) / directions.length) + 1;
    const radius = studioPinCollisionRadius(
      pin.x / options.canvasWidth,
      pin.y / options.canvasHeight
    ) * ring;
    pin.screenOffsetX = Math.round(direction.x * radius);
    pin.screenOffsetY = Math.round(direction.y * radius);
  }
  return sorted;
}
