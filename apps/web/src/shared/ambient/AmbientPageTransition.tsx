import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { cn } from "@/shared/lib/utils";

import { useAmbientPreferences, useReducedMotionPreference } from "./useAmbientExperience";

import "./ambient-effects.css";

export interface AmbientPageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * 라우트 변경 시 시네마틱 페이지 전환.
 *
 * - pathname이 바뀌면 콘텐츠에 페이드+상승+블러 해제 모션을 준다.
 * - 화려하게(vivid) 강도에서만 동작하고, 움직임 줄이기에서는 끈다.
 */
export function AmbientPageTransition({ children, className }: AmbientPageTransitionProps) {
  const { pathname } = useLocation();
  const { intensity } = useAmbientPreferences();
  const reducedMotion = useReducedMotionPreference();

  if (intensity !== "vivid" || reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div key={pathname} className={cn("ambient-page-enter", className)}>
      {children}
    </div>
  );
}
