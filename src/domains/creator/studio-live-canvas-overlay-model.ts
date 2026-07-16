import type { StudioCommentAnchor, StudioCommentThread } from "./studio-comments";

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
  label: string;
  x: number;
  y: number;
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

function anchorKey(anchor: StudioCommentAnchor): string {
  if (anchor.type === "page") return `page:${anchor.pageId}`;
  if (anchor.type === "frame") return `frame:${anchor.pageId}:${anchor.frameId}`;
  // 부동소수 미세 차이가 그룹 키를 갈라놓지 않도록 고정 정밀도로 직렬화한다.
  if (anchor.type === "point") return `point:${anchor.pageId}:${anchor.x.toFixed(4)}:${anchor.y.toFixed(4)}`;
  return `element:${anchor.pageId}:${anchor.elementId}`;
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
  labelForAnchor?: (anchor: StudioCommentAnchor) => string;
}): StudioCanvasCommentPin[] {
  const grouped = new Map<string, { anchor: StudioCommentAnchor; count: number }>();

  for (const thread of options.threads) {
    if (thread.resolved || thread.anchor.pageId !== options.pageId) continue;
    const key = anchorKey(thread.anchor);
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { anchor: thread.anchor, count: 1 });
  }

  const margin = 18;
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
      count: group.count,
      label:
        options.labelForAnchor?.(group.anchor) ??
        (group.anchor.type === "page"
          ? "페이지 댓글"
          : group.anchor.type === "frame"
            ? "컷 댓글"
            : group.anchor.type === "point"
              ? "위치 댓글"
              : "요소 댓글"),
      x: clamp(rawX, margin, Math.max(margin, options.canvasWidth - margin)),
      y: clamp(rawY, margin, Math.max(margin, options.canvasHeight - margin)),
    });
  }

  return pins.sort(
    (left, right) => left.y - right.y || left.x - right.x || left.key.localeCompare(right.key)
  );
}
