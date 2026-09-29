import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

export interface SpectacleSkeletonProps {
  /** 로딩 중인지. */
  loading: boolean;
  children: ReactNode;
  className?: string;
  /** 스켈레톤 모양 (기본: 자식 영역 크기). */
  skeletonClassName?: string;
  /** 스켈레톤 접근성 라벨. */
  label?: string;
}

/**
 * 스켈레톤 → 실제 콘텐츠 모핑.
 *
 * - loading: 쉬머 스켈레톤 표시
 * - 로딩 완료: 블러+스케일+페이드로 부드럽게 모핑
 * - motion 꺼져 있으면 쉬머 없이 정적 스켈레톤
 */
export function SpectacleSkeleton({
  loading,
  children,
  className,
  skeletonClassName,
  label,
}: SpectacleSkeletonProps) {
  const { level } = useSpectacle();

  if (!loading) {
    return (
      <div
        key="content"
        className={cn(level !== "none" && "spectacle-morph-enter", className)}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn("spectacle-skeleton", level !== "none" && "spectacle-motion", skeletonClassName, className)}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}
