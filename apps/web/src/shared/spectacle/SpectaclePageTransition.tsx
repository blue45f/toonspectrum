import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

export interface SpectaclePageTransitionProps {
  children: ReactNode;
  className?: string;
  /**
   * 전환을 구분하는 키 (예: 라우트 경로).
   * 키가 바뀌면 exit(페이드+블러 아웃) → enter(슬라이드+블러 인) 순서로 전환된다.
   */
  transitionKey: string;
  /** exit 단계 ms (기본 160). */
  exitMs?: number;
}

/**
 * 페이지 전환 래퍼.
 *
 * - transitionKey 변경 시: 이전 화면 스냅샷이 빠르게 페이드+블러 아웃된 뒤
 *   새 화면이 아래에서 위로 슬라이드+블러 인
 * - exit 중에는 이전 스냅샷을 유지해 깜빡임을 방지한다
 * - motion 꺼져 있으면 즉시 교체 (애니메이션 없음)
 * - transform/opacity/filter만 사용해 GPU 가속
 */
export function SpectaclePageTransition({
  children,
  className,
  transitionKey,
  exitMs = 160,
}: SpectaclePageTransitionProps) {
  const { motion } = useSpectacle();
  const [displayKey, setDisplayKey] = useState(transitionKey);
  const [snapshot, setSnapshot] = useState<ReactNode>(children);
  const [leaving, setLeaving] = useState(false);
  // children identity가 매 렌더 바뀔 수 있어 ref에 최신값을 보관한다.
  // 이렇게 하면 exit 타이머가 부모 리렌더에 흔들리지 않는다.
  const latestChildren = useRef(children);
  latestChildren.current = children;

  useEffect(() => {
    if (transitionKey === displayKey) {
      setLeaving(false);
      return;
    }
    if (!motion) {
      // 애니메이션 꺼짐: 즉시 교체
      setDisplayKey(transitionKey);
      setSnapshot(latestChildren.current);
      setLeaving(false);
      return;
    }
    // exit 단계: 이전 스냅샷을 보여주며 페이드 아웃
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setDisplayKey(transitionKey);
      setSnapshot(latestChildren.current);
      setLeaving(false);
    }, exitMs);
    return () => window.clearTimeout(timer);
  }, [transitionKey, displayKey, motion, exitMs]);

  return (
    <div
      key={displayKey}
      className={cn(
        "spectacle-page",
        motion && (leaving ? "spectacle-page-exit" : "spectacle-page-enter"),
        className,
      )}
    >
      {leaving ? snapshot : children}
    </div>
  );
}
