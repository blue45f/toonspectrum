import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import type { Resizable } from "@/shared/hooks/use-resizable";

import {
  useStudioInspectorDockSide,
  type StudioInspectorDockSide,
} from "../studio-inspector-dock";

export interface StudioInspectorDockResize {
  readonly inspectorDockSide: StudioInspectorDockSide;
  readonly inspectorHandleProps: Resizable["handleProps"];
  readonly inspectorHandleDragging: boolean;
}

interface DockTap {
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

/**
 * 작업 패널 스플리터의 도킹 방향 어댑터.
 *
 * 왼쪽 도킹에서는 스플리터가 패널의 오른쪽 가장자리(캔버스 쪽)에 붙는다. 호스트가
 * 만든 rightResize는 오른쪽 도킹(edge "left": 왼쪽으로 끌면 넓어짐) 기준이라 그대로
 * 쓰면 드래그·화살표 방향이 거꾸로 느껴진다. 왼쪽 도킹일 때만 같은 너비 상태
 * (setWidth)에 방향을 맞춘 어댑터를 쓰고, 더블클릭·더블탭 기본 너비 복원과 aria
 * 값은 방향과 무관하므로 원본 handleProps를 그대로 재사용한다.
 * StudioCuttoonEditorInspectorColumn에서 분리했다.
 */
export function useStudioInspectorDockResize(
  rightResize: Resizable,
): StudioInspectorDockResize {
  const inspectorDockSide = useStudioInspectorDockSide();
  const [dockResizeDragging, setDockResizeDragging] = useState(false);
  const dockDragCleanupRef = useRef<(() => void) | null>(null);
  const dockLastTapRef = useRef<DockTap | null>(null);
  useEffect(
    () => () => {
      dockDragCleanupRef.current?.();
      dockDragCleanupRef.current = null;
    },
    [],
  );
  const onDockResizePointerDown = (event: ReactPointerEvent) => {
    if (
      event.isPrimary === false ||
      (typeof event.button === "number" && event.button !== 0)
    )
      return;
    dockDragCleanupRef.current?.();
    const pointerType = event.pointerType || "mouse";
    const target =
      event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    target?.focus({ preventScroll: true });
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = Number.isFinite(event.clientY) ? event.clientY : 0;
    const startWidth = rightResize.width;
    let latestClientX = startX;
    let latestClientY = startY;
    let finished = false;
    setDockResizeDragging(true);
    const applyPendingWidth = () => {
      rightResize.setWidth(startWidth + (latestClientX - startX));
    };
    const finish = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== pointerId) return;
      if (finished) return;
      finished = true;
      const endedWithPointerUp = ev?.type === "pointerup";
      if (endedWithPointerUp) {
        latestClientX = Number.isFinite(ev.clientX)
          ? ev.clientX
          : latestClientX;
        latestClientY = Number.isFinite(ev.clientY)
          ? ev.clientY
          : latestClientY;
        applyPendingWidth();
        if (pointerType !== "mouse") {
          const travel = Math.hypot(
            latestClientX - startX,
            latestClientY - startY,
          );
          if (travel <= 8) {
            const now = Date.now();
            const previousTap = dockLastTapRef.current;
            const isDoubleTap = Boolean(
              previousTap &&
                now - previousTap.at <= 350 &&
                Math.hypot(
                  latestClientX - previousTap.x,
                  latestClientY - previousTap.y,
                ) <= 24,
            );
            if (isDoubleTap) {
              dockLastTapRef.current = null;
              rightResize.handleProps.onDoubleClick();
            } else {
              dockLastTapRef.current = {
                at: now,
                x: latestClientX,
                y: latestClientY,
              };
            }
          } else {
            dockLastTapRef.current = null;
          }
        }
      } else if (ev?.type === "pointercancel") {
        dockLastTapRef.current = null;
      }
      setDockResizeDragging(false);
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", finish);
      globalThis.removeEventListener("pointercancel", finish);
      globalThis.removeEventListener("blur", onBlur);
      target?.removeEventListener("lostpointercapture", finish);
      try {
        if (target?.hasPointerCapture(pointerId))
          target.releasePointerCapture(pointerId);
      } catch {
        // 포인터 캡처를 지원하지 않는 내장 브라우저에서는 전역 리스너만으로 충분하다.
      }
      if (dockDragCleanupRef.current === cleanup)
        dockDragCleanupRef.current = null;
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      latestClientX = ev.clientX;
      latestClientY = Number.isFinite(ev.clientY) ? ev.clientY : latestClientY;
      applyPendingWidth();
    };
    const onBlur = () => finish();
    const cleanup = () => finish();
    dockDragCleanupRef.current = cleanup;
    try {
      target?.setPointerCapture(pointerId);
    } catch {
      // 캡처가 없어도 아래 전역 리스너로 드래그는 동작한다.
    }
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", finish);
    globalThis.addEventListener("pointercancel", finish);
    globalThis.addEventListener("blur", onBlur);
    target?.addEventListener("lostpointercapture", finish);
  };
  const onDockResizeKeyDown = (event: ReactKeyboardEvent) => {
    // 왼쪽 도킹의 넓히기/좁히기는 오른쪽 도킹과 좌우가 반대다. 화살표만 맞바꿔
    // 원본 핸들러에 위임하면 Home/End/Enter(기본 너비) 계약은 그대로 유지된다.
    const swappedKey =
      event.key === "ArrowLeft"
        ? "ArrowRight"
        : event.key === "ArrowRight"
          ? "ArrowLeft"
          : event.key;
    if (swappedKey === event.key) {
      rightResize.handleProps.onKeyDown(event);
      return;
    }
    // use-resizable의 onKeyDown은 key와 preventDefault만 소비한다 (실측).
    const swappedEvent: Pick<ReactKeyboardEvent, "key" | "preventDefault"> = {
      key: swappedKey,
      preventDefault: () => event.preventDefault(),
    };
    rightResize.handleProps.onKeyDown(swappedEvent as ReactKeyboardEvent);
  };
  const inspectorHandleProps =
    inspectorDockSide === "left"
      ? {
          ...rightResize.handleProps,
          onPointerDown: onDockResizePointerDown,
          onKeyDown: onDockResizeKeyDown,
        }
      : rightResize.handleProps;
  const inspectorHandleDragging =
    inspectorDockSide === "left" ? dockResizeDragging : rightResize.dragging;
  return { inspectorDockSide, inspectorHandleProps, inspectorHandleDragging };
}
