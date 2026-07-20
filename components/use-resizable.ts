
import { useEffect, useRef, useState } from "react";

type Edge = "left" | "right";

export interface ResizableOptions {
  /** 기본 너비(px). 저장된 값이 없을 때 사용. */
  initial: number;
  min: number;
  max: number;
  /**
   * 핸들이 패널의 어느 가장자리에 붙어 있는지.
   * - "right": 패널 오른쪽 가장자리 핸들(좌측 패널). 오른쪽으로 끌면 넓어짐.
   * - "left": 패널 왼쪽 가장자리 핸들(우측 패널). 왼쪽으로 끌면 넓어짐.
   */
  edge: Edge;
  /** localStorage 키. 주면 너비를 영속화한다. */
  storageKey?: string;
  /** 키보드 화살표 1회 이동량(px). 기본 16. */
  step?: number;
}

export interface Resizable {
  width: number;
  dragging: boolean;
  /** 드래그 핸들에 펼쳐 넣는 props (role=separator 포함, a11y 완비). */
  handleProps: {
    role: "separator";
    "aria-orientation": "vertical";
    "aria-valuenow": number;
    "aria-valuetext": string;
    "aria-valuemin": number;
    "aria-valuemax": number;
    tabIndex: 0;
    onPointerDown: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onDoubleClick: () => void;
  };
  setWidth: (w: number) => void;
}

const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 드래그(또는 키보드)로 패널 너비를 조절하는 스플리터 훅.
 * - 더블클릭으로 기본 너비로 리셋.
 * - 좌/우 화살표로 step씩 조절(접근성).
 * - 드래그 중 전역 pointermove/up을 듣고, 끝나면 정리한다.
 */
export function useResizable(options: ResizableOptions): Resizable {
  const { initial, min, max, edge, storageKey, step = 16 } = options;

  const [width, setWidthState] = useState<number>(() => {
    if (storageKey && typeof localStorage !== "undefined") {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= min && saved <= max) return saved;
    }
    return initial;
  });
  const [dragging, setDragging] = useState(false);
  const mountedRef = useRef(true);
  const activeDragCleanupRef = useRef<(() => void) | null>(null);

  const setWidth = (w: number) => setWidthState(clampTo(w, min, max));

  useEffect(() => {
    if (storageKey && typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, String(width));
    }
  }, [width, storageKey]);

  // 드래그 중에는 전역 커서/선택을 잠가 부드러운 리사이즈를 만든다(이펙트에서 안전하게 토글).
  useEffect(() => {
    if (!dragging || typeof document === "undefined") return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeDragCleanupRef.current?.();
      activeDragCleanupRef.current = null;
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    activeDragCleanupRef.current?.();
    // preventDefault가 브라우저의 기본 포커스 이동도 막으므로 직접 포커스를 준다.
    // 마우스/펜으로 폭을 조절한 뒤에도 화살표·Home·End 조작을 바로 이어갈 수 있다.
    const target = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    target?.focus({ preventScroll: true });
    e.preventDefault();
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startWidth = width;
    let latestClientX = startX;
    let frame: number | null = null;
    let finished = false;
    setDragging(true);

    const applyPendingWidth = () => {
      frame = null;
      const delta = edge === "left" ? startX - latestClientX : latestClientX - startX;
      setWidthState(clampTo(startWidth + delta, min, max));
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      latestClientX = ev.clientX;
      if (frame !== null) return;
      if (typeof globalThis.requestAnimationFrame === "function") {
        frame = globalThis.requestAnimationFrame(applyPendingWidth);
      } else {
        applyPendingWidth();
      }
    };
    const finish = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== pointerId) return;
      if (finished) return;
      finished = true;
      if (frame !== null && typeof globalThis.cancelAnimationFrame === "function") {
        globalThis.cancelAnimationFrame(frame);
        applyPendingWidth();
      }
      if (mountedRef.current) setDragging(false);
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", finish);
      globalThis.removeEventListener("pointercancel", finish);
      globalThis.removeEventListener("blur", onBlur);
      target?.removeEventListener("lostpointercapture", finish);
      try {
        if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture is optional in older embedded browsers.
      }
      if (activeDragCleanupRef.current === cleanup) activeDragCleanupRef.current = null;
    };
    const onBlur = () => finish();
    const cleanup = () => finish();
    activeDragCleanupRef.current = cleanup;
    try {
      target?.setPointerCapture(pointerId);
    } catch {
      // Global listeners below keep the drag functional without capture support.
    }
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", finish);
    globalThis.addEventListener("pointercancel", finish);
    globalThis.addEventListener("blur", onBlur);
    target?.addEventListener("lostpointercapture", finish);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // 패널 넓히기/좁히기 방향은 핸들 위치(edge)에 맞춘다.
    const grow = edge === "left" ? "ArrowLeft" : "ArrowRight";
    const shrink = edge === "left" ? "ArrowRight" : "ArrowLeft";
    if (e.key === grow) {
      e.preventDefault();
      setWidthState((w) => clampTo(w + step, min, max));
    } else if (e.key === shrink) {
      e.preventDefault();
      setWidthState((w) => clampTo(w - step, min, max));
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidthState(min);
    } else if (e.key === "End") {
      e.preventDefault();
      setWidthState(max);
    }
  };

  return {
    width,
    dragging,
    setWidth,
    handleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-valuenow": Math.round(width),
      "aria-valuetext": `${Math.round(width)}픽셀`,
      "aria-valuemin": min,
      "aria-valuemax": max,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick: () => setWidth(initial),
    },
  };
}
