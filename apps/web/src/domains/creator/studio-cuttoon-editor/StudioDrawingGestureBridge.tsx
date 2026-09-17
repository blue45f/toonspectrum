import { useEffect } from "react";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

interface GestureState {
  count: 2 | 3 | 4;
  startedAt: number;
  moved: boolean;
  points: Map<number, { x: number; y: number }>;
}

const TAP_DURATION_MS = 280;
const TAP_MOVE_TOLERANCE_PX = 18;

/**
 * Professional touch gestures shared by integrated Studio and ToonStudio Draw.
 *
 * Existing Studio touch preferences remain authoritative:
 * - two fingers run undo only when `twoFinger=undo-redo`; `pan-zoom` is left untouched;
 * - three fingers follow the user's `undo | toggle-ui | none` preference;
 * - four fingers add a non-document canvas-only toggle inspired by dedicated art apps.
 *
 * Pinch/rotate remain untouched: candidates are cancelled after real movement and this bridge
 * never takes ownership during touchmove. The recognized tap is suppressed only at touchend.
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
      const count = event.touches.length;
      if (count !== 2 && count !== 3 && count !== 4) {
        gesture = null;
        return;
      }
      const touchPrefs = session.appSettings?.touch;
      if (
        (count === 2 && touchPrefs?.twoFinger !== "undo-redo")
        || (count === 3 && touchPrefs?.threeFinger === "none")
      ) {
        gesture = null;
        return;
      }
      gesture = {
        count,
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
      if (event.touches.length !== gesture.count) {
        gesture = null;
        return;
      }
      for (const touch of Array.from(event.touches)) {
        const origin = gesture.points.get(touch.identifier);
        if (!origin) {
          gesture = null;
          return;
        }
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

      const touchPrefs = session.appSettings?.touch;
      if (candidate.count === 2 && touchPrefs?.twoFinger === "undo-redo") {
        event.preventDefault();
        session.undo?.();
        session.announceDrawingShortcut?.("두 손가락 탭 · 실행 취소");
        return;
      }
      if (candidate.count === 3 && touchPrefs?.threeFinger === "undo") {
        event.preventDefault();
        session.undo?.();
        session.announceDrawingShortcut?.("세 손가락 탭 · 실행 취소");
        return;
      }
      if (candidate.count === 3 && touchPrefs?.threeFinger === "toggle-ui") {
        event.preventDefault();
        session.setCanvasOnlyMode?.((value: boolean) => !value);
        session.announceDrawingShortcut?.("세 손가락 탭 · 캔버스 UI 전환");
        return;
      }
      if (candidate.count === 4) {
        event.preventDefault();
        session.setCanvasOnlyMode?.((value: boolean) => !value);
        session.announceDrawingShortcut?.("네 손가락 탭 · 캔버스만 보기 전환");
      }
    };

    const cancel = () => { gesture = null; };
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: false });
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
