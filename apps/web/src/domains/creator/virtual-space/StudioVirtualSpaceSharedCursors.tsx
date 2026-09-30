import { useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { useStudioPrefersReducedMotion } from "./studio-virtual-space-reduced-motion";
import {
  lerpSharedCursorPosition,
  STUDIO_SHARED_CURSOR_LERP_ALPHA,
} from "./studio-virtual-space-shared-cursors";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 오버레이에 렌더링할 피어 커서 뷰 모델. */
export interface StudioSharedCursorView {
  readonly sessionId: string;
  readonly displayName: string;
  /** `#rrggbb` 커서 색상. */
  readonly color: string;
  /** 스크린 좌표(px). */
  readonly x: number;
  readonly y: number;
  /** true면 렌더링하지 않는다 (idle/화면 밖). */
  readonly hidden: boolean;
}

export interface StudioVirtualSpaceSharedCursorsProps {
  readonly cursors: readonly StudioSharedCursorView[];
  readonly selfSessionId?: string;
}

type Bilingual = (ko: string, en: string) => string;

/**
 * 목표 좌표를 향해 커서 위치를 보간한다.
 *
 * - 일반 모드: rAF + lerp로 부드럽게 따라간다.
 * - reduced-motion: 전환 없이 목표 좌표에 바로 스냅한다.
 * - rAF가 없는 환경에서도 목표 좌표에 바로 렌더링한다.
 */
function useSharedCursorPositions(
  targets: readonly StudioSharedCursorView[],
  reducedMotion: boolean,
): ReadonlyMap<string, StudioVirtualSpacePoint> {
  const [positions, setPositions] = useState<ReadonlyMap<string, StudioVirtualSpacePoint>>(
    () => new Map(targets.map((cursor) => [cursor.sessionId, { x: cursor.x, y: cursor.y }])),
  );
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    const currentTargets = targetsRef.current;
    if (reducedMotion || typeof globalThis.requestAnimationFrame !== "function") {
      setPositions(new Map(currentTargets.map((cursor) => [cursor.sessionId, { x: cursor.x, y: cursor.y }])));
      return;
    }
    let frame = 0;
    const step = () => {
      let settled = true;
      setPositions((current) => {
        const next = new Map(current);
        for (const cursor of targetsRef.current) {
          const from = next.get(cursor.sessionId) ?? { x: cursor.x, y: cursor.y };
          const to = lerpSharedCursorPosition(from, { x: cursor.x, y: cursor.y }, STUDIO_SHARED_CURSOR_LERP_ALPHA);
          next.set(cursor.sessionId, to);
          if (to.x !== cursor.x || to.y !== cursor.y) settled = false;
        }
        for (const sessionId of [...next.keys()]) {
          if (!targetsRef.current.some((cursor) => cursor.sessionId === sessionId)) {
            next.delete(sessionId);
          }
        }
        return next;
      });
      if (!settled) {
        frame = globalThis.requestAnimationFrame(step);
      }
    };
    frame = globalThis.requestAnimationFrame(step);
    return () => globalThis.cancelAnimationFrame(frame);
  }, [targets, reducedMotion]);

  return positions;
}

/** 개별 피어 커서 마크: 화살표 + 색상 헤일로 + 이름표. */
function SharedCursorMark({
  cursor,
  position,
  reducedMotion,
}: {
  readonly cursor: StudioSharedCursorView;
  readonly position: StudioVirtualSpacePoint;
  readonly reducedMotion: boolean;
}) {
  return (
    <div
      data-testid={`shared-cursor-${cursor.sessionId}`}
      data-cursor-color={cursor.color}
      className="absolute left-0 top-0 animate-fade-in motion-reduce:animate-none motion-reduce:transition-none"
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: reducedMotion ? "none" : undefined,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -left-1.5 -top-1.5 h-7 w-7 rounded-full opacity-30 blur-md motion-reduce:hidden"
        style={{ backgroundColor: cursor.color }}
      />
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={cursor.color}
        stroke="#ffffff"
        strokeWidth="1.5"
        aria-hidden="true"
        className="relative drop-shadow-sm"
      >
        <path d="M5 3l14 7-6.5 1.5L9 18 5 3z" />
      </svg>
      <span
        className={cn(
          "relative ml-4 -mt-1 inline-block max-w-[120px] truncate rounded-full px-2 py-0.5",
          "text-[11px] font-medium leading-4 text-white shadow-sm",
          "dark:text-neutral-950",
        )}
        style={{ backgroundColor: cursor.color }}
      >
        {cursor.displayName}
      </span>
    </div>
  );
}

function buildScreenReaderSummary(
  bt: Bilingual,
  visible: readonly StudioSharedCursorView[],
): string {
  if (visible.length === 0) {
    return bt("공유 중인 커서가 없어요.", "No shared cursors.");
  }
  const names = visible.map((cursor) => cursor.displayName).join(", ");
  return bt(`${names}님의 커서가 보여요.`, `Showing cursors from ${names}.`);
}

/**
 * 다른 참가자의 공유 커서를 이름표와 함께 보여주는 오버레이.
 *
 * - 포인터 이벤트를 가로채지 않는다 (`pointer-events-none`).
 * - 일반 모드에서는 rAF + lerp로 부드럽게 따라가고,
 *   reduced-motion에서는 전환 없이 목표 좌표에 바로 렌더링한다.
 * - 스크린 리더에는 장식 요소로 숨기고, 이름 목록만 별도 텍스트로 제공한다.
 */
export function StudioVirtualSpaceSharedCursors({
  cursors,
  selfSessionId,
}: StudioVirtualSpaceSharedCursorsProps) {
  const bt = useBilingual("StudioVirtualSpaceSharedCursors");
  const reducedMotion = useStudioPrefersReducedMotion();

  const visible = useMemo(
    () => cursors.filter((cursor) => !cursor.hidden && cursor.sessionId !== selfSessionId),
    [cursors, selfSessionId],
  );
  const positions = useSharedCursorPositions(visible, reducedMotion);
  const srSummary = buildScreenReaderSummary(bt, visible);

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        data-testid="shared-cursors-overlay"
      >
        {visible.map((cursor) => (
          <SharedCursorMark
            key={cursor.sessionId}
            cursor={cursor}
            position={positions.get(cursor.sessionId) ?? { x: cursor.x, y: cursor.y }}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
      <p className="sr-only">{srSummary}</p>
    </>
  );
}
