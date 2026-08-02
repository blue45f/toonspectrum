import { canvasPointToNormalized } from "./studio-selection-tools";

import type { StudioLiquifyMode } from "./studio-liquify-contract";
import type { SelectionFrame, SelPoint } from "./studio-selection-tools";

export type StudioRasterRetouchGestureTool =
  | "smudge"
  | "dodge-burn"
  | "wet-mix"
  | "liquify";

export interface StudioRasterRetouchGesturePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface StudioRasterRetouchGesturePointer {
  readonly button?: number;
  readonly isPrimary?: boolean;
  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly pressure?: number;
}

export interface StudioPendingRasterRetouchGesture {
  readonly cancelled: boolean;
  readonly liquifyMode: StudioLiquifyMode;
  readonly pageId: string;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly points: readonly StudioRasterRetouchGesturePoint[];
  readonly released: boolean;
  readonly runId: number;
  readonly tool: StudioRasterRetouchGestureTool;
}

export const STUDIO_PENDING_RETOUCH_MAX_POINTS = 8_192;

function pointerId(pointer: StudioRasterRetouchGesturePointer): number {
  return Number.isFinite(pointer.pointerId) ? Number(pointer.pointerId) : 1;
}

function pointWithPressure(
  point: { readonly x: number; readonly y: number },
  pointer: StudioRasterRetouchGesturePointer,
): StudioRasterRetouchGesturePoint {
  const pressure = pointer.pointerType === "pen" && Number.isFinite(pointer.pressure)
    ? Math.min(1, Math.max(0, Number(pointer.pressure)))
    : undefined;
  return pressure === undefined ? point : { ...point, pressure };
}

export function beginStudioPendingRasterRetouchGesture(input: {
  readonly liquifyMode: StudioLiquifyMode;
  readonly pageId: string;
  readonly point: { readonly x: number; readonly y: number };
  readonly pointer: StudioRasterRetouchGesturePointer;
  readonly runId: number;
  readonly tool: StudioRasterRetouchGestureTool;
}): StudioPendingRasterRetouchGesture | null {
  if (input.pointer.isPrimary === false) return null;
  if (typeof input.pointer.button === "number" && input.pointer.button !== 0) return null;
  return {
    cancelled: false,
    liquifyMode: input.liquifyMode,
    pageId: input.pageId,
    pointerId: pointerId(input.pointer),
    pointerType: input.pointer.pointerType || "mouse",
    points: [pointWithPressure(input.point, input.pointer)],
    released: false,
    runId: input.runId,
    tool: input.tool,
  };
}

export function appendStudioPendingRasterRetouchGesturePoint(
  gesture: StudioPendingRasterRetouchGesture,
  pointer: StudioRasterRetouchGesturePointer,
  point: { readonly x: number; readonly y: number },
  minimumDistance = 1,
): StudioPendingRasterRetouchGesture {
  if (gesture.released || gesture.cancelled || pointerId(pointer) !== gesture.pointerId) {
    return gesture;
  }
  const next = pointWithPressure(point, pointer);
  const last = gesture.points.at(-1);
  if (last && Math.hypot(next.x - last.x, next.y - last.y) < minimumDistance) {
    return gesture;
  }
  const points = gesture.points.length < STUDIO_PENDING_RETOUCH_MAX_POINTS
    ? [...gesture.points, next]
    : [...gesture.points.slice(0, STUDIO_PENDING_RETOUCH_MAX_POINTS - 1), next];
  return { ...gesture, points };
}

export function endStudioPendingRasterRetouchGesture(
  gesture: StudioPendingRasterRetouchGesture,
  pointer: StudioRasterRetouchGesturePointer,
  options: {
    readonly cancelled: boolean;
    readonly releasePoint?: { readonly x: number; readonly y: number };
  },
): StudioPendingRasterRetouchGesture {
  if (pointerId(pointer) !== gesture.pointerId) return gesture;
  const withRelease = options.releasePoint
    ? appendStudioPendingRasterRetouchGesturePoint(
        gesture,
        pointer,
        options.releasePoint,
        1e-6,
      )
    : gesture;
  return {
    ...withRelease,
    cancelled: options.cancelled,
    released: true,
  };
}

export function normalizeStudioPendingRasterRetouchGesture(
  gesture: StudioPendingRasterRetouchGesture,
  frame: SelectionFrame,
): readonly SelPoint[] {
  return gesture.points.map((point) => {
    const normalized = canvasPointToNormalized(point.x, point.y, frame);
    return point.pressure === undefined
      ? normalized
      : { ...normalized, pressure: point.pressure };
  });
}

export function canApplyStudioPendingRasterRetouchGesture(
  gesture: StudioPendingRasterRetouchGesture,
  normalizedPoints: readonly SelPoint[],
): boolean {
  if (gesture.cancelled || !gesture.released) return false;
  if (gesture.tool === "smudge") return normalizedPoints.length >= 2;
  if (gesture.tool === "liquify" && gesture.liquifyMode === "push") {
    return normalizedPoints.length >= 2;
  }
  return normalizedPoints.length >= 1;
}
