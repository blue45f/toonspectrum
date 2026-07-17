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
    unreadCount: number;
  }>();

  for (const thread of options.threads) {
    if (thread.resolved || thread.anchor.pageId !== options.pageId) continue;
    const key = canonicalStudioCommentAnchorKey(thread.anchor);
    const existing = grouped.get(key);
    if (existing) {
      existing.threadIds.push(thread.id);
      if (options.unreadThreadIds?.has(thread.id)) existing.unreadCount += 1;
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
    const angle = ((collisionIndex - 1) % 6) * (Math.PI / 3);
    const radius = 22 * Math.ceil(collisionIndex / 6);
    pin.screenOffsetX = Math.round(Math.cos(angle) * radius);
    pin.screenOffsetY = Math.round(Math.sin(angle) * radius);
  }
  return sorted;
}
