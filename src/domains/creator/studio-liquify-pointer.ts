import type { SelectionFrame, SelPoint } from "./studio-selection-tools";

export interface StudioLiquifyPointerLike {
  pointerId?: number;
  pointerType?: string;
  isPrimary?: boolean;
}

export interface StudioLiquifyPointerSession {
  elId: string;
  frame: SelectionFrame;
  points: SelPoint[];
  pointerId: number;
  pointerType: string;
}

export type StudioLiquifyPointerEnd =
  | { kind: "ignored"; session: StudioLiquifyPointerSession }
  | { kind: "cancelled" | "discarded"; session: null }
  | { kind: "apply"; session: null; elId: string; points: SelPoint[] };

function pointerId(pointer: StudioLiquifyPointerLike): number {
  return Number.isFinite(pointer.pointerId) ? Number(pointer.pointerId) : 1;
}

export function beginStudioLiquifyPointerSession(input: {
  elId: string;
  frame: SelectionFrame;
  point: SelPoint;
  pointer: StudioLiquifyPointerLike;
}): StudioLiquifyPointerSession | null {
  if (input.pointer.isPrimary === false) return null;
  return {
    elId: input.elId,
    frame: input.frame,
    points: [input.point],
    pointerId: pointerId(input.pointer),
    pointerType: input.pointer.pointerType || "mouse",
  };
}

export function isStudioLiquifyPointerOwner(
  session: StudioLiquifyPointerSession,
  pointer: StudioLiquifyPointerLike
): boolean {
  return session.pointerId === pointerId(pointer);
}

export function appendStudioLiquifyPointerPoint(
  session: StudioLiquifyPointerSession,
  pointer: StudioLiquifyPointerLike,
  point: SelPoint,
  minimumDistance = 0.002
): StudioLiquifyPointerSession {
  if (!isStudioLiquifyPointerOwner(session, pointer)) return session;
  const last = session.points.at(-1);
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < minimumDistance) return session;
  return { ...session, points: [...session.points, point] };
}

export function endStudioLiquifyPointerSession(
  session: StudioLiquifyPointerSession,
  pointer: StudioLiquifyPointerLike,
  options: { cancelled: boolean; releasePoint?: SelPoint }
): StudioLiquifyPointerEnd {
  if (!isStudioLiquifyPointerOwner(session, pointer)) return { kind: "ignored", session };
  if (options.cancelled) return { kind: "cancelled", session: null };

  let points = session.points;
  const last = points.at(-1);
  const release = options.releasePoint;
  if (release && (!last || Math.hypot(release.x - last.x, release.y - last.y) > 1e-6)) {
    // The lift sample bypasses move throttling: a quick down→up drag still has a direction vector.
    points = [...points, release];
  }
  if (points.length < 2) return { kind: "discarded", session: null };
  return { kind: "apply", session: null, elId: session.elId, points };
}
