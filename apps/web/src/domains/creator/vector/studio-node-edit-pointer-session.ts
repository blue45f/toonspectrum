import type { DrawEl } from "../studio-element-model";
import type { NodeDragSession } from "../studio-node-edit";

export interface StudioNodeEditPointerSession {
  readonly elId: string;
  readonly session: NodeDragSession;
  readonly pointerId: number;
  readonly captureTarget: Element | null;
  readonly sourcePoints: readonly number[];
  readonly sourcePressures: readonly number[];
}

export function studioNodeEditPointerId(event: { readonly pointerId?: number }): number {
  return Number.isFinite(event.pointerId) ? event.pointerId! : 1;
}

export function ownsStudioNodeEditPointer(
  drag: StudioNodeEditPointerSession,
  event: { readonly pointerId?: number },
): boolean {
  return drag.pointerId === studioNodeEditPointerId(event);
}

export function captureStudioNodeEditPointer(
  source: DrawEl,
  session: NodeDragSession,
  event: PointerEvent,
): StudioNodeEditPointerSession {
  const pointerId = studioNodeEditPointerId(event);
  const captureTarget = typeof Element !== "undefined" && event.target instanceof Element
    ? event.target : null;
  try { captureTarget?.setPointerCapture(pointerId); }
  catch { /* Detached targets and legacy mouse events still use the owner/end-event guard. */ }
  return {
    elId: source.id, session, pointerId, captureTarget,
    sourcePoints: [...source.points], sourcePressures: [...(source.pressures ?? [])],
  };
}

export function releaseStudioNodeEditPointer(drag: StudioNodeEditPointerSession | null): void {
  try { drag?.captureTarget?.releasePointerCapture(drag.pointerId); }
  catch { /* The browser may already have released capture on cancel or lost capture. */ }
}

/** A remote edit or undo after the last preview must not be replaced by this older draft. */
export function studioNodeEditSourceMatches(drag: StudioNodeEditPointerSession, current: DrawEl): boolean {
  const pressures = current.pressures ?? [];
  return current.id === drag.elId
    && current.points.length === drag.sourcePoints.length
    && current.points.every((value, index) => value === drag.sourcePoints[index])
    && pressures.length === drag.sourcePressures.length
    && pressures.every((value, index) => value === drag.sourcePressures[index]);
}

export interface StudioNodeEditPointerState {
  readonly nodeEditDragRef: { current: StudioNodeEditPointerSession | null };
  readonly pendingNodeEditDraftRef: { current: { elId: string; points: number[]; pressures: number[] } | null };
  readonly nodeEditRafRef: { current: number | null };
  readonly setNodeEditDraft: (draft: null) => void;
}

export function cancelStudioNodeEditPointer(state: StudioNodeEditPointerState): void {
  const drag = state.nodeEditDragRef.current;
  state.nodeEditDragRef.current = null;
  state.pendingNodeEditDraftRef.current = null;
  if (state.nodeEditRafRef.current !== null) {
    globalThis.cancelAnimationFrame(state.nodeEditRafRef.current);
    state.nodeEditRafRef.current = null;
  }
  state.setNodeEditDraft(null);
  releaseStudioNodeEditPointer(drag);
}
