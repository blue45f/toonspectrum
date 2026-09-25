/**
 * 통합 Studio와 Draw의 두/세/네 손가락 탭을 캔버스 래퍼 한 곳에서 처리한다.
 * 터치 이벤트만 구독하므로 모바일과 터치 노트북에 같은 사용자 설정을 적용한다.
 * 다른 캔버스 제스처가 소유 중이거나 뷰 도구 HUD를 눌렀으면 후보를 버린다.
 * 손가락이 12px 넘게 움직였거나 320ms를 넘기면 탭으로 치지 않는다.
 */

import { useEffect } from "react";

import { isStudioViewToolsHudEventTarget } from "./studio-page-shell-runtime";
import { resolveStudioTouchTapAction } from "./studio-cuttoon-editor/studio-touch-gesture-policy";

import type { StudioAppSettings } from "./studio-app-settings";
import type { RefObject } from "react";

/** 제스처가 부를 동작. 호스트가 매 렌더 갱신하는 ref 로 넘어와 최신 클로저를 본다. */
export type StudioMobileHistoryGestureActions = {
  undo: () => void;
  toggleUi: () => void;
};

export function useStudioMobileHistoryTouchGestures({
  surfaceRef,
  canvasPointerGestureIsOwned,
  appSettingsRef,
  gestureRef,
}: {
  readonly surfaceRef: RefObject<HTMLDivElement | null>;
  readonly canvasPointerGestureIsOwned: () => boolean;
  readonly appSettingsRef: RefObject<StudioAppSettings>;
  readonly gestureRef: RefObject<StudioMobileHistoryGestureActions>;
}): void {
  // 최신 설정과 명령은 ref에서 읽어 렌더 중에도 진행 중인 탭 후보를 유지한다.
  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return;
    let candidate: {
      count: 2 | 3 | 4;
      startedAt: number;
      points: Map<number, { x: number; y: number }>;
      moved: boolean;
    } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      if (event.defaultPrevented || isStudioViewToolsHudEventTarget(event.target)) {
        candidate = null;
        return;
      }
      if (canvasPointerGestureIsOwned()) {
        candidate = null;
        return;
      }
      if (event.touches.length !== 2 && event.touches.length !== 3 && event.touches.length !== 4) {
        candidate = null;
        return;
      }
      if (!resolveStudioTouchTapAction(event.touches.length, appSettingsRef.current.touch)) {
        candidate = null;
        return;
      }
      candidate = {
        count: event.touches.length,
        startedAt: performance.now(),
        points: new Map(
          Array.from(event.touches).map((touch) => [
            touch.identifier,
            { x: touch.clientX, y: touch.clientY },
          ])
        ),
        moved: false,
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!candidate || event.defaultPrevented || canvasPointerGestureIsOwned()
        || event.touches.length !== candidate.count) {
        candidate = null;
        return;
      }
      for (const touch of Array.from(event.touches)) {
        const start = candidate.points.get(touch.identifier);
        if (!start || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 12) {
          candidate.moved = true;
          break;
        }
      }
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!candidate) return;
      if (event.touches.length > 0) return;
      const completed = !candidate.moved && performance.now() - candidate.startedAt <= 320;
      const count = candidate.count;
      candidate = null;
      if (!completed || event.defaultPrevented || canvasPointerGestureIsOwned()) return;
      const action = resolveStudioTouchTapAction(count, appSettingsRef.current.touch);
      if (!action) return;
      event.preventDefault();
      if (action === "undo") gestureRef.current.undo();
      else gestureRef.current.toggleUi();
      if (typeof globalThis.navigator?.vibrate === "function") globalThis.navigator.vibrate(8);
    };
    const onTouchCancel = () => {
      candidate = null;
    };
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    node.addEventListener("touchend", onTouchEnd, { passive: false });
    node.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [canvasPointerGestureIsOwned, surfaceRef, appSettingsRef, gestureRef]);
}
