import { useCallback, useRef, useState } from "react";

import {
  clampProcessCompareSlider,
  moveProcessCompareSlider,
  processCompareSliderClip,
  processCompareSliderStep,
} from "./process-compare-model";

export interface ProcessCompareSliderDrag {
  /** 현재 슬라이더 위치(%) — aria 값 동기화용. */
  readonly position: number;
  readonly stageRef: React.RefObject<HTMLDivElement | null>;
  readonly handleRef: React.RefObject<HTMLDivElement | null>;
  readonly beforeRef: React.RefObject<HTMLDivElement | null>;
  /** 드래그 중이면 true — 핸들의 data-dragging 속성에 연결한다. */
  readonly isDragging: boolean;
  readonly onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: () => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * 비포·애프터 슬라이더 드래그 상태.
 *
 * 드래그 중에는 핸들 위치와 이전 레이어의 clip-path를 DOM에 직접 써서
 * 불필요한 리렌더 없이 60fps를 노린다. position state는 aria 값 동기화용으로만 갱신한다.
 */
export function useProcessCompareSliderDrag(): ProcessCompareSliderDrag {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const beforeRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const applyDom = useCallback((next: number) => {
    const clamped = clampProcessCompareSlider(next);
    if (handleRef.current) handleRef.current.style.left = `${clamped}%`;
    if (beforeRef.current) beforeRef.current.style.clipPath = processCompareSliderClip(clamped);
  }, []);

  const positionFromClientX = useCallback((clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return 50;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return 50;
    return clampProcessCompareSlider(((clientX - rect.left) / rect.width) * 100);
  }, []);

  const commitPosition = useCallback(
    (next: number) => {
      const clamped = clampProcessCompareSlider(next);
      applyDom(clamped);
      setPosition(clamped);
    },
    [applyDom],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      setIsDragging(true);
      try {
        // pointer capture 미지원 환경(jsdom 등)에서는 스테이지 리스너로도 드래그가 동작하므로 무시
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
      commitPosition(positionFromClientX(event.clientX));
    },
    [commitPosition, positionFromClientX],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      commitPosition(positionFromClientX(event.clientX));
    },
    [isDragging, commitPosition, positionFromClientX],
  );

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = processCompareSliderStep(event.shiftKey);
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setPosition((prev) => {
          const next = moveProcessCompareSlider(prev, event.key === "ArrowLeft" ? -step : step);
          applyDom(next);
          return next;
        });
      } else if (event.key === "Home") {
        event.preventDefault();
        commitPosition(0);
      } else if (event.key === "End") {
        event.preventDefault();
        commitPosition(100);
      }
    },
    [applyDom, commitPosition],
  );

  return {
    position,
    stageRef,
    handleRef,
    beforeRef,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
  };
}
