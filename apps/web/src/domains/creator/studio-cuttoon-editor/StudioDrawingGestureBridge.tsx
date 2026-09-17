import { useEffect } from "react";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

interface GestureState {
  count: number;
  startedAt: number;
  moved: boolean;
  points: Map<number, { x: number; y: number }>;
}

const TAP_DURATION_MS = 280;
const TAP_MOVE_TOLERANCE_PX = 18;

/**
 * Pro drawing gesture projection shared by browser and installed-app presentations.
 *
 * - two-finger tap: undo (Procreate muscle memory)
 * - three-finger tap: redo
 * - four-finger tap: canvas-only (Krita canvas-only gesture parity)
 *
 * Pinch/rotate remain untouched: this bridge never prevents default browser/canvas behavior and
 * cancels the tap candidate as soon as any participating finger moves beyond the tolerance.
 */
export function StudioDrawingGestureBridge({
  enabled,
  session,
}: {
  readonly enabled: boolean;
  readonly session: StudioCuttoonEditorViewSession;
}) {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.getElementById("studio-workspace");
    if (!root) return undefined;

    let gesture: GestureState | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (![2, 3, 4].includes(event.touches.length)) {
        gesture = null;
        return;
      }
      gesture = {
        count: event.touches.length,
        startedAt: performance.now(),
        moved: false,
        points: new Map(
          Array.from(event.touches, (touch) => [
            touch.identifier,
            { x: touch.clientX, y: touch.clientY },
          ]),
        ),
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length > gesture.count) {
        gesture = null;
        return;
      }
      for (const touch of Array.from(event.touches)) {
        const origin = gesture.points.get(touch.identifier);
        if (!origin) continue;
        if (Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > TAP_MOVE_TOLERANCE_PX) {
          gesture.moved = true;
          return;
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!gesture || event.touches.length > 0) return;
      const candidate = gesture;
      gesture = null;
      if (candidate.moved || performance.now() - candidate.startedAt > TAP_DURATION_MS) return;

      if (candidate.count === 2) {
        session.undo?.();
        session.announceDrawingShortcut?.("두 손가락 탭 · 실행 취소");
        return;
      }
      if (candidate.count === 3) {
        session.redo?.();
        session.announceDrawingShortcut?.("세 손가락 탭 · 다시 실행");
        return;
      }
      session.setCanvasOnlyMode?.((value: boolean) => !value);
      session.announceDrawingShortcut?.("네 손가락 탭 · 캔버스만 보기 전환");
    };

    const cancel = () => { gesture = null; };
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", cancel);
    };
  }, [enabled, session]);

  return null;
}
